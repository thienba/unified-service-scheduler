import type { EpochMs } from "../model";

/** A half-open interval `[start, end)` of UTC instants (AD-1). */
export interface Interval {
  start: EpochMs;
  end: EpochMs;
}

/** Touching intervals (one ends where the other starts) do not overlap. */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** True when `inner` lies wholly inside `outer`. */
export function contains(outer: Interval, inner: Interval): boolean {
  return outer.start <= inner.start && inner.end <= outer.end;
}

/** The part both intervals share, or null when there is none. */
export function intersect(a: Interval, b: Interval): Interval | null {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return start < end ? { start, end } : null;
}

/** What is left of `interval` once `hole` is taken out: zero, one or two intervals. */
export function subtract(interval: Interval, hole: Interval): Interval[] {
  // A hole with no length (for example a break inside a clock gap) takes nothing out.
  if (hole.start >= hole.end || !overlaps(interval, hole)) return [interval];
  const left = { start: interval.start, end: hole.start };
  const right = { start: hole.end, end: interval.end };
  return [left, right].filter((part) => part.start < part.end);
}
