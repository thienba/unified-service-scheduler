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
import type { LogFields } from "../../application/ports/telemetry";
import type { TelemetryReader } from "../../infrastructure/telemetry";
import {
  matchOperation,
  validateRequest,
  type BodyInput,
} from "../contract/validator";
import { actorOf } from "./actor";
import { DEMO_USER_HEADER } from "./demo-user";
import { bayUtilisation } from "../../application/utilisation";
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
  /** What the dev panel reads (`GET /_demo/telemetry`). */
  telemetry: TelemetryReader;
  /** Puts the stored data back to the seed (`POST /_demo/reset`). */
  resetData: () => Promise<void>;
  /** Makes a trace id when the request has none. Tests pass a fixed one. */
  newTraceId?: () => string;
}

/** A confirmed booking is logged as `confirmed`, not as the command's `ok` (section 7.7). */
const outcomeOf = (msg: string, outcome: string | undefined) =>
  msg === "appointment.book" && outcome === "ok" ? "confirmed" : outcome;

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
    const traced = logger.withTrace(traceId);
    // The commands' own lines wait until the answer is known, so that they carry the route and the status.
    const held: { msg: string; fields: LogFields }[] = [];
    const log: Logger = {
      ...traced,
      info: (msg, fields = {}) => {
        held.push({ msg, fields });
      },
    };
    let route = "unmatched";
    let dealershipId: string | undefined;
    let actorRole: "customer" | "staff" | "manager" | undefined;
    let outcome: string;
    // An appointment in the answer names its dealership, technician and bay: ids, never contact details.
    let appointment:
      | {
          id?: unknown;
          dealershipId?: unknown;
          technicianId?: unknown;
          serviceBayId?: unknown;
        }
      | undefined;

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

      const named =
        checked.path.dealershipId ??
        checked.query.dealershipId ??
        (checked.body as { dealershipId?: unknown } | undefined)?.dealershipId;
      // Only an id that names a stored dealership is logged: a value the caller typed could be a phone number.
      if (
        typeof named === "string" &&
        (await repository.read((stores) =>
          stores.scheduling.getDealership(named),
        ))
      ) {
        dealershipId = named;
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
        demo: {
          telemetry: services.telemetry,
          resetData: services.resetData,
          bayUtilisation: () => bayUtilisation({ uow: repository, clock }),
        },
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
        appointment = result.body as typeof appointment;
        response =
          result.body === undefined
            ? new Response(null, {
                status: result.status,
                headers: { "X-Trace-Id": traceId },
              })
            : new Response(JSON.stringify(result.body), {
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
    const status = response.status;
    const durationMs = clock.now() - began;
    if (typeof appointment?.dealershipId === "string") {
      dealershipId ??= appointment.dealershipId;
    }
    for (const { msg, fields } of held) {
      const same = fields.appointmentId === appointment?.id;
      traced.info(msg, {
        ...fields,
        route,
        method: request.method,
        status,
        dealershipId,
        outcome: outcomeOf(msg, fields.outcome),
        ...(same && typeof appointment?.technicianId === "string"
          ? { technicianId: appointment.technicianId }
          : {}),
        ...(same && typeof appointment?.serviceBayId === "string"
          ? { serviceBayId: appointment.serviceBayId }
          : {}),
      });
    }
    const line: LogFields = {
      route,
      method: request.method,
      status,
      durationMs,
      dealershipId,
      actorRole,
      outcome,
    };
    if (status >= 500) traced.error("http.request", line);
    else traced.info("http.request", line);
    metrics.increment("http_requests_total", {
      route,
      method: request.method,
      status: String(status),
    });
    // A 5xx is a failure; every other answer, a 409 included, is an expected one (section 7.7).
    metrics.observe("http_request_duration_ms", durationMs, {
      route,
      method: request.method,
      outcome: status >= 500 ? "failed" : "ok",
    });
    return response;
  };
}
