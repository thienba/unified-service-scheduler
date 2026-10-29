// What a failed call looks like inside the app. A Problem answer (RFC 9457 with a fixed `code`) or no
// answer at all (no network). Screens never read raw codes: `describeProblem` turns this into words.
import type { components } from "../../api/contract/schema";

export type Problem = components["schemas"]["Problem"];
export type Me = components["schemas"]["Me"];
export type Role = components["schemas"]["Role"];
export type Dealership = components["schemas"]["Dealership"];

export class ApiProblem extends Error {
  /** 0 when there was no answer. */
  readonly status: number;
  readonly problem: Problem | null;
  readonly traceId: string | null;

  constructor(status: number, problem: Problem | null, traceId: string | null) {
    super(problem ? `${problem.code} (${status})` : `No answer (${status})`);
    this.name = "ApiProblem";
    this.status = status;
    this.problem = problem;
    this.traceId = problem?.traceId ?? traceId;
  }

  get code(): Problem["code"] | null {
    return this.problem?.code ?? null;
  }
}

/** The body of an error answer is checked before it is trusted: it may come from a proxy. */
function asProblem(body: unknown): Problem | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (
    typeof b["code"] === "string" &&
    typeof b["status"] === "number" &&
    typeof b["traceId"] === "string"
  ) {
    return body as Problem;
  }
  return null;
}

interface Result<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

/** Waits for a typed call and gives back its data, or throws an `ApiProblem`. */
export async function call<T>(request: Promise<Result<T>>): Promise<T> {
  let result: Result<T>;
  try {
    result = await request;
  } catch {
    throw new ApiProblem(0, null, null);
  }
  if (result.error !== undefined || !result.response.ok) {
    throw new ApiProblem(
      result.response.status,
      asProblem(result.error),
      result.response.headers.get("X-Trace-Id"),
    );
  }
  return result.data as T;
}
