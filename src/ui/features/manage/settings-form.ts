// The dealership settings form (manager.md 4.3, 5.3): its values, its checks, the body it sends and the words
// of its date list. Pure functions, so each rule is tested on its own.
import type { components } from "../../../api/contract/schema";
import {
  dateWords,
  gap,
  isTime,
  minutesOf,
  nextQuarter,
  onQuarter,
  weekdayIndexOf,
  weekdayKeys,
  weekdayNames,
} from "./words";

type Dealership = components["schemas"]["Dealership"];
export type SettingsRequest = components["schemas"]["SettingsRequest"];
type DateOverride = components["schemas"]["DateOverride"];

export interface HoursRow {
  off: boolean;
  open: string;
  close: string;
}

export interface DateRow {
  date: string;
  kind: "hours" | "closed";
  open: string;
  close: string;
  /** Added in this visit and not saved yet. */
  isNew: boolean;
}

export type AddDate = Omit<DateRow, "isNew">;

export interface SettingsValues {
  days: HoursRow[];
  dates: DateRow[];
  add: AddDate;
  notice: string;
  horizon: string;
  breakMinutes: string;
}

/** One thing to fix: the long words go under the field, the short ones in the summary. */
export interface Problem {
  path: string;
  message: string;
  short: string;
}

export const emptyAdd: AddDate = {
  date: "",
  kind: "hours",
  open: "",
  close: "",
};

/** The form as the API last answered. Dates before `today` are not shown (they are kept and sent back). */
export function settingsFromDealership(
  dealership: Dealership,
  today: string,
): SettingsValues {
  const days = weekdayKeys.map((key) => {
    const hours = dealership.weeklyHours[key];
    return hours
      ? { off: false, open: hours.open, close: hours.close }
      : { off: true, open: "", close: "" };
  });
  const dates = Object.entries(dealership.dateOverrides)
    .filter(([date]) => date >= today)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) =>
      value === "closed"
        ? { date, kind: "closed" as const, open: "", close: "", isNew: false }
        : {
            date,
            kind: "hours" as const,
            open: value.open,
            close: value.close,
            isNew: false,
          },
    );
  const lead = dealership.policies.leadTimeMinutes / 60;
  return {
    days,
    dates,
    add: emptyAdd,
    notice: String(lead),
    horizon: String(dealership.policies.horizonDays),
    breakMinutes: String(dealership.policies.breakMinutes),
  };
}

/** The whole settings, as `PUT /dealerships/{id}/settings` takes them. Earlier dates go back unchanged. */
export function settingsRequest(
  values: SettingsValues,
  dealership: Dealership,
  today: string,
): SettingsRequest {
  const weeklyHours: SettingsRequest["weeklyHours"] = {};
  values.days.forEach((day, i) => {
    if (!day.off)
      weeklyHours[weekdayKeys[i]!] = { open: day.open, close: day.close };
  });
  const dateOverrides: Record<string, DateOverride> = {};
  for (const [date, value] of Object.entries(dealership.dateOverrides)) {
    if (date < today) dateOverrides[date] = value;
  }
  for (const row of values.dates) {
    dateOverrides[row.date] =
      row.kind === "closed" ? "closed" : { open: row.open, close: row.close };
  }
  return {
    weeklyHours,
    dateOverrides,
    policies: {
      leadTimeMinutes: Number(values.notice) * 60,
      horizonDays: Number(values.horizon),
      breakMinutes: Number(values.breakMinutes),
    },
  };
}

/** The same values, compared as the API would store them. */
export const sameSettings = (a: SettingsValues, b: SettingsValues): boolean =>
  JSON.stringify({
    ...a,
    add: null,
    dates: a.dates.map((d) => ({ ...d, isNew: false })),
  }) ===
  JSON.stringify({
    ...b,
    add: null,
    dates: b.dates.map((d) => ({ ...d, isNew: false })),
  });

function hoursProblem(
  open: string,
  close: string,
  path: string,
  name: string,
  short: string,
  missing: Problem,
): Problem | null {
  if (!isTime(open) || !isTime(close)) return missing;
  const subject = name === "" ? "" : `${name} `;
  const cap = (s: string) =>
    name === "" ? s[0]!.toUpperCase() + s.slice(1) : s;
  if (!onQuarter(open)) {
    return {
      path: `${path}.open`,
      message: `${subject}${cap(`opens at ${open}`)}. Use a time on the quarter hour, for example ${nextQuarter(open)}.`,
      short: `${short}: use a time on the quarter hour.`,
    };
  }
  if (!onQuarter(close)) {
    return {
      path: `${path}.close`,
      message: `${subject}${cap(`closes at ${close}`)}. Use a time on the quarter hour, for example ${nextQuarter(close)}.`,
      short: `${short}: use a time on the quarter hour.`,
    };
  }
  if (minutesOf(close) <= minutesOf(open)) {
    const when =
      minutesOf(close) === minutesOf(open)
        ? "the same time it opens"
        : `before it opens at ${open}`;
    return {
      path: `${path}.close`,
      message: `${subject}${cap(`closes at ${close}`)}, ${when}. Choose a closing time after ${open}.`,
      short: `${short}: closing time must be after opening time.`,
    };
  }
  return null;
}

function wholeNumber(value: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const n = Number(value);
  return n >= min && n <= max ? n : null;
}

/** What "Add this date" would refuse. Also checked on Save while a date is typed in it. */
export function addDateProblems(
  values: SettingsValues,
  today: string,
): Problem[] {
  const { add } = values;
  const problems: Problem[] = [];
  if (add.date === "") {
    problems.push({
      path: "add.date",
      message: "Choose a date.",
      short: "Add a date: choose a date.",
    });
  } else if (add.date < today) {
    problems.push({
      path: "add.date",
      message: "Choose today or a later date.",
      short: "Add a date: choose today or a later date.",
    });
  } else if (values.dates.some((d) => d.date === add.date)) {
    const day = dateWords(add.date, today);
    problems.push({
      path: "add.date",
      message: `There is already a change for ${day}. Remove it first, then add it again.`,
      short: `Add a date: ${day} already has a change.`,
    });
  }
  if (add.kind === "hours") {
    const times = hoursProblem(add.open, add.close, "add", "", "Add a date", {
      path: isTime(add.open) ? "add.close" : "add.open",
      message: "Enter the opening and closing times for this date.",
      short: "Add a date: enter both times.",
    });
    if (times) problems.push(times);
  }
  return problems;
}

/** Everything Save refuses, in the order of the page. */
export function settingsProblems(
  values: SettingsValues,
  today: string,
): Problem[] {
  const problems: Problem[] = [];
  values.days.forEach((day, i) => {
    if (day.off) return;
    const name = weekdayNames[i]!;
    const problem = hoursProblem(day.open, day.close, `days.${i}`, name, name, {
      path: `days.${i}.${isTime(day.open) ? "close" : "open"}`,
      message: `${name} needs an opening and a closing time, or tick Closed.`,
      short: `${name}: add both times, or tick Closed.`,
    });
    if (problem) problems.push(problem);
  });
  if (values.add.date !== "") problems.push(...addDateProblems(values, today));
  if (wholeNumber(values.notice, 0, 72) === null) {
    problems.push({
      path: "notice",
      message:
        values.notice.trim() === ""
          ? "Enter the shortest notice, between 0 and 72 hours."
          : `Shortest notice must be between 0 and 72 hours. You entered ${values.notice.trim()}.`,
      short: "Shortest notice: choose 0 to 72 hours.",
    });
  }
  if (wholeNumber(values.horizon, 1, 365) === null) {
    problems.push({
      path: "horizon",
      message: "Furthest ahead must be between 1 and 365 days.",
      short: "Furthest ahead: choose 1 to 365 days.",
    });
  }
  if (wholeNumber(values.breakMinutes, 0, 60) === null) {
    problems.push({
      path: "breakMinutes",
      message: "Break must be between 0 and 60 minutes.",
      short: "Break: choose 0 to 60 minutes.",
    });
  }
  return problems;
}

export interface DateRowWords {
  badge: {
    label: "Longer" | "Shorter" | "Closed";
    icon: "plus" | "minus" | "x";
  } | null;
  summary: string;
  comparison: string;
}

/** How a date in the list differs from the usual hours of its weekday (manager.md 5.3). */
export function dateRowWords(row: DateRow, days: HoursRow[]): DateRowWords {
  const usual = days[weekdayIndexOf(row.date)]!;
  const usualText = usual.off ? null : `${usual.open} to ${usual.close}`;
  if (row.kind === "closed") {
    return {
      badge: { label: "Closed", icon: "x" },
      summary: "Closed all day",
      comparison: usualText
        ? `Replaces the usual ${usualText}.`
        : "The dealership is usually closed on this weekday too.",
    };
  }
  const summary = `Open ${row.open} to ${row.close}`;
  if (!usualText) {
    return {
      badge: { label: "Longer", icon: "plus" },
      summary,
      comparison:
        "Longer than usual: the dealership is usually closed on this weekday.",
    };
  }
  const parts: string[] = [];
  const o = minutesOf(row.open) - minutesOf(usual.open);
  const c = minutesOf(row.close) - minutesOf(usual.close);
  if (o !== 0)
    parts.push(
      `opens ${gap(usual.open, row.open)} ${o < 0 ? "earlier" : "later"}`,
    );
  if (c !== 0)
    parts.push(
      `closes ${gap(usual.close, row.close)} ${c > 0 ? "later" : "earlier"}`,
    );
  if (parts.length === 0) {
    return {
      badge: null,
      summary,
      comparison: `The same as the usual ${usualText}.`,
    };
  }
  const longer = c - o > 0;
  return {
    badge: longer
      ? { label: "Longer", icon: "plus" }
      : { label: "Shorter", icon: "minus" },
    summary,
    comparison: `${longer ? "Longer" : "Shorter"} than usual: ${parts.join(" and ")} (usual ${usualText}).`,
  };
}

/** One weekday's hours as a short line, for the phone bar and the warning ("Saturday now closes at 14:00"). */
export function weekdayChange(
  name: string,
  before: HoursRow,
  after: HoursRow,
): string {
  if (after.off) return `${name} is now closed`;
  if (before.off) return `${name} now opens ${after.open} to ${after.close}`;
  if (before.open === after.open) return `${name} now closes at ${after.close}`;
  if (before.close === after.close) return `${name} now opens at ${after.open}`;
  return `${name} now opens ${after.open} to ${after.close}`;
}
