import type { CommandDeps } from "../deps";
import type { FieldError } from "../../domain/validation/new-customer";

/** What a query needs from the outside. */
export type QueryDeps = Omit<CommandDeps, "ids">;

/** The answers every query can give instead of data. Mapping them to HTTP is the mock API's job. */
export type QueryFailure =
  | { kind: "validation_failed"; errors: FieldError[] }
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | { kind: "search_range_too_large" };

/** The most days a list may cover in one call (architecture.md section 7.4). */
export const MAX_RANGE_DAYS = 31;
/** The fewest characters a customer search needs, and the most customers it returns (D-0000-26). */
export const MIN_SEARCH_CHARS = 3;
export const MAX_SEARCH_RESULTS = 10;

/** Later than any appointment, for "from now on". */
export const FAR_FUTURE = 2 ** 52;

export const invalid = (field: string, message: string): QueryFailure => ({
  kind: "validation_failed",
  errors: [{ field, message }],
});
