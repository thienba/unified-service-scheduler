// One technician's shifts form (manager.md 4.4, 5.4): its values, its checks, the body it sends and the words
// of its leave list. Pure functions, so each rule is tested on its own.
import type { components } from "../../../api/contract/schema";
import { addDaysToLocalDate } from "../../format/format";
import type { Problem } from "./settings-form";
import {
  dateWords,
  isTime,
  minutesOf,
  nextQuarter,
  onQuarter,
  weekdayIndexOf,
  weekdayKeys,
  weekdayNames,
} from "./words";

type Technician = components["schemas"]["Technician"];
type Shift = components["schemas"]["Shift"];
type Dealership = components["schemas"]["Dealership"];
export type ShiftsRequest = components["schemas"]["ShiftsRequest"];

export interface ShiftTimes {
  start: string;
  end: string;
  breakStart: string;
  breakEnd: string;
}

export interface ShiftRow extends ShiftTimes {
  off: boolean;
}

export interface EntryRow extends ShiftTimes {
  date: string;
  kind: "leave" | "changed";
  isNew: boolean;
}

export interface AddEntry extends ShiftTimes {
  first: string;
  last: string;
  kind: "leave" | "changed";
}

export interface ShiftsValues {
  days: ShiftRow[];
  entries: EntryRow[];
  add: AddEntry;
}

/** The most days one "Add to the list" may cover. */
export const MAX_ADD_DAYS = 31;

const noTimes: ShiftTimes = {
  start: "",
  end: "",
  breakStart: "",
  breakEnd: "",
};
export const emptyAddEntry: AddEntry = {
  first: "",
  last: "",
  kind: "leave",
  ...noTimes,
};

const timesOf = (shift: Shift): ShiftTimes => ({
  start: shift.start,
  end: shift.end,
  breakStart: shift.breakStart ?? "",
  breakEnd: shift.breakEnd ?? "",
});

function shiftOf(times: ShiftTimes): Shift {
  return times.breakStart && times.breakEnd
    ? {
        start: times.start,
        end: times.end,
        breakStart: times.breakStart,
        breakEnd: times.breakEnd,
      }
    : { start: times.start, end: times.end };
}

export function shiftsFromTechnician(
  technician: Technician,
  today: string,
): ShiftsValues {
  const days = weekdayKeys.map((key) => {
    const shift = technician.shiftPattern[key];
    return shift
      ? { off: false, ...timesOf(shift) }
      : { off: true, ...noTimes };
  });
  const entries = Object.entries(technician.shiftExceptions)
    .filter(([date]) => date >= today)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, exception]): EntryRow =>
      exception.kind === "leave"
        ? { date, kind: "leave", isNew: false, ...noTimes }
        : { date, kind: "changed", isNew: false, ...timesOf(exception.shift) },
    );
  return { days, entries, add: emptyAddEntry };
}

/** The body of `PUT /technicians/{id}/shifts`. Earlier dates go back unchanged. */
export function shiftsRequest(
  values: ShiftsValues,
  technician: Technician,
  today: string,
): ShiftsRequest {
  const shiftPattern: ShiftsRequest["shiftPattern"] = {};
  values.days.forEach((day, i) => {
    if (!day.off) shiftPattern[weekdayKeys[i]!] = shiftOf(day);
  });
  const shiftExceptions: ShiftsRequest["shiftExceptions"] = {};
  for (const [date, exception] of Object.entries(technician.shiftExceptions)) {
    if (date < today) shiftExceptions[date] = exception;
  }
  for (const entry of values.entries) {
    shiftExceptions[entry.date] =
      entry.kind === "leave"
        ? { kind: "leave" }
        : { kind: "changed", shift: shiftOf(entry) };
  }
  return { shiftPattern, shiftExceptions };
}

export const sameShifts = (a: ShiftsValues, b: ShiftsValues): boolean =>
  JSON.stringify({
    ...a,
    add: null,
    entries: a.entries.map((e) => ({ ...e, isNew: false })),
  }) ===
  JSON.stringify({
    ...b,
    add: null,
    entries: b.entries.map((e) => ({ ...e, isNew: false })),
  });

const fieldWords = {
  start: "starts at",
  end: "ends at",
  breakStart: "break starts at",
  breakEnd: "break ends at",
} as const;

/** The first thing wrong with one shift. `name` is the weekday, or "" for the add form. */
function shiftProblem(
  times: ShiftTimes,
  path: string,
  name: string,
  short: string,
  missing: Problem,
): Problem | null {
  const { start, end, breakStart, breakEnd } = times;
  if (!isTime(start) || !isTime(end)) return missing;
  const who = name || "The shift";
  const whose = name ? `${name}’s` : "The";
  for (const key of ["start", "end", "breakStart", "breakEnd"] as const) {
    const value = times[key];
    if (value === "" || !isTime(value) || onQuarter(value)) continue;
    const subject = key.startsWith("break")
      ? `${whose} ${fieldWords[key]}`
      : `${who} ${fieldWords[key]}`;
    return {
      path: `${path}.${key}`,
      message: `${subject} ${value}. Use a time on the quarter hour, for example ${nextQuarter(value)}.`,
      short: `${short}: use a time on the quarter hour.`,
    };
  }
  if (minutesOf(end) <= minutesOf(start)) {
    return {
      path: `${path}.end`,
      message: `${who} ends at ${end}, ${minutesOf(end) === minutesOf(start) ? "the same time it starts" : `before it starts at ${start}`}. Choose an end time after ${start}.`,
      short: `${short}: end time must be after start time.`,
    };
  }
  if ((breakStart === "") !== (breakEnd === "")) {
    const has = breakStart
      ? "a break start but no break end"
      : "a break end but no break start";
    return {
      path: `${path}.${breakStart ? "breakEnd" : "breakStart"}`,
      message: `${who} has ${has}. Add both break times, or leave both empty.`,
      short: breakStart
        ? `${short}: add the break end, or clear the break start.`
        : `${short}: add the break start, or clear the break end.`,
    };
  }
  if (breakStart === "") return null;
  if (!isTime(breakStart) || !isTime(breakEnd)) return null;
  if (minutesOf(breakEnd) <= minutesOf(breakStart)) {
    return {
      path: `${path}.breakEnd`,
      message: `${whose} break ends at ${breakEnd}, before it starts at ${breakStart}. Choose a break end after ${breakStart}.`,
      short: `${short}: the break must end after it starts.`,
    };
  }
  if (minutesOf(breakStart) < minutesOf(start)) {
    return {
      path: `${path}.breakStart`,
      message: `${whose} break starts at ${breakStart}, before the shift starts at ${start}. Put the break inside the shift.`,
      short: `${short}: the break must sit inside the shift.`,
    };
  }
  if (minutesOf(breakEnd) > minutesOf(end)) {
    return {
      path: `${path}.breakEnd`,
      message: `${whose} break ends at ${breakEnd}, after the shift ends at ${end}. Put the break inside the shift.`,
      short: `${short}: the break must sit inside the shift.`,
    };
  }
  return null;
}

/** Every date "Add to the list" would add: the first day to the last, or the first day alone. */
export function addDates(add: AddEntry): string[] {
  if (add.first === "") return [];
  const last = add.last === "" ? add.first : add.last;
  const dates: string[] = [];
  for (
    let d = add.first;
    d <= last && dates.length <= MAX_ADD_DAYS;
    d = addDaysToLocalDate(d, 1)
  ) {
    dates.push(d);
  }
  return dates;
}

/** What "Add to the list" would refuse. Also checked on Save while a first day is typed in. */
export function addEntryProblems(
  values: ShiftsValues,
  today: string,
): Problem[] {
  const { add } = values;
  const problems: Problem[] = [];
  if (add.first === "") {
    problems.push({
      path: "add.first",
      message: "Choose a first day.",
      short: "Add leave: choose a first day.",
    });
  } else if (add.first < today) {
    problems.push({
      path: "add.first",
      message: "Choose today or a later date.",
      short: "Add leave: choose today or a later date.",
    });
  } else if (add.last !== "" && add.last < add.first) {
    problems.push({
      path: "add.last",
      message:
        "The last day is before the first day. Choose the same day or a later one.",
      short: "Add leave: the last day is before the first day.",
    });
  } else if (addDates(add).length > MAX_ADD_DAYS) {
    problems.push({
      path: "add.last",
      message: `Choose up to ${MAX_ADD_DAYS} days at once.`,
      short: `Add leave: choose up to ${MAX_ADD_DAYS} days.`,
    });
  } else {
    const taken = addDates(add).find((d) =>
      values.entries.some((e) => e.date === d),
    );
    if (taken) {
      const day = dateWords(taken, today);
      problems.push({
        path: "add.first",
        message: `There is already a change for ${day}. Remove it first, then add it again.`,
        short: `Add leave: ${day} already has a change.`,
      });
    }
  }
  if (add.kind === "changed") {
    const problem = shiftProblem(add, "add", "", "Add leave", {
      path: isTime(add.start) ? "add.end" : "add.start",
      message: "Enter the start and end of the shift.",
      short: "Add leave: enter the start and end of the shift.",
    });
    if (problem) problems.push(problem);
  }
  return problems;
}

export function shiftsProblems(values: ShiftsValues, today: string): Problem[] {
  const problems: Problem[] = [];
  values.days.forEach((day, i) => {
    if (day.off) return;
    const name = weekdayNames[i]!;
    const problem = shiftProblem(day, `days.${i}`, name, name, {
      path: `days.${i}.${isTime(day.start) ? "end" : "start"}`,
      message: `${name} needs a start and an end time, or tick Day off.`,
      short: `${name}: add both times, or tick Day off.`,
    });
    if (problem) problems.push(problem);
  });
  if (values.add.first !== "")
    problems.push(...addEntryProblems(values, today));
  return problems;
}

/** "Works 09:00 to 13:00, no break", or with the break. */
export function shiftWords(times: ShiftTimes): string {
  const base = `Works ${times.start} to ${times.end}`;
  return times.breakStart && times.breakEnd
    ? `${base}, break ${times.breakStart} to ${times.breakEnd}`
    : `${base}, no break`;
}

export interface EntryWords {
  badge: {
    label: "On leave" | "Extra shift" | "Different shift";
    icon: "calendar" | "plus" | "clock";
  };
  summary: string;
  comparison: string;
}

export function entryRowWords(entry: EntryRow, days: ShiftRow[]): EntryWords {
  if (entry.kind === "leave") {
    return {
      badge: { label: "On leave", icon: "calendar" },
      summary: "On leave all day",
      comparison: "Not available for any booking.",
    };
  }
  const index = weekdayIndexOf(entry.date);
  const usual = days[index]!;
  if (usual.off) {
    return {
      badge: { label: "Extra shift", icon: "plus" },
      summary: shiftWords(entry),
      comparison: `Extra shift: the weekly pattern has ${weekdayNames[index]} off.`,
    };
  }
  return {
    badge: { label: "Different shift", icon: "clock" },
    summary: shiftWords(entry),
    comparison: `Replaces the usual ${usual.start} to ${usual.end}.`,
  };
}

/** "Dealership open 08:00 to 18:00" or "Dealership closed", under each weekday's name. */
export function dealershipHint(dealership: Dealership, index: number): string {
  const hours = dealership.weeklyHours[weekdayKeys[index]!];
  return hours
    ? `Dealership open ${hours.open} to ${hours.close}`
    : "Dealership closed";
}

/** One weekday's change as a short line, for the phone bar ("Monday now ends at 17:00"). */
export function shiftDayChange(
  name: string,
  before: ShiftRow,
  after: ShiftRow,
): string {
  if (after.off) return `${name} is now a day off`;
  if (before.off) return `${name} now works ${after.start} to ${after.end}`;
  if (before.start !== after.start)
    return `${name} now starts at ${after.start}`;
  if (before.end !== after.end) return `${name} now ends at ${after.end}`;
  return `${name}’s break changed`;
}

/** "Leave added for Mon 2 Nov", or for several days. */
export function addedLine(
  add: AddEntry,
  dates: string[],
  today: string,
): string {
  const what = add.kind === "leave" ? "Leave" : "A different shift";
  const first = dateWords(dates[0]!, today);
  return dates.length === 1
    ? `${what} added for ${first}`
    : `${what} added for ${dates.length} days from ${first}`;
}
