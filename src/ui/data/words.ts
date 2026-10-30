// The words of design.md section 9: what the screen says for each answer of the API.
// No raw code (`TECHNICIAN_BUSY`) is ever shown.
import { mockEnabled } from "../../config";
import { ApiProblem, type Role } from "./api-problem";
import { referenceOf } from "../components/StateBlock";

export const roleName: Record<Role, string> = {
  customer: "Customer",
  staff: "Staff",
  manager: "Manager",
};

export type ProblemKind =
  | "signed-out"
  | "no-permission"
  | "not-found"
  | "conflict"
  | "closed"
  | "validation"
  | "error";

export interface ProblemWords {
  kind: ProblemKind;
  title: string;
  body: string;
  /** The first 8 characters of the trace id, when the answer had one. */
  reference: string | null;
  /** With a 422: each field's own message, to show under the field. */
  fields: { field: string; message: string }[];
  /** With a 409 `SLOT_UNAVAILABLE`: why, in words. */
  reasons: string[];
}

export interface WordsContext {
  role?: Role | undefined;
  /** For "Contact Northgate Motors": the dealership's name. */
  dealershipName?: string | undefined;
  /** For "It starts in less than 2 hours": the change cutoff in hours. */
  cutoffHours?: number | undefined;
  /** Staff and managers read "belongs to another dealership" on a 404. */
  scope?: "own" | "dealership";
}

const reasonWords: Record<string, string> = {
  TECHNICIAN_BUSY: "every technician who can do this job is busy then",
  NO_QUALIFIED_TECHNICIAN_ON_SHIFT:
    "no technician who can do this job is working then",
  BAY_BUSY: "every service bay is in use then",
  COURTESY_CAR_BUSY: "no courtesy car is free then",
  VEHICLE_BUSY: "this car already has an appointment at that time",
  OUTSIDE_OPENING_HOURS: "the dealership is closed at that time",
  DEALERSHIP_CLOSED: "the dealership is closed that day",
  NOT_ON_GRID: "that time is not on the 15-minute grid",
  TOO_SOON: "bookings need more notice than that",
  BEYOND_HORIZON: "that day is further ahead than bookings open",
};

/** The reason in plain words, for any code the API sends. */
export function reasonInWords(code: string): string {
  return reasonWords[code] ?? "that time is not free";
}

const homeName: Record<Role, string> = {
  customer: "Book a service",
  staff: "the schedule",
  manager: "the schedule",
};

export const signedOutWords = {
  title: "You are not signed in.",
  // A remote build has no role switcher, so it cannot send the person to one.
  body: mockEnabled
    ? "Pick who you are with Viewing as at the top of the page. This is a demo, so there is no password."
    : "Sign in to continue.",
};

function make(
  kind: ProblemKind,
  title: string,
  body: string,
  problem: ApiProblem,
  extra: Partial<ProblemWords> = {},
): ProblemWords {
  return {
    kind,
    title,
    body,
    reference: problem.traceId ? referenceOf(problem.traceId) : null,
    fields: [],
    reasons: [],
    ...extra,
  };
}

/** Turns a failed call into words. Anything that is not an `ApiProblem` is treated as no answer. */
export function describeProblem(
  error: unknown,
  context: WordsContext = {},
): ProblemWords {
  const problem =
    error instanceof ApiProblem ? error : new ApiProblem(0, null, null);
  const role = context.role;
  const code = problem.code;

  if (problem.status === 401 || code === "UNKNOWN_USER") {
    return make(
      "signed-out",
      signedOutWords.title,
      signedOutWords.body,
      problem,
    );
  }
  if (problem.status === 403 || code === "FORBIDDEN") {
    return make(
      "no-permission",
      `You cannot do that as ${role ? roleName[role] : "this role"}.`,
      `That is not allowed for your role. Switch role, or go to ${role ? homeName[role] : "the start"}.`,
      problem,
    );
  }
  if (problem.status === 404 || code === "NOT_FOUND") {
    return make(
      "not-found",
      "We cannot find that appointment.",
      context.scope === "dealership"
        ? "It may have been removed, or it belongs to another dealership."
        : "It may have been removed, or it belongs to someone else.",
      problem,
    );
  }
  if (code === "CHANGE_WINDOW_CLOSED") {
    const who = context.dealershipName ?? "the dealership";
    return make(
      "closed",
      "This appointment can no longer be changed online.",
      context.cutoffHours
        ? `It starts in less than ${context.cutoffHours} hours. Contact ${who} to change it.`
        : `It starts too soon to change online. Contact ${who} to change it.`,
      problem,
    );
  }
  if (
    code === "SLOT_UNAVAILABLE" &&
    problem.problem?.reasons?.includes("VEHICLE_BUSY")
  ) {
    return make(
      "conflict",
      "This car already has an appointment at that time.",
      "Nothing was booked. We kept what you entered, so you only need a new time.",
      problem,
      { reasons: (problem.problem?.reasons ?? []).map(reasonInWords) },
    );
  }
  if (code === "SLOT_UNAVAILABLE") {
    return make(
      "conflict",
      "Sorry, that time was just taken.",
      "Another customer confirmed that time a moment before you. Nothing was booked for you. We kept what you entered, so you only need a new time.",
      problem,
      { reasons: (problem.problem?.reasons ?? []).map(reasonInWords) },
    );
  }
  if (code === "ALREADY_CANCELLED") {
    return make(
      "conflict",
      "That appointment is already cancelled.",
      "Nothing was changed.",
      problem,
    );
  }
  if (code === "SEARCH_RANGE_TOO_LARGE") {
    return make(
      "validation",
      "That is too many days at once.",
      "Choose up to 31 days.",
      problem,
    );
  }
  if (problem.status === 422 || code === "VALIDATION_FAILED") {
    const fields = problem.problem?.errors ?? [];
    return make(
      "validation",
      `${fields.length === 1 ? "1 thing needs" : `${fields.length} things need`} fixing before we can book this.`,
      "Each field says what to change.",
      problem,
      { fields },
    );
  }
  // 500 `INTERNAL`, any other answer, and no answer at all (no network).
  const reference = problem.traceId ? referenceOf(problem.traceId) : null;
  return make(
    "error",
    "Something went wrong on our side.",
    reference
      ? `Nothing was changed. Try again; if it keeps happening, quote reference ${reference}.`
      : "Nothing was changed. Check your connection and try again.",
    problem,
  );
}
