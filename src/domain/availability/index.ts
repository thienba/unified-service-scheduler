import {
  earliestAllowedStart,
  lastAllowedDate,
} from "../policies/lead-and-horizon";
import { MINUTE_MS, addDays, localDateOf } from "../time";
import type { EpochMs } from "../model";
import { buildDay, evaluateStart, policyReasons } from "./day";
import type {
  CheckRequest,
  CheckResult,
  DayRequest,
  SchedulingSnapshot,
  SuggestOptions,
} from "./types";

export { bookedIntervals, pickResources } from "./day";
export * from "./types";

const DAY_MS = 24 * 60 * MINUTE_MS;

/** Whether one start is free, and with which technician, bay and car (REQ-BOOK-002). */
export function checkStart(
  snapshot: SchedulingSnapshot,
  request: CheckRequest,
  now: EpochMs,
): CheckResult {
  const reasons = policyReasons(snapshot, request.start, now);
  if (reasons.length > 0) return { available: false, reasons };
  const date = localDateOf(request.start, snapshot.dealership.timeZone);
  return evaluateStart(
    buildDay(snapshot, date, request),
    request.start,
    request.keepsStoredStart !== true,
  );
}

/** Every free start on one local date, on the dealership's grid from the opening instant. */
export function searchDay(
  snapshot: SchedulingSnapshot,
  request: DayRequest,
  now: EpochMs,
): EpochMs[] {
  const { policies, timeZone } = snapshot.dealership;
  if (request.date > lastAllowedDate(now, timeZone, policies.horizonDays)) {
    return [];
  }
  const day = buildDay(snapshot, request.date, request);
  if (day.window === null) return [];
  const earliest = earliestAllowedStart(now, policies.leadTimeMinutes);
  const step = policies.gridMinutes * MINUTE_MS;
  const starts: EpochMs[] = [];
  for (
    let start = day.window.start;
    start + day.durationMs <= day.window.end;
    start += step
  ) {
    if (start >= earliest && evaluateStart(day, start).available) {
      starts.push(start);
    }
  }
  return starts;
}

/**
 * Up to `count` free starts within `windowDays` of the wanted time, nearest first and the later
 * one first on a tie (D-0001-16). Never before the lead time or beyond the horizon.
 */
export function suggest(
  snapshot: SchedulingSnapshot,
  request: CheckRequest,
  now: EpochMs,
  options: SuggestOptions = {},
): EpochMs[] {
  const { count = 5, windowDays = 14 } = options;
  const { timeZone, policies } = snapshot.dealership;
  const wanted = request.start;
  const wantedDate = localDateOf(wanted, timeZone);
  const firstDate = localDateOf(now, timeZone);
  const lastDate = lastAllowedDate(now, timeZone, policies.horizonDays);
  const distance = (start: EpochMs) => Math.abs(start - wanted);
  const found: EpochMs[] = [];

  // Go outward one local date at a time; stop once no later date can beat what we hold.
  for (let offset = 0; offset <= windowDays; offset++) {
    const dates =
      offset === 0
        ? [wantedDate]
        : [addDays(wantedDate, offset), addDays(wantedDate, -offset)];
    for (const date of dates) {
      if (date < firstDate || date > lastDate) continue;
      for (const start of searchDay(snapshot, { ...request, date }, now)) {
        if (distance(start) <= windowDays * DAY_MS) found.push(start);
      }
    }
    if (found.length >= count) {
      found.sort((a, b) => distance(a) - distance(b) || b - a);
      // A start on the next date is at least this far away (2 hours of slack for DST).
      if (distance(found[count - 1]!) <= offset * DAY_MS - 2 * 60 * MINUTE_MS)
        break;
    }
  }
  return found
    .sort((a, b) => distance(a) - distance(b) || b - a)
    .slice(0, count);
}
