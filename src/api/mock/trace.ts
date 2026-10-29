// W3C trace context (AD-12, SEC-9.AC-3). Only a well-formed `traceparent` is trusted; anything else
// gets a new trace id, so a forged header cannot put junk in the logs.
const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/;
const ALL_ZERO = /^0+$/;

/** 32 lower-case hex characters, not all zero. */
export function newTraceId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const id = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return ALL_ZERO.test(id) ? newTraceId() : id;
}

/** The trace id of a valid `traceparent`, or a new one. */
export function traceIdOf(
  traceparent: string | null,
  makeId: () => string = newTraceId,
): string {
  const found = traceparent === null ? null : TRACEPARENT.exec(traceparent);
  if (found && !ALL_ZERO.test(found[1]!) && !ALL_ZERO.test(found[2]!)) {
    return found[1]!;
  }
  return makeId();
}
