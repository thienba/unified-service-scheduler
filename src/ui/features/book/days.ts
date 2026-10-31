// What each day of the strip says, and how the start times are grouped (design.md 8.7, 8.8). Plain
// functions of the dealership, the answers of the API and the current time, so they can be tested alone.
import type { components } from "../../../api/contract/schema";
import type { Dealership } from "../../data/api-problem";
import {
  addDaysToLocalDate,
  formatLocalDate,
  formatTime,
  localDateIn,
} from "../../format/format";

export type TimeSlot = components["schemas"]["TimeSlot"];
export type Availability = components["schemas"]["Availability"];

export type DayKind = "open" | "full" | "closed" | "too-soon" | "too-far";

export interface StripDay {
  /** `YYYY-MM-DD` in the dealership's zone. */
  date: string;
  kind: DayKind;
  /** Free start times; 0 for every kind but `open`. */
  count: number;
  /** How much of the day is still free, 0 to 1, for the fill bar. */
  fill: number;
}

const minutesOf = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** The opening hours of a local date: the date's own hours, its weekly hours, or none (closed). */
export function hoursOn(
  dealership: Dealership,
  date: string,
): { open: string; close: string } | null {
  const override = dealership.dateOverrides[date];
  if (override === "closed") return null;
  if (override) return override;
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const key = (weekday === 0 ? 7 : weekday) as keyof Dealership["weeklyHours"];
  return dealership.weeklyHours[key] ?? null;
}

/** Today in the dealership's zone. */
export function todayIn(dealership: Dealership, now: number): string {
  return localDateIn(now, dealership.timeZone);
}

/** The last day that may be booked: today plus the horizon (REQ-BOOK-011.AC-2). */
export function lastDay(dealership: Dealership, now: number): string {
  return addDaysToLocalDate(
    todayIn(dealership, now),
    dealership.policies.horizonDays,
  );
}

/**
 * The first day that may be booked (REQ-BOOK-011.AC-1): the day of now plus the lead time, or the day after
 * when that moment is already past the day's closing time.
 */
export function firstDay(dealership: Dealership, now: number): string {
  const earliest = now + dealership.policies.leadTimeMinutes * 60_000;
  const date = localDateIn(earliest, dealership.timeZone);
  const hours = hoursOn(dealership, date);
  return hours &&
    minutesOf(formatTime(earliest, dealership.timeZone)) >=
      minutesOf(hours.close)
    ? addDaysToLocalDate(date, 1)
    : date;
}

/** The seven dates of the week that starts on `start`. */
export function weekDates(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysToLocalDate(start, i));
}

/** The first day of the strip's week that holds `date`: weeks run from today in steps of seven days. */
export function weekStartFor(today: string, date: string): string {
  const days = Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      86_400_000,
  );
  return addDaysToLocalDate(today, Math.max(0, Math.floor(days / 7)) * 7);
}

/** True when the notice time leaves no start for a job of `minutes` on `date`. */
function tooSoon(
  dealership: Dealership,
  date: string,
  close: string,
  minutes: number,
  now: number,
): boolean {
  const earliest = now + dealership.policies.leadTimeMinutes * 60_000;
  const earliestDate = localDateIn(earliest, dealership.timeZone);
  if (earliestDate !== date) return earliestDate > date;
  return (
    minutesOf(formatTime(earliest, dealership.timeZone)) + minutes >
    minutesOf(close)
  );
}

/**
 * What a tile says. Closed and too far are known from the dealership alone; the rest need the day's
 * free times (`slots`, undefined while they load).
 */
export function describeDay(
  dealership: Dealership,
  date: string,
  slots: readonly TimeSlot[] | undefined,
  minutes: number,
  now: number,
): StripDay {
  const none = { date, count: 0, fill: 0 };
  if (date > lastDay(dealership, now)) return { ...none, kind: "too-far" };
  const hours = hoursOn(dealership, date);
  if (!hours) return { ...none, kind: "closed" };
  const count = slots?.length ?? 0;
  if (count > 0) {
    const grid = dealership.policies.gridMinutes;
    const possible = Math.max(
      1,
      Math.floor(
        (minutesOf(hours.close) - minutesOf(hours.open) - minutes) / grid,
      ) + 1,
    );
    return { date, kind: "open", count, fill: Math.min(1, count / possible) };
  }
  if (tooSoon(dealership, date, hours.close, minutes, now))
    return { ...none, kind: "too-soon" };
  return { ...none, kind: "full" };
}

/** True when the day may need its free times from the API. */
export function needsTimes(
  dealership: Dealership,
  date: string,
  now: number,
): boolean {
  return date <= lastDay(dealership, now) && hoursOn(dealership, date) !== null;
}

/** The words of a tile: "18 times", "1 time", "Closed", "Fully booked", "Too soon", "Too far ahead". */
export function dayNote(day: StripDay): string {
  switch (day.kind) {
    case "closed":
      return "Closed";
    case "full":
      return "Fully booked";
    case "too-soon":
      return "Too soon";
    case "too-far":
      return "Too far ahead";
    default:
      return `${day.count} ${day.count === 1 ? "time" : "times"}`;
  }
}

export type GroupLabel = "Morning" | "Afternoon" | "Evening";

export interface ChipTime {
  start: string;
  end: string;
  /** A time that is shown but cannot be chosen: struck through, with these words. */
  unavailable?: "Just taken" | "Too soon";
}

export interface TimeGroup {
  label: GroupLabel;
  times: ChipTime[];
}

/** Morning before 12:00, afternoon until 17:00, evening after. Empty groups are left out (8.8). */
export function groupTimes(
  times: readonly ChipTime[],
  zone: string,
): TimeGroup[] {
  const groups: Record<GroupLabel, ChipTime[]> = {
    Morning: [],
    Afternoon: [],
    Evening: [],
  };
  const sorted = [...times].sort((a, b) => a.start.localeCompare(b.start));
  for (const time of sorted) {
    const minute = minutesOf(formatTime(time.start, zone));
    const label: GroupLabel =
      minute < 12 * 60 ? "Morning" : minute < 17 * 60 ? "Afternoon" : "Evening";
    groups[label].push(time);
  }
  return (["Morning", "Afternoon", "Evening"] as const)
    .filter((label) => groups[label].length > 0)
    .map((label) => ({ label, times: groups[label] }));
}

/**
 * How many starts an empty day has in each group: every step of the grid from opening until the job still
 * fits before closing. The space held for the times while they load.
 */
export function possibleStarts(
  dealership: Dealership,
  date: string,
  minutes: number,
): number[] {
  const hours = hoursOn(dealership, date);
  const counts = [0, 0, 0];
  if (!hours) return counts;
  const grid = dealership.policies.gridMinutes;
  const last = minutesOf(hours.close) - minutes;
  for (let at = minutesOf(hours.open); at <= last; at += grid)
    counts[at < 12 * 60 ? 0 : at < 17 * 60 ? 1 : 2]! += 1;
  return counts;
}

/** "Morning · 10 times", "Afternoon · 1 time", "Morning · none left": only the times that can be chosen count. */
export function groupCount(group: TimeGroup): string {
  const n = group.times.filter((t) => !t.unavailable).length;
  return n === 0 ? "none left" : `${n} ${n === 1 ? "time" : "times"}`;
}

/** "Wed 28 Oct to Tue 3 Nov". */
export function weekLabel(start: string, thisYear: number): string {
  return `${formatLocalDate(start, thisYear)} to ${formatLocalDate(addDaysToLocalDate(start, 6), thisYear)}`;
}

/** Splits the suggestions of a 409: the same clock time on another day, and the rest, nearest first. */
export function splitSuggestions(
  wanted: string,
  suggestions: readonly TimeSlot[],
  zone: string,
): { closest: TimeSlot[]; sameTime: TimeSlot[] } {
  const clock = formatTime(wanted, zone);
  const day = localDateIn(wanted, zone);
  const same = (s: TimeSlot) =>
    formatTime(s.start, zone) === clock && localDateIn(s.start, zone) !== day;
  return {
    closest: suggestions.filter((s) => !same(s)),
    sameTime: suggestions.filter(same),
  };
}

/** The days of a week with times, nearest to `date` first. */
export function closestOpenDays(
  days: readonly StripDay[],
  date: string,
): StripDay[] {
  const distance = (d: string) =>
    Math.abs(Date.parse(`${d}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`));
  return days
    .filter((d) => d.kind === "open" && d.date !== date)
    .sort(
      (a, b) =>
        distance(a.date) - distance(b.date) || a.date.localeCompare(b.date),
    );
}

/** The instant of a local date and clock time in a zone (`2026-10-30`, `08:00`, `Europe/London`). */
export function instantAt(date: string, hhmm: string, zone: string): string {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  const wanted = Date.UTC(year, month - 1, day) + minutesOf(hhmm) * 60_000;
  let guess = wanted;
  // Two rounds find the zone's offset, also next to a clock change.
  for (let i = 0; i < 2; i += 1) {
    const shown =
      Date.parse(`${localDateIn(guess, zone)}T00:00:00Z`) +
      minutesOf(formatTime(guess, zone)) * 60_000;
    guess += wanted - shown;
  }
  return new Date(guess).toISOString().replace(".000Z", "Z");
}
