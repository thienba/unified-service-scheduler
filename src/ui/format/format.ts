// The words and numbers the screens show (design.md section 9, AD-9). Times are shown in the
// dealership's zone, never the browser's. `Intl.DateTimeFormat` is given the zone every time.

const LOCALE = "en-GB";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** An instant as the contract sends it (`2026-10-30T09:00:00Z`), or as epoch milliseconds. */
export type InstantInput = string | number;

interface Parts {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsOf(instant: InstantInput, zone: string): Parts {
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(LOCALE, {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      weekday: "short",
    });
    formatters.set(zone, formatter);
  }
  const found: Record<string, string> = {};
  for (const part of formatter.formatToParts(new Date(instant))) {
    found[part.type] = part.value;
  }
  return {
    year: Number(found["year"]),
    month: Number(found["month"]),
    day: Number(found["day"]),
    weekday: WEEKDAYS.indexOf(found["weekday"] as (typeof WEEKDAYS)[number]),
    hour: Number(found["hour"]),
    minute: Number(found["minute"]),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

function dayText(
  weekday: number,
  day: number,
  month: number,
  year: number,
  thisYear: number,
): string {
  const base = `${WEEKDAYS[weekday]} ${day} ${MONTHS[month - 1]}`;
  return year === thisYear ? base : `${base} ${year}`;
}

/** "Fri 30 Oct", with the year ("Fri 30 Oct 2027") when it is not this year in the zone. */
export function formatDay(
  instant: InstantInput,
  zone: string,
  now: InstantInput = Date.now(),
): string {
  const p = partsOf(instant, zone);
  return dayText(p.weekday, p.day, p.month, p.year, partsOf(now, zone).year);
}

/** A date with no time (`YYYY-MM-DD`), written the same way. `thisYear` is the year to leave out. */
export function formatLocalDate(localDate: string, thisYear: number): string {
  const [year = 0, month = 1, day = 1] = localDate.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return dayText(weekday, day, month, year, thisYear);
}

/** "10:00", on a 24-hour clock. */
export function formatTime(instant: InstantInput, zone: string): string {
  const p = partsOf(instant, zone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** "10:00 to 13:00". */
export function formatTimeRange(
  start: InstantInput,
  end: InstantInput,
  zone: string,
): string {
  return `${formatTime(start, zone)} to ${formatTime(end, zone)}`;
}

/** The local date (`YYYY-MM-DD`) an instant falls on in the zone. */
export function localDateIn(instant: InstantInput, zone: string): string {
  const p = partsOf(instant, zone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** A local date moved by whole days. Calendar days, so a clock change does not matter. */
export function addDaysToLocalDate(localDate: string, days: number): string {
  const [year = 0, month = 1, day = 1] = localDate.split("-").map(Number);
  const moved = new Date(Date.UTC(year, month - 1, day + days));
  return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`;
}

/** "3 hours", "1 hour 30 minutes", "45 minutes": for a sentence. */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = h === 0 ? "" : `${h} ${h === 1 ? "hour" : "hours"}`;
  const rest = m === 0 ? "" : `${m} ${m === 1 ? "minute" : "minutes"}`;
  return [hours, rest].filter(Boolean).join(" ") || "0 minutes";
}

/** "3h", "1h 30m", "45m": for a tight spot. */
export function formatDurationShort(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return (
    [h === 0 ? "" : `${h}h`, m === 0 ? "" : `${m}m`]
      .filter(Boolean)
      .join(" ") || "0m"
  );
}

/** "18 times", "1 time". */
export function formatTimesCount(count: number): string {
  return `${count} ${count === 1 ? "time" : "times"}`;
}

/** The place in an IANA zone name: `Europe/London` is "London", `Asia/Ho_Chi_Minh` is "Ho Chi Minh". */
export function placeOfZone(zone: string): string {
  return (zone.split("/").pop() ?? zone).replaceAll("_", " ");
}

/** The browser's zone. This is the only place that reads it, and only to compare it (AD-9). */
export function viewerTimeZone(): string {
  return new Intl.DateTimeFormat(LOCALE).resolvedOptions().timeZone;
}

/**
 * The note to add when the viewer is in another zone than the dealership: "(London time)", or
 * "Times are in London time." for a title. Nothing when the two zones are the same place.
 */
export function zoneNote(
  dealershipZone: string,
  viewerZone: string,
  style: "short" | "sentence" = "short",
): string | null {
  if (!differentClock(dealershipZone, viewerZone)) return null;
  const place = placeOfZone(dealershipZone);
  return style === "short" ? `(${place} time)` : `Times are in ${place} time.`;
}

/** Two zones are "the same" when they show the same clock now and half a year from now. */
function differentClock(a: string, b: string): boolean {
  if (a === b) return false;
  const now = Date.now();
  const halfYear = 182 * 24 * 3_600_000;
  return [now, now + halfYear].some(
    (t) => formatTime(t, a) !== formatTime(t, b),
  );
}
