// The mock API as one function from a `Request` to a `Response` (AD-2). MSW calls it in the browser and
// in Node tests; it knows nothing about either. The steps, in order: trace id, route, user (401), the
// request checked against the contract (400/422), the handler, the answer. Anything thrown is a 500
// with fixed words (SEC-9).
import type { CommandDeps } from "../../application/deps";
import type {
  Clock,
  IdGenerator,
  Logger,
  Metrics,
} from "../../application/ports";
import type { Repository } from "../../application/ports";
import {
  matchOperation,
  validateRequest,
  type BodyInput,
} from "../contract/validator";
import { actorOf } from "./actor";
import { DEMO_USER_HEADER } from "./demo-user";
import { handlers, type Reply } from "./operations";
import { problemResponse, type ProblemSpec } from "./problems";
import { traceIdOf } from "./trace";

/** Everything the mock needs from the outside. `main.tsx` and the tests build it. */
export interface MockServices {
  repository: Pick<Repository, "read" | "write" | "listDemoUsers">;
  clock: Clock;
  ids: IdGenerator;
  logger: Logger;
  metrics: Metrics;
  /** Makes a trace id when the request has none. Tests pass a fixed one. */
  newTraceId?: () => string;
}

/** Every log line of one request carries its trace id (AD-12). */
function tracedLogger(logger: Logger, traceId: string): Logger {
  return {
    info: (msg, fields) => logger.info(msg, { ...fields, traceId }),
    step: (name, work) => logger.step(name, work),
  };
}

async function readBody(request: Request): Promise<BodyInput> {
  const text = await request.text();
  if (text === "") return { kind: "none" };
  try {
    return { kind: "json", value: JSON.parse(text) as unknown };
  } catch {
    return { kind: "invalid" };
  }
}

export function createApi(
  services: MockServices,
): (request: Request) => Promise<Response> {
  const { repository, clock, ids, logger, metrics } = services;

  return async (request) => {
    const began = clock.now();
    const url = new URL(request.url);
    const traceId = traceIdOf(
      request.headers.get("traceparent"),
      services.newTraceId,
    );
    const log = tracedLogger(logger, traceId);
    let route = "unmatched";
    let actorRole: "customer" | "staff" | "manager" | undefined;
    let outcome: string;

    const reply = async (): Promise<Reply> => {
      const matched = url.pathname.startsWith("/api/")
        ? matchOperation(request.method, url.pathname.slice("/api".length))
        : undefined;
      if (!matched) return { problem: { code: "NOT_FOUND" } };
      const { operation, pathParams } = matched;
      route = `${operation.method.toUpperCase()} ${operation.path}`;

      const userId = request.headers.get(DEMO_USER_HEADER);
      const users = await repository.listDemoUsers();
      const user = users.find((u) => u.id === userId);
      if (!user) return { problem: { code: "UNKNOWN_USER" } };
      const actor = actorOf(user);
      actorRole = actor.role;

      const checked = validateRequest(operation, {
        query: url.searchParams,
        pathParams,
        headers: request.headers,
        body: operation.node.requestBody
          ? await readBody(request)
          : { kind: "none" },
      });
      if (!checked.ok) {
        // A missing key has its own code; everything else is a field error that names the field.
        if (checked.missingHeaders.includes("Idempotency-Key")) {
          return { problem: { code: "IDEMPOTENCY_KEY_MISSING" } };
        }
        return {
          problem: { code: "VALIDATION_FAILED", errors: checked.issues },
        };
      }

      const deps: CommandDeps = {
        uow: repository,
        clock,
        ids,
        logger: log,
        metrics,
      };
      return handlers[operation.id as keyof typeof handlers]({
        actor,
        user,
        deps,
        path: checked.path,
        query: checked.query,
        body: checked.body,
        idempotencyKey: request.headers.get("Idempotency-Key") ?? undefined,
        origin: url.origin,
      });
    };

    let response: Response;
    try {
      const result = await reply();
      if ("problem" in result) {
        const spec: ProblemSpec = result.problem;
        outcome = spec.code.toLowerCase();
        response = problemResponse(spec, traceId);
      } else {
        outcome = "ok";
        response = new Response(JSON.stringify(result.body), {
          status: result.status,
          headers: {
            "Content-Type": "application/json",
            "X-Trace-Id": traceId,
          },
        });
      }
    } catch {
      // The error is not logged or sent: its message could hold a name or a phone number (SEC-9, SEC-10).
      outcome = "internal";
      response = problemResponse({ code: "INTERNAL" }, traceId);
    }
    log.info("http.request", {
      route,
      method: request.method,
      status: response.status,
      durationMs: clock.now() - began,
      actorRole,
      outcome,
    });
    return response;
  };
}
