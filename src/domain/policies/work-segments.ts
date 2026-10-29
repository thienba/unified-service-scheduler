import { intersect, subtract, type Interval } from "../appointment/interval";
import type { Dealership, LocalDate, Shift, Technician } from "../model";
import { instantAt, weekdayOf } from "../time";
import { openingWindow } from "./opening-window";

/** The shift of a local date: a date exception replaces the weekly pattern; leave is no shift. */
export function shiftOn(
  technician: Technician,
  date: LocalDate,
): Shift | undefined {
  const exception = technician.shiftExceptions[date];
  if (exception === undefined) return technician.shiftPattern[weekdayOf(date)];
  return exception.kind === "leave" ? undefined : exception.shift;
}

/**
 * Where a technician is on shift on a local date: the shift (a date exception replaces the weekly
 * pattern) minus the shift's own break, whatever the opening hours are (Q-0001-10 A).
 */
export function shiftSegments(
  technician: Technician,
  dealership: Dealership,
  date: LocalDate,
): Interval[] {
  const shift = shiftOn(technician, date);
  if (shift === undefined) return [];
  const zone = dealership.timeZone;
  const span = {
    start: instantAt(date, shift.start, zone),
    end: instantAt(date, shift.end, zone),
  };
  // A shift that ends at or before its start gives no segments.
  if (span.start >= span.end) return [];
  // A break needs both its start and its end; with only one of them there is no break.
  if (shift.breakStart === undefined || shift.breakEnd === undefined) {
    return [span];
  }
  return subtract(span, {
    start: instantAt(date, shift.breakStart, zone),
    end: instantAt(date, shift.breakEnd, zone),
  });
}

/** Where a technician can work on a local date: the shift segments cut to the opening window. */
export function workSegments(
  technician: Technician,
  dealership: Dealership,
  date: LocalDate,
): Interval[] {
  const window = openingWindow(dealership, date);
  if (window === null) return [];
  return shiftSegments(technician, dealership, date).flatMap(
    (segment) => intersect(segment, window) ?? [],
  );
}
