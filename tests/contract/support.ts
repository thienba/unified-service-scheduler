// Helpers for the API contract tests: a seeded in-memory world, the mock behind two kinds of caller
// (the mock directly, and the typed client over MSW at any origin), and a check of every response against
// openapi.yaml (AD-2: a field the contract does not describe fails the test).
import { setupServer } from "msw/node";
import { createApi } from "../../src/api/mock/api";
import { DEMO_USER_HEADER } from "../../src/api/mock/demo-user";
import { createMswHandlers } from "../../src/api/mock/msw";
import { createApiClient } from "../../src/api/client";
import { readConfig } from "../../src/config";
import { matchOperation } from "../../src/api/contract/validator";
import { checkResponse } from "./check-response";
import {
  createFakeClock,
  createFakeIds,
  createFakeLogger,
  createFakeMetrics,
} from "../../src/application/ports/fakes";
import {
  loadSeed,
  resetToSeed,
} from "../../src/infrastructure/seed/seed-loader";
import { createTelemetry } from "../../src/infrastructure/telemetry";
import { createMemoryRepository } from "../../src/infrastructure/storage/memory/memory-repository";

/** Monday 2026-11-02, 09:00 in London (GMT). The seeded appointments are counted from here. */
export const NOW = Date.parse("2026-11-02T09:00:00Z");
export const at = (date: string, hhmm: string) => `${date}T${hhmm}:00Z`;

export const users = {
  customerA: "user-customer-a",
  customerB: "user-customer-b",
  staffLondon: "user-staff-london",
  managerLondon: "user-manager-london",
  staffSaigon: "user-staff-saigon",
  managerSaigon: "user-manager-saigon",
  staffBoth: "user-staff-both",
} as const;
export type UserKey = keyof typeof users;

/** The seeded appointment of customer A: EV check, London, Thursday 2026-11-05 10:00 with Ash. */
export const SEEDED_A = {
  id: "appointment-customer-a",
  date: "2026-11-05",
  start: "2026-11-05T10:00:00Z",
};
export const NEW_KEY = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export interface CallOptions {
  user?: string;
  method?: string;
  query?: Record<string, string | number | boolean>;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface Reply {
  status: number;
  headers: Headers;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
  /** Problems found when the response was checked against openapi.yaml. */
  problems: string[];
}

/**
 * A seeded in-memory world. The tests that count calls use the fakes; with `real` the API gets the real
 * logger and metrics instead, and `output` holds every line the logger wrote to the console.
 */
export async function makeWorld(options: { real?: boolean } = {}) {
  const repository = createMemoryRepository();
  await loadSeed(repository, NOW);
  const clock = createFakeClock(NOW);
  const logger = createFakeLogger();
  const metrics = createFakeMetrics();
  const output: string[] = [];
  const telemetry = createTelemetry({
    now: clock.now,
    write: (_level, line) => output.push(line),
  });
  const api = createApi({
    repository,
    clock,
    ids: createFakeIds("gen"),
    logger: options.real ? telemetry.logger : logger,
    metrics: options.real ? telemetry.metrics : metrics,
    telemetry: telemetry.reader,
    resetData: () => resetToSeed(repository, NOW),
    newTraceId: () => "a".repeat(32),
  });
  return { repository, clock, logger, metrics, api, telemetry, output };
}
export type World = Awaited<ReturnType<typeof makeWorld>>;

async function toReply(
  method: string,
  url: URL,
  response: Response,
  read?: { body: unknown },
): Promise<Reply> {
  // The typed client has already read the body; the mock gives an unread response.
  let body: unknown = read?.body;
  if (read === undefined) {
    const text = await response.clone().text();
    body = text === "" ? undefined : (JSON.parse(text) as unknown);
  }
  const matched = matchOperation(method, url.pathname.replace(/^.*?\/api/, ""));
  return {
    status: response.status,
    headers: response.headers,
    body,
    problems: matched
      ? checkResponse(
          matched.operation,
          response.status,
          response.headers,
          body,
        )
      : [`no operation matches ${method} ${url.pathname}`],
  };
}

function withQuery(origin: string, path: string, query: CallOptions["query"]) {
  const url = new URL(`${origin}/api${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, String(value));
  }
  return url;
}

/** One way of calling the API. The contract tests run once for each. */
export interface Transport {
  name: string;
  /** Starts a fresh world and returns the call function. */
  start(): Promise<{
    world: World;
    /** The origin the calls go to, for the links the outbox builds. */
    origin: string;
    call: (path: string, options?: CallOptions) => Promise<Reply>;
  }>;
}

/** Calls the mock directly with a `Request`. */
export function directTransport(options: { real?: boolean } = {}): Transport {
  return {
    name: "the mock directly",
    async start() {
      const world = await makeWorld(options);
      return {
        world,
        origin: "http://mock.test",
        call: async (path, options = {}) => {
          const method = options.method ?? "GET";
          const url = withQuery("http://mock.test", path, options.query);
          const headers = new Headers(options.headers);
          if (options.user !== undefined)
            headers.set(DEMO_USER_HEADER, options.user);
          let body: string | undefined;
          if (options.body !== undefined) {
            body =
              typeof options.body === "string"
                ? options.body
                : JSON.stringify(options.body);
            if (!headers.has("content-type"))
              headers.set("content-type", "application/json");
          }
          return toReply(
            method,
            url,
            await world.api(new Request(url, { method, headers, body })),
          );
        },
      };
    },
  };
}

let currentWorld: World | undefined;
const mswServer = setupServer(
  ...createMswHandlers((request) => currentWorld!.api(request)),
);
/** MSW answers for every origin; call these once around a test file that uses `clientTransport`. */
export const startMsw = () => mswServer.listen({ onUnhandledFrame: "error" });
export const stopMsw = () => mswServer.close();

/**
 * Calls the mock through the typed client and MSW, at `origin`. The base URL comes from the
 * configuration reader, so nothing in the client or the tests is tied to one address (S2).
 */
export function clientTransport(origin: string): Transport {
  return {
    name: `the typed client at ${origin}`,
    async start() {
      const world = await makeWorld();
      currentWorld = world;
      let user: string | undefined;
      const { apiBaseUrl } = readConfig({
        VITE_API_MODE: "remote",
        VITE_API_BASE_URL: `${origin}/api`,
      });
      const client = createApiClient({
        baseUrl: apiBaseUrl,
        headers: () => {
          const headers: Record<string, string> = {};
          if (user !== undefined) headers[DEMO_USER_HEADER] = user;
          return headers;
        },
      });
      const raw = client as unknown as {
        request(
          method: string,
          url: string,
          init: object,
        ): Promise<{ response: Response; data?: unknown; error?: unknown }>;
      };
      return {
        world,
        origin,
        call: async (path, options = {}) => {
          const method = options.method ?? "GET";
          user = options.user;
          const { response, data, error } = await raw.request(method, path, {
            params: { query: options.query },
            headers: options.headers,
            ...(options.body === undefined ? {} : { body: options.body }),
          });
          return toReply(
            method,
            withQuery(origin, path, options.query),
            response,
            { body: data ?? error },
          );
        },
      };
    },
  };
}

export const transports = (): Transport[] => [
  directTransport(),
  clientTransport("http://first.mock.test"),
  clientTransport("http://second.mock.test"),
];
