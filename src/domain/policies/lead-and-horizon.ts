import type { EpochMs, LocalDate, TimeZone } from "../model";
import { MINUTE_MS, addDays, localDateOf } from "../time";

/** The earliest instant an appointment may start (REQ-BOOK-011.AC-1). */
export function earliestAllowedStart(
  now: EpochMs,
  leadTimeMinutes: number,
): EpochMs {
  return now + leadTimeMinutes * MINUTE_MS;
}

/** The last local date that may be booked: today in the dealership's zone plus the horizon. */
export function lastAllowedDate(
  now: EpochMs,
  zone: TimeZone,
  horizonDays: number,
): LocalDate {
  return addDays(localDateOf(now, zone), horizonDays);
}
