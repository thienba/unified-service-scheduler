// Small helpers shared by the two manager forms (manager.md 5.3 and 5.4): clock times, weekdays and counts in words.
import { formatDuration, formatLocalDate } from "../../format/format";

export const weekdayNames = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/** The contract's weekday keys, `1` Monday to `7` Sunday, in the order of `weekdayNames`. */
export const weekdayKeys = ["1", "2", "3", "4", "5", "6", "7"] as const;
export type WeekdayKey = (typeof weekdayKeys)[number];

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isTime = (value: string): boolean => TIME.test(value);

export function minutesOf(time: string): number {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return h * 60 + m;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const timeOf = (minutes: number): string =>
  `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

export const onQuarter = (time: string): boolean => minutesOf(time) % 15 === 0;

/** The next time on the quarter hour, for the example in a message ("for example 08:15"). */
export function nextQuarter(time: string): string {
  return timeOf(Math.min(Math.ceil(minutesOf(time) / 15) * 15, 23 * 60 + 45));
}

/** The index in `weekdayNames` (0 Monday) of a local date `YYYY-MM-DD`. */
export function weekdayIndexOf(localDate: string): number {
  const [y = 0, m = 1, d = 1] = localDate.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** "Fri 25 Dec", with the year when it is not this year. */
export function dateWords(localDate: string, today: string): string {
  return formatLocalDate(localDate, Number(today.slice(0, 4)));
}

const words = [
  "No",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
];
/** A count that starts a sentence: "Two", or "12" above ten. */
export const countWord = (n: number): string => words[n] ?? String(n);

/** "1 booking", "2 bookings". */
export const bookings = (n: number): string =>
  `${n} ${n === 1 ? "booking" : "bookings"}`;

/** "1 hour", "2 hours 15 minutes", from two clock times. */
export const gap = (from: string, to: string): string =>
  formatDuration(Math.abs(minutesOf(to) - minutesOf(from)));
