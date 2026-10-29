import type { Interval } from "../appointment/interval";
import type { Dealership, LocalDate } from "../model";
import { instantAt, weekdayOf } from "../time";

/**
 * The dealership's open interval on a local date, or null when it is closed.
 * A date override wins over the weekly hours (REQ-BOOK-007).
 */
export function openingWindow(
  dealership: Dealership,
  date: LocalDate,
): Interval | null {
  const hours =
    dealership.dateOverrides[date] ?? dealership.weeklyHours[weekdayOf(date)];
  if (hours === undefined || hours === "closed") return null;
  return {
    start: instantAt(date, hours.open, dealership.timeZone),
    end: instantAt(date, hours.close, dealership.timeZone),
  };
}
