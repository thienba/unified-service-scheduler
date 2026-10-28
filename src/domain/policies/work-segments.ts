import { intersect, subtract, type Interval } from "../appointment/interval";
import type { Dealership, LocalDate, Shift, Technician } from "../model";
import { instantAt, weekdayOf } from "../time";
import { openingWindow } from "./opening-window";

function shiftOn(technician: Technician, date: LocalDate): Shift | undefined {
  const exception = technician.shiftExceptions[date];
  if (exception === undefined) return technician.shiftPattern[weekdayOf(date)];
  return exception.kind === "leave" ? undefined : exception.shift;
}

/**
 * Where a technician can work on a local date: the shift (a date exception replaces the weekly
 * pattern), cut to the opening window, minus the shift's own break (Q-0001-10 A).
 */
export function workSegments(
  technician: Technician,
  dealership: Dealership,
  date: LocalDate,
): Interval[] {
  const shift = shiftOn(technician, date);
  const window = openingWindow(dealership, date);
  if (shift === undefined || window === null) return [];
  const zone = dealership.timeZone;
  const shiftSpan = intersect(
    {
      start: instantAt(date, shift.start, zone),
      end: instantAt(date, shift.end, zone),
    },
    window,
  );
  if (shiftSpan === null) return [];
  if (shift.breakStart === undefined || shift.breakEnd === undefined) {
    return [shiftSpan];
  }
  return subtract(shiftSpan, {
    start: instantAt(date, shift.breakStart, zone),
    end: instantAt(date, shift.breakEnd, zone),
  });
}
