// The words of the warning before saving and of the result (manager.md 5.3, 5.4; D-0001-36 A). A booking counts
// as touched when the preview has it flagged and it was not flagged before the change.
import type { components } from "../../../api/contract/schema";
import { formatDay, formatTime, localDateIn } from "../../format/format";
import type { FlagImpactBooking } from "../../components/FlagImpactDialog";
import type { HoursRow, SettingsValues } from "./settings-form";
import type { ShiftTimes, ShiftsValues } from "./shifts-form";
import {
  bookings,
  countWord,
  dateWords,
  gap,
  minutesOf,
  weekdayIndexOf,
  weekdayNames,
} from "./words";

export type Appointment = components["schemas"]["Appointment"];

/** The appointments the change flags that were not flagged before it, soonest first. */
export function newlyFlagged(
  after: readonly Appointment[],
  flaggedBefore: ReadonlySet<string>,
): Appointment[] {
  return after
    .filter((a) => !flaggedBefore.has(a.id))
    .sort((a, b) => a.start.localeCompare(b.start));
}

const apiReason = (a: Appointment) => a.flags[0]?.reason ?? "no longer fits";

/** The hours that apply on one date after the change: its own entry, or its weekday's. */
function hoursOn(values: SettingsValues, date: string): HoursRow {
  const own = values.dates.find((d) => d.date === date);
  if (own) {
    return own.kind === "closed"
      ? { off: true, open: "", close: "" }
      : { off: false, open: own.open, close: own.close };
  }
  return values.days[weekdayIndexOf(date)]!;
}

function hoursReason(a: Appointment, values: SettingsValues, zone: string) {
  if (!a.flags.some((f) => f.kind === "outside_opening_hours")) {
    return apiReason(a);
  }
  const hours = hoursOn(values, localDateIn(a.start, zone));
  if (hours.off) return "the dealership is closed that day";
  const start = formatTime(a.start, zone);
  const end = formatTime(a.end, zone);
  if (minutesOf(end) > minutesOf(hours.close)) {
    return `ends ${gap(hours.close, end)} after closing`;
  }
  if (minutesOf(start) < minutesOf(hours.open)) {
    return `starts ${gap(start, hours.open)} before opening`;
  }
  return apiReason(a);
}

/** The shift that applies on one date after the change, or why there is none. */
function shiftOn(
  values: ShiftsValues,
  date: string,
): ShiftTimes | "leave" | "off" {
  const own = values.entries.find((e) => e.date === date);
  if (own) return own.kind === "leave" ? "leave" : own;
  const day = values.days[weekdayIndexOf(date)]!;
  return day.off ? "off" : day;
}

function shiftReason(
  a: Appointment,
  values: ShiftsValues,
  name: string,
  zone: string,
) {
  if (!a.flags.some((f) => f.kind === "outside_shift")) return apiReason(a);
  const shift = shiftOn(values, localDateIn(a.start, zone));
  if (shift === "leave") return `${name} is on leave`;
  if (shift === "off") return `${name} has the day off`;
  const start = formatTime(a.start, zone);
  const end = formatTime(a.end, zone);
  if (minutesOf(end) > minutesOf(shift.end)) {
    return `ends ${gap(shift.end, end)} after ${name}’s shift`;
  }
  if (minutesOf(start) < minutesOf(shift.start)) {
    return `starts ${gap(start, shift.start)} before ${name}’s shift`;
  }
  if (shift.breakStart && shift.breakEnd) return `${name} is on a break then`;
  return apiReason(a);
}

function row(a: Appointment, zone: string, reason: string): FlagImpactBooking {
  const parts = [
    a.display.serviceTypeName,
    a.display.customerName,
    reason,
  ].filter((p): p is string => Boolean(p));
  return {
    key: a.id,
    when: `${formatDay(a.start, zone)}, ${formatTime(a.start, zone)} to ${formatTime(a.end, zone)}`,
    detail: parts.join(" · "),
  };
}

export const hoursRows = (
  touched: readonly Appointment[],
  values: SettingsValues,
  zone: string,
) => touched.map((a) => row(a, zone, hoursReason(a, values, zone)));

export const shiftRows = (
  touched: readonly Appointment[],
  values: ShiftsValues,
  name: string,
  zone: string,
) => touched.map((a) => row(a, zone, shiftReason(a, values, name, zone)));

/** "Two bookings on Sat 31 Oct", or "Two bookings" when they are on different dates. */
function countOn(touched: readonly Appointment[], zone: string, today: string) {
  const dates = new Set(touched.map((a) => localDateIn(a.start, zone)));
  const base = `${countWord(touched.length)} ${touched.length === 1 ? "booking" : "bookings"}`;
  return dates.size === 1
    ? { text: `${base} on ${dateWords([...dates][0]!, today)}`, oneDate: true }
    : { text: base, oneDate: false };
}

/** The first lines of the settings warning: what changed, then which bookings it touches. */
export function hoursChangeSentence(
  before: SettingsValues,
  after: SettingsValues,
  touched: readonly Appointment[],
  zone: string,
  today: string,
): string {
  const n = touched.length;
  const changedDays = after.days
    .map((day, i) => i)
    .filter(
      (i) => JSON.stringify(before.days[i]) !== JSON.stringify(after.days[i]),
    );
  const key = (d: SettingsValues["dates"][number]) =>
    JSON.stringify([d.date, d.kind, d.open, d.close]);
  const beforeDates = new Set(before.dates.map(key));
  const afterDates = new Set(after.dates.map(key));
  const changedDates = [
    ...after.dates.filter((d) => !beforeDates.has(key(d))).map((d) => d.date),
    ...before.dates.filter((d) => !afterDates.has(key(d))).map((d) => d.date),
  ];
  const { text } = countOn(touched, zone, today);
  const noLongerFit = `${text} no longer ${n === 1 ? "fits" : "fit"}.`;

  if (changedDays.length === 1 && changedDates.length === 0) {
    const i = changedDays[0]!;
    const name = weekdayNames[i]!;
    const b = before.days[i]!;
    const a = after.days[i]!;
    let what: string;
    if (a.off) what = "it is now closed";
    else if (b.off) what = `it is now open ${a.open} to ${a.close}`;
    else if (b.open === a.open)
      what = `it now closes at ${a.close} instead of ${b.close}`;
    else if (b.close === a.close)
      what = `it now opens at ${a.open} instead of ${b.open}`;
    else
      what = `it is now open ${a.open} to ${a.close} instead of ${b.open} to ${b.close}`;
    const closesEarlier =
      !a.off &&
      !b.off &&
      b.open === a.open &&
      minutesOf(a.close) < minutesOf(b.close);
    const allEndAfter = touched.every(
      (t) => minutesOf(formatTime(t.end, zone)) > minutesOf(a.close),
    );
    const second =
      closesEarlier && allEndAfter
        ? `${text} ${n === 1 ? "ends" : "end"} after that.`
        : noLongerFit;
    return `You changed ${name}: ${what}. ${second}`;
  }
  if (changedDays.length === 0 && new Set(changedDates).size === 1) {
    const date = changedDates[0]!;
    const entry = after.dates.find((d) => d.date === date);
    const day = dateWords(date, today);
    const what = !entry
      ? "it goes back to the usual hours"
      : entry.kind === "closed"
        ? "the dealership is now closed that day"
        : `it is now open ${entry.open} to ${entry.close}`;
    return `You changed ${day}: ${what}. ${noLongerFit}`;
  }
  return `You changed the opening hours. ${noLongerFit}`;
}

/** The first lines of the shifts warning. */
export function shiftsChangeSentence(
  before: ShiftsValues,
  after: ShiftsValues,
  touched: readonly Appointment[],
  name: string,
  zone: string,
  today: string,
): string {
  const n = touched.length;
  const known = new Set(
    before.entries.map((e) => JSON.stringify({ ...e, isNew: false })),
  );
  const added = after.entries.filter(
    (e) => !known.has(JSON.stringify({ ...e, isNew: false })),
  );
  const sameOtherwise =
    JSON.stringify(before.days) === JSON.stringify(after.days) &&
    before.entries.every((e) => after.entries.some((x) => x.date === e.date));
  if (
    sameOtherwise &&
    added.length > 0 &&
    added.every((e) => e.kind === "leave")
  ) {
    const dates = added.map((e) => e.date).sort();
    const onLeave = new Set(dates);
    const first = dateWords(dates[0]!, today);
    const marked =
      dates.length === 1
        ? `You marked ${name} on leave on ${first}.`
        : `You marked ${name} on leave on ${dates.length} days from ${first}.`;
    if (touched.every((t) => onLeave.has(localDateIn(t.start, zone)))) {
      const are = n === 1 ? "is" : "are";
      const when = dates.length === 1 ? "that day" : "on those days";
      return `${marked} ${countWord(n)} ${n === 1 ? "booking" : "bookings"} ${are} with ${name} ${when}.`;
    }
    return `${marked} ${countWord(n)} of ${name}’s bookings no longer ${n === 1 ? "fits" : "fit"}.`;
  }
  return `You changed ${name}’s shifts. ${countWord(n)} of ${name}’s bookings no longer ${n === 1 ? "fits" : "fit"}.`;
}

/** The result panels and toasts (manager.md 5.3, 5.4). */
export function savedWords(
  screen: "settings" | "shifts",
  flagged: number,
  name = "",
) {
  const lead =
    screen === "settings"
      ? "The new hours apply to new bookings now."
      : `${name}’s new shifts count in every search from now on.`;
  if (flagged === 0) {
    return screen === "settings"
      ? {
          title: "Settings saved",
          body: "The new hours and rules apply to new bookings now. Every booking that already exists still fits.",
          toast: "Dealership settings saved.",
        }
      : {
          title: "Shifts saved",
          body: `${lead} Every booking ${name} has still fits.`,
          toast: `Shifts saved for ${name}.`,
        };
  }
  const these =
    flagged === 1
      ? "This booking is still booked and is now flagged. Move or cancel it."
      : `These ${flagged} bookings are still booked and are now flagged. Move or cancel each one.`;
  return {
    title: `Saved. ${bookings(flagged)} no longer ${flagged === 1 ? "fits" : "fit"}.`,
    body: `${lead} ${these}`,
    toast: `${screen === "settings" ? "Dealership settings saved" : "Shifts saved"}. ${bookings(flagged)} flagged.`,
  };
}
