// One local date as the staff schedule draws it (REQ-BOOK-004, D-0001-11, D-0001-21 A): each
// technician's shift and break as instants, and the free windows a booking could go into.
// The screen only draws what this returns; the rules stay here (AD-10).
import { subtract, type Interval } from "../appointment/interval";
import type { Dealership, EpochMs, LocalDate, Technician } from "../model";
import {
  earliestAllowedStart,
  lastAllowedDate,
} from "../policies/lead-and-horizon";
import { openingWindow } from "../policies/opening-window";
import { shiftOn, workSegments } from "../policies/work-segments";
import { MINUTE_MS, addDays, instantAt } from "../time";

/** The shortest free window that is shown: 30 minutes is the smallest tappable gap, 44 px (D-0001-21). */
export const MIN_FREE_MINUTES = 30;

/** How far ahead the next open date is looked for. */
const NEXT_OPEN_SEARCH_DAYS = 31;

export interface TechnicianDay {
  /** A date exception says the technician is on leave. */
  onLeave: boolean;
  /** The shift as instants, or null when the technician does not work that date. */
  shift: Interval | null;
  /** The shift's own break, when it has both ends. */
  break: Interval | null;
  /** Time a booking could start in, 30 minutes or longer, earliest first. */
  free: Interval[];
}

/**
 * Where a technician can still take work on a date: the work segments (shift minus break, cut to the
 * opening hours), less each job and the rest kept before and after it, from the lead time on, on the
 * dealership's grid, and nothing beyond the horizon. Windows shorter than 30 minutes are left out.
 */
export function freeWindows(
  technician: Technician,
  dealership: Dealership,
  date: LocalDate,
  jobs: readonly Interval[],
  now: EpochMs,
): Interval[] {
  const { policies, timeZone } = dealership;
  const window = openingWindow(dealership, date);
  if (window === null) return [];
  if (date > lastAllowedDate(now, timeZone, policies.horizonDays)) return [];
  const rest = policies.breakMinutes * MINUTE_MS;
  const step = policies.gridMinutes * MINUTE_MS;
  const earliest = earliestAllowedStart(now, policies.leadTimeMinutes);
  let parts = workSegments(technician, dealership, date);
  for (const job of jobs) {
    const held = { start: job.start - rest, end: job.end + rest };
    parts = parts.flatMap((part) => subtract(part, held));
  }
  const free: Interval[] = [];
  for (const part of parts) {
    // A start sits on the grid counted from the opening instant, as every bookable start does.
    const from = Math.max(part.start, earliest);
    const start = window.start + Math.ceil((from - window.start) / step) * step;
    if (part.end - start >= MIN_FREE_MINUTES * MINUTE_MS) {
      free.push({ start, end: part.end });
    }
  }
  return free;
}

/** A technician's day: leave, shift, break and free windows. */
export function technicianDay(
  technician: Technician,
  dealership: Dealership,
  date: LocalDate,
  jobs: readonly Interval[],
  now: EpochMs,
): TechnicianDay {
  const zone = dealership.timeZone;
  const onLeave = technician.shiftExceptions[date]?.kind === "leave";
  const shift = shiftOn(technician, date);
  if (shift === undefined) {
    return { onLeave, shift: null, break: null, free: [] };
  }
  const span = {
    start: instantAt(date, shift.start, zone),
    end: instantAt(date, shift.end, zone),
  };
  const pause =
    shift.breakStart !== undefined && shift.breakEnd !== undefined
      ? {
          start: instantAt(date, shift.breakStart, zone),
          end: instantAt(date, shift.breakEnd, zone),
        }
      : null;
  return {
    onLeave,
    shift: span.start < span.end ? span : null,
    break: pause !== null && pause.start < pause.end ? pause : null,
    free: freeWindows(technician, dealership, date, jobs, now),
  };
}

/** The first open date after `date`, within a month, or null when there is none. */
export function nextOpenDate(
  dealership: Dealership,
  date: LocalDate,
): LocalDate | null {
  for (let offset = 1; offset <= NEXT_OPEN_SEARCH_DAYS; offset++) {
    const next = addDays(date, offset);
    if (openingWindow(dealership, next) !== null) return next;
  }
  return null;
}
