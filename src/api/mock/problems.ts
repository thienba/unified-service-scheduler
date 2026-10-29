// The one error shape (AD-11): `application/problem+json` with a fixed `code` and the `traceId`.
// The titles and details are fixed text; nothing from the request or from an exception goes into them.
import type { components } from "../contract/schema";

export type Problem = components["schemas"]["Problem"];
export type ProblemCode = Problem["code"];

const KINDS: Record<
  ProblemCode,
  { status: number; slug: string; title: string; detail?: string }
> = {
  VALIDATION_FAILED: {
    status: 422,
    slug: "validation-failed",
    title: "The request is not valid",
  },
  IDEMPOTENCY_KEY_MISSING: {
    status: 400,
    slug: "idempotency-key-missing",
    title: "An Idempotency-Key header is required",
  },
  IDEMPOTENCY_KEY_REUSED: {
    status: 422,
    slug: "idempotency-key-reused",
    title: "That Idempotency-Key was used for a different request",
  },
  UNKNOWN_USER: {
    status: 401,
    slug: "unknown-user",
    title: "Sign in as a demo user",
  },
  FORBIDDEN: {
    status: 403,
    slug: "forbidden",
    title: "You cannot do that",
  },
  NOT_FOUND: {
    status: 404,
    slug: "not-found",
    title: "We could not find that",
    detail: "There is nothing here with that id.",
  },
  SLOT_UNAVAILABLE: {
    status: 409,
    slug: "slot-unavailable",
    title: "That time is no longer free",
  },
  CHANGE_WINDOW_CLOSED: {
    status: 409,
    slug: "change-window-closed",
    title: "This appointment can no longer be changed online",
    detail:
      "It is too close to the appointment time to change it here. Please contact the dealership.",
  },
  ALREADY_CANCELLED: {
    status: 409,
    slug: "already-cancelled",
    title: "That appointment is already cancelled",
    detail: "A cancelled appointment cannot be changed. Please book a new one.",
  },
  SEARCH_RANGE_TOO_LARGE: {
    status: 422,
    slug: "search-range-too-large",
    title: "The date range is too large",
    detail: "Ask for at most 31 days at a time.",
  },
  INTERNAL: {
    status: 500,
    slug: "internal",
    title: "Something went wrong",
    detail:
      "Something went wrong on our side. Please try again, and quote the trace id if it keeps happening.",
  },
};

/** What a handler gives back instead of data. */
export interface ProblemSpec {
  code: ProblemCode;
  detail?: string;
  errors?: Problem["errors"];
  reasons?: Problem["reasons"];
  suggestions?: Problem["suggestions"];
}

export function problemBody(spec: ProblemSpec, traceId: string): Problem {
  const kind = KINDS[spec.code];
  const detail = spec.detail ?? kind.detail;
  return {
    type: `/problems/${kind.slug}`,
    title: kind.title,
    status: kind.status,
    code: spec.code,
    ...(detail === undefined ? {} : { detail }),
    traceId,
    ...(spec.errors === undefined ? {} : { errors: spec.errors }),
    ...(spec.reasons === undefined ? {} : { reasons: spec.reasons }),
    ...(spec.suggestions === undefined
      ? {}
      : { suggestions: spec.suggestions }),
  };
}

export function problemResponse(spec: ProblemSpec, traceId: string): Response {
  const body = problemBody(spec, traceId);
  return new Response(JSON.stringify(body), {
    status: body.status,
    headers: {
      "Content-Type": "application/problem+json",
      "X-Trace-Id": traceId,
    },
  });
}
