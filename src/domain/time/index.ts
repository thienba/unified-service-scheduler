// The only place that imports the date library (AD-9, D-0000-18, D-0000-31).
// Everything else in the app works with epoch milliseconds, `YYYY-MM-DD` and `HH:mm`.
import { Temporal } from "@js-temporal/polyfill";
import type {
  EpochMs,
  LocalDate,
  LocalTime,
  TimeZone,
  Weekday,
} from "../model";

export const MINUTE_MS = 60_000;

/** The local date that an instant falls on in the zone. */
export function localDateOf(instant: EpochMs, zone: TimeZone): LocalDate {
  return Temporal.Instant.fromEpochMilliseconds(instant)
    .toZonedDateTimeISO(zone)
    .toPlainDate()
    .toString();
}

/**
 * The instant of a local date and time in the zone (architecture.md section 7.6).
 *
 * - A time that happens twice (clocks go back) gives the earlier one.
 * - A time that does not exist (clocks go forward) gives the first real instant after the gap,
 *   which is the moment the clocks jump. In Europe/London on 2026-03-29, 01:30 is in the gap and
 *   the answer is 02:00 BST, which is 01:00 UTC. (Temporal's own "compatible" choice would give
 *   02:30 BST, so we look for the jump ourselves.)
 */
export function instantAt(
  localDate: LocalDate,
  localTime: LocalTime,
  zone: TimeZone,
): EpochMs {
  const wanted = Temporal.PlainDateTime.from(`${localDate}T${localTime}`);
  const earlier = wanted.toZonedDateTime(zone, { disambiguation: "earlier" });
  if (Temporal.PlainDateTime.compare(earlier.toPlainDateTime(), wanted) === 0) {
    return earlier.epochMilliseconds;
  }
  // The time fell in a gap, so "earlier" landed before the jump. The next change is the jump.
  // A gap always has a change after it, so the answer is never null.
  return earlier.getTimeZoneTransition("next")!.epochMilliseconds;
}

/** True when the text is a real calendar date written `YYYY-MM-DD`. */
export function isLocalDate(text: string): boolean {
  try {
    return Temporal.PlainDate.from(text).toString() === text;
  } catch {
    return false;
  }
}

/** 1 is Monday and 7 is Sunday. */
export function weekdayOf(localDate: LocalDate): Weekday {
  return Temporal.PlainDate.from(localDate).dayOfWeek as Weekday;
}

export function addDays(localDate: LocalDate, days: number): LocalDate {
  return Temporal.PlainDate.from(localDate).add({ days }).toString();
}

/** From midnight at the start of the date to midnight at the start of the next date. */
export function dayBounds(
  localDate: LocalDate,
  zone: TimeZone,
): { start: EpochMs; end: EpochMs } {
  return {
    start: instantAt(localDate, "00:00", zone),
    end: instantAt(addDays(localDate, 1), "00:00", zone),
  };
}

/** True when the zone's offset differs between January and July of the instant's local year. */
export function zoneHasDst(zone: TimeZone, instant: EpochMs): boolean {
  const year =
    Temporal.Instant.fromEpochMilliseconds(instant).toZonedDateTimeISO(
      zone,
    ).year;
  const offsetIn = (month: number) =>
    Temporal.ZonedDateTime.from({
      timeZone: zone,
      year,
      month,
      day: 1,
      hour: 12,
    }).offsetNanoseconds;
  return offsetIn(1) !== offsetIn(7);
}
