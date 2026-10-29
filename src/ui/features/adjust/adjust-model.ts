// The words and rules of the `adjust` screen (manager.md 4.1, 5.1; REQ-BOOK-005). No booking rule is here: the API
// decides whether a change fits. This file only turns the form and the answers into words.
import type { components } from "../../../api/contract/schema";
import type { Dealership } from "../../data/api-problem";
import { reasonInWords } from "../../data/words";
import {
  formatDay,
  formatDuration,
  formatTime,
  formatTimeRange,
  localDateIn,
} from "../../format/format";

export type Appointment = components["schemas"]["Appointment"];
export type TimeSlot = components["schemas"]["TimeSlot"];
export type ScheduleDay = components["schemas"]["ScheduleDay"];
export type FlagKind = components["schemas"]["AppointmentFlag"]["kind"];

/** What the form holds. An empty technician or bay means "Same as now". */
export interface AdjustValues {
  date: string;
  time: string;
  technicianId: string;
  serviceBayId: string;
}

export function valuesOf(a: Appointment): AdjustValues {
  return {
    date: localDateIn(a.start, a.timeZone),
    time: formatTime(a.start, a.timeZone),
    technicianId: "",
    serviceBayId: "",
  };
}

export interface FieldProblem {
  name: "date" | "time";
  /** Under the field. */
  message: string;
  /** In the summary list: "Date: choose today or a later date." */
  summary: string;
}

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isRealDate(text: string): boolean {
  if (!LOCAL_DATE.test(text)) return false;
  const at = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(at.getTime()) && at.toISOString().startsWith(text);
}

/** The field problems the screen finds before it sends anything (manager.md 5.1, `validation`). */
export function fieldProblems(
  values: AdjustValues,
  today: string,
  gridMinutes: number,
): FieldProblem[] {
  const problems: FieldProblem[] = [];
  if (!isRealDate(values.date)) {
    problems.push({
      name: "date",
      message: "Choose a date.",
      summary: "Date: choose a date.",
    });
  } else if (values.date < today) {
    problems.push({
      name: "date",
      message: "That date has passed. Choose today or a later date.",
      summary: "Date: choose today or a later date.",
    });
  }
  const clock = CLOCK.exec(values.time);
  if (!clock) {
    problems.push({
      name: "time",
      message: "Choose a start time.",
      summary: "Start time: choose a start time.",
    });
  } else if (Number(clock[2]) % gridMinutes !== 0) {
    problems.push({
      name: "time",
      message: "Use a time on the quarter hour, for example 09:15.",
      summary: "Start time: use a time on the quarter hour.",
    });
  }
  return problems;
}

/** What the PATCH carries: only what differs from the appointment. Null when nothing does (D-0001-48 g). */
export function changeOf(
  a: Appointment,
  values: AdjustValues,
  start: string | null,
): { start?: string; technicianId?: string; serviceBayId?: string } | null {
  const body: { start?: string; technicianId?: string; serviceBayId?: string } =
    {};
  if (start !== null && Date.parse(start) !== Date.parse(a.start))
    body.start = start;
  if (values.technicianId !== "") body.technicianId = values.technicianId;
  if (values.serviceBayId !== "") body.serviceBayId = values.serviceBayId;
  return Object.keys(body).length === 0 ? null : body;
}

export function sameValues(x: AdjustValues, y: AdjustValues): boolean {
  return (
    x.date === y.date &&
    x.time === y.time &&
    x.technicianId === y.technicianId &&
    x.serviceBayId === y.serviceBayId
  );
}

/** "Fri 30 Oct, 09:15". */
export function dayAndTime(instant: string, zone: string, now: number): string {
  return `${formatDay(instant, zone, now)}, ${formatTime(instant, zone)}`;
}

/** "Fri 30 Oct, 09:15 to 12:15". */
export function dayAndRange(
  start: string,
  end: string,
  zone: string,
  now: number,
): string {
  return `${formatDay(start, zone, now)}, ${formatTimeRange(start, end, zone)}`;
}

/** "Ends 12:15. The job takes about 3 hours." */
export function endsText(end: string, zone: string, minutes: number): string {
  return `Ends ${formatTime(end, zone)}. The job takes about ${formatDuration(minutes)}.`;
}

/** A bay inside a sentence: "in bay 1" (the design writes the word in lower case there). */
export function bayInSentence(name: string): string {
  return name.replace(/^Bay /, "bay ");
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** One reason in words, with the dealership's own notice and horizon (design.md section 9, D-0001-45 A). */
export function reasonText(code: string, dealership: Dealership | undefined) {
  if (code === "TOO_SOON" && dealership)
    return `bookings need at least ${formatDuration(dealership.policies.leadTimeMinutes)} notice`;
  if (code === "BEYOND_HORIZON" && dealership)
    return `bookings open up to ${dealership.policies.horizonDays} days ahead`;
  return reasonInWords(code);
}

/** "Every technician who can do this job is busy then. The appointment is still at 09:15 with Maya Okafor in bay 1." */
export function clashText(
  reasons: readonly string[],
  a: Appointment,
  dealership: Dealership | undefined,
): string {
  const words = [...new Set(reasons)].map((r) => reasonText(r, dealership));
  const why = capitalise(
    words.length === 0 ? "that time is not free" : words.join(" and "),
  );
  const tech = a.display.technicianName ?? "the same technician";
  const bay = bayInSentence(a.display.serviceBayName ?? "the same bay");
  return `${why}. The appointment is still at ${formatTime(a.start, a.timeZone)} with ${tech} in ${bay}.`;
}

/** The flag's own words from the API (D-0001-34 A, D-0001-69), one sentence for each flag. */
export function flagSentences(a: Appointment): string {
  return a.flags.map((f) => `${f.reason}.`).join(" ");
}

export const flagBadgeWords: Record<FlagKind, string> = {
  outside_shift: "Outside the technician’s shift",
  outside_opening_hours: "Outside opening hours",
};

/** The phone bar's status line for a flagged booking: "Flagged: outside the shift". */
export function flaggedStatus(a: Appointment): string {
  const kinds = new Set(a.flags.map((f) => f.kind));
  const words = [
    ...(kinds.has("outside_shift") ? ["outside the shift"] : []),
    ...(kinds.has("outside_opening_hours") ? ["outside opening hours"] : []),
  ];
  return `Flagged: ${words.join(" and ")}`;
}

/** "Change saved" text (manager.md 5.1): the new time, who and where, who was picked, and the message. */
export function savedText(
  before: Appointment,
  after: Appointment,
  picked: { technicianId?: string; serviceBayId?: string } | undefined,
  now: number,
): string {
  const zone = after.timeZone;
  const parts = [
    `The appointment is now ${dayAndRange(after.start, after.end, zone, now)} with ${after.display.technicianName ?? ""} in ${bayInSentence(after.display.serviceBayName ?? "")}.`,
  ];
  if (picked?.technicianId)
    parts.push(
      `${before.display.technicianName ?? "The technician"} was busy then, so ${after.display.technicianName ?? "another technician"} was picked.`,
    );
  if (picked?.serviceBayId)
    parts.push(
      `${capitalise(bayInSentence(before.display.serviceBayName ?? "the bay"))} was busy then, so ${bayInSentence(after.display.serviceBayName ?? "another bay")} was picked.`,
    );
  if (moved(before, after))
    parts.push("The customer has a new message in the outbox.");
  return parts.join(" ");
}

export function moved(before: Appointment, after: Appointment): boolean {
  return Date.parse(before.start) !== Date.parse(after.start);
}

export type Tag = "Changed" | "Refused";

export interface SummaryRow {
  label: string;
  now: string;
  after: string;
  tag?: Tag | undefined;
}

/** The rows of "What changes" while the form is being edited. `refused` tags every row that differs. */
export function editRows(
  a: Appointment,
  values: AdjustValues,
  start: string | null,
  minutes: number,
  names: { technician: string | undefined; bay: string | undefined },
  refused: boolean,
  now: number,
): SummaryRow[] {
  const zone = a.timeZone;
  const tech = a.display.technicianName ?? "";
  const bay = a.display.serviceBayName ?? "";
  const nowTime = dayAndRange(a.start, a.end, zone, now);
  const timeMoves = start !== null && Date.parse(start) !== Date.parse(a.start);
  const tag: Tag = refused ? "Refused" : "Changed";
  const afterTime =
    start === null
      ? nowTime
      : dayAndRange(
          start,
          new Date(Date.parse(start) + minutes * 60_000).toISOString(),
          zone,
          now,
        );
  const afterTech =
    values.technicianId !== ""
      ? (names.technician ?? tech)
      : timeMoves && !refused
        ? `${tech}, or another free technician`
        : tech;
  const afterBay =
    values.serviceBayId !== ""
      ? (names.bay ?? bay)
      : timeMoves && !refused
        ? `${bay}, or another free bay`
        : bay;
  return [
    {
      label: "Time",
      now: nowTime,
      after: afterTime,
      tag: timeMoves ? tag : undefined,
    },
    {
      label: "Technician",
      now: tech,
      after: afterTech,
      tag:
        values.technicianId !== ""
          ? tag
          : timeMoves && !refused
            ? tag
            : undefined,
    },
    {
      label: "Bay",
      now: bay,
      after: afterBay,
      tag:
        values.serviceBayId !== ""
          ? tag
          : timeMoves && !refused
            ? tag
            : undefined,
    },
  ];
}

/** The rows after a save: the old values beside the new ones. */
export function savedRows(
  before: Appointment,
  after: Appointment,
  now: number,
): SummaryRow[] {
  const zone = after.timeZone;
  const row = (label: string, was: string, is: string): SummaryRow => ({
    label,
    now: was,
    after: is,
    tag: was === is ? undefined : "Changed",
  });
  return [
    row(
      "Time",
      dayAndRange(before.start, before.end, zone, now),
      dayAndRange(after.start, after.end, zone, now),
    ),
    row(
      "Technician",
      before.display.technicianName ?? "",
      after.display.technicianName ?? "",
    ),
    row(
      "Bay",
      before.display.serviceBayName ?? "",
      after.display.serviceBayName ?? "",
    ),
  ];
}

/** A technician in the select: "Tomas Havel · works 08:00 to 17:00" on the chosen day. */
export function technicianOption(
  t: ScheduleDay["technicians"][number],
  zone: string,
): string {
  if (t.onLeave) return `${t.name} · on leave this day`;
  if (!t.shift) return `${t.name} · not working this day`;
  return `${t.name} · works ${formatTimeRange(t.shift.start, t.shift.end, zone)}`;
}
