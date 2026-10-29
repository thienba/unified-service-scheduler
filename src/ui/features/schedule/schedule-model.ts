// What the schedule draws, worked out from one `ScheduleDay` answer (staff.md 5.1). No booking rule is
// here: shifts, breaks and free windows come from the API (D-0001-21 A). This file only places them on
// the time axis and writes the words.
import type { components } from "../../../api/contract/schema";
import { transportWords, type Transport } from "../../components/Badge";
import {
  formatDuration,
  formatTime,
  formatTimeRange,
} from "../../format/format";

export type ScheduleDay = components["schemas"]["ScheduleDay"];
export type ScheduleTechnician = components["schemas"]["ScheduleTechnician"];
export type Appointment = components["schemas"]["Appointment"];
export type TimeSlot = components["schemas"]["TimeSlot"];
export type Rows = "technicians" | "bays";

/**
 * How often today's day is asked for again, so free gaps whose time has passed go away (D-0001-21: past
 * time today has no gaps). Other days do not change by the clock.
 */
export const TODAY_REFETCH_MS = 60_000;
export function refetchEvery(date: string, today: string): number | false {
  return date === today ? TODAY_REFETCH_MS : false;
}

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

const ms = (instant: string) => Date.parse(instant);

/** Minutes between two instants: real minutes, so a clock change does not matter. */
export function minutesBetween(start: string, end: string): number {
  return Math.round((ms(end) - ms(start)) / MINUTE_MS);
}

export interface Axis {
  start: number;
  end: number;
  /** One label per real hour from the start. On a clock-change day a label is skipped or repeated. */
  labels: { at: number; text: string }[];
}

/** Back to the last whole hour on the dealership's clock. */
function floorToHour(instant: number, zone: string): number {
  const minutes = Number(formatTime(instant, zone).slice(3));
  return instant - (instant % MINUTE_MS) - minutes * MINUTE_MS;
}

/**
 * The time axis: from the earliest opening, shift or appointment to the latest one, out to whole
 * hours. Null when there is nothing to draw (a closed day with no bookings).
 */
export function dayAxis(day: ScheduleDay): Axis | null {
  const edges: number[] = [];
  const add = (slot: TimeSlot | null | undefined) => {
    if (slot) edges.push(ms(slot.start), ms(slot.end));
  };
  add(day.opening);
  for (const t of day.technicians) add(t.shift);
  for (const a of day.appointments) add(a);
  if (edges.length === 0) return null;
  const zone = day.timeZone;
  const start = floorToHour(Math.min(...edges), zone);
  const last = Math.max(...edges);
  const lastFloor = floorToHour(last, zone);
  const end = lastFloor === last ? last : lastFloor + HOUR_MS;
  const labels: Axis["labels"] = [];
  for (let at = start; at < end; at += HOUR_MS) {
    labels.push({ at, text: formatTime(at, zone) });
  }
  return { start, end, labels };
}

/** Hours from the axis start: the timeline multiplies this by `--size-hour`. */
export function hoursFrom(axis: Axis, instant: string | number): number {
  const at = typeof instant === "number" ? instant : ms(instant);
  return (at - axis.start) / HOUR_MS;
}

export function axisHours(axis: Axis): number {
  return (axis.end - axis.start) / HOUR_MS;
}

/** A length on the axis, in the unit the stylesheet uses (88 px per hour). */
export const hourLength = (hours: number) =>
  `calc(var(--size-hour) * ${hours.toFixed(4)})`;

/** Below 44 px (30 minutes) a block shows only its icon; below 7rem (112 px) a gap shows only its plus, above it the word Free. */
export const blockShowsText = (minutes: number) => minutes >= 30;
export const gapShowsText = (minutes: number) => minutes * (88 / 60) >= 112;

export function technicianName(day: ScheduleDay, a: Appointment): string {
  return (
    a.display.technicianName ??
    day.technicians.find((t) => t.id === a.technicianId)?.name ??
    "Not set"
  );
}

export function bayName(day: ScheduleDay, a: Appointment): string {
  return (
    a.display.serviceBayName ??
    day.serviceBays.find((b) => b.id === a.serviceBayId)?.name ??
    "Not set"
  );
}

export function vehicleText(a: Appointment): string {
  const v = a.display.vehicle;
  return `${v.make} ${v.model}`;
}

/** The first flag's reason in words, as the API sends it, or null. */
export function flagReason(a: Appointment): string | null {
  return a.flags[0]?.reason ?? null;
}

export function transportLabel(a: Appointment): string {
  return transportWords[a.transport as Transport].label;
}

/** "Courtesy car, Car 2" when the car has a name; "Waiting" and "Drop-off" otherwise. */
export function carChoiceText(a: Appointment): string {
  const label = transportLabel(a);
  return a.transport === "courtesy_car" && a.display.courtesyCarName
    ? `${label}, ${a.display.courtesyCarName}`
    : label;
}

/** "09:15 to 12:15, Full service, Vauxhall Corsa CD34 FGH, Maya Okafor, Bay 1, Drop-off" (+ the flag). A courtesy car is named: "…, Courtesy car, Car 2". */
export function blockName(day: ScheduleDay, a: Appointment): string {
  const reason = flagReason(a);
  return [
    formatTimeRange(a.start, a.end, day.timeZone),
    a.display.serviceTypeName,
    `${vehicleText(a)} ${a.display.vehicle.registration}`,
    technicianName(day, a),
    bayName(day, a),
    carChoiceText(a) + (reason ? `, flagged: ${reason}` : ""),
  ].join(", ");
}

/** "Free, 16:30 to 18:00, 1 hour 30 minutes, Sofia Marques. Book this time." */
export function gapName(zone: string, gap: TimeSlot, who: string): string {
  return `Free, ${formatTimeRange(gap.start, gap.end, zone)}, ${formatDuration(minutesBetween(gap.start, gap.end))}, ${who}. Book this time.`;
}

/** Where a free gap goes: the booking for a customer, with the time and the technician filled in. No customer details. */
export function gapHref(gap: TimeSlot, technicianId: string): string {
  const query = new URLSearchParams({ start: gap.start, technicianId });
  return `/book/for-customer?${query.toString()}`;
}

/** "Mechanic, ev": the skills as the API names them, as a line. */
export function skillsText(t: ScheduleTechnician): string {
  const text = t.skills.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The rail's `title`: the name, then the second line, so cut-off shift times can still be read. */
export function railTitle(name: string, subtitle: string): string {
  return `${name}, ${subtitle}`;
}

/** The rail's second line: "Mechanic, ev · shift 08:00 to 16:30", or "… · on leave". */
export function railText(day: ScheduleDay, t: ScheduleTechnician): string {
  if (t.onLeave) return `${skillsText(t)} · on leave`;
  if (!t.shift) return `${skillsText(t)} · not working today`;
  return `${skillsText(t)} · shift ${formatTimeRange(t.shift.start, t.shift.end, day.timeZone)}`;
}

const count = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

export function appointmentsWord(n: number): string {
  return count(n, "appointment", "appointments");
}

/** The appointments of a technician or a bay, in time order. */
export function appointmentsOf(
  day: ScheduleDay,
  rows: Rows,
  id: string,
): Appointment[] {
  return day.appointments.filter((a) =>
    rows === "technicians" ? a.technicianId === id : a.serviceBayId === id,
  );
}

/** The facts line under the tools (staff.md 5.1, Copy). */
export function factsText(day: ScheduleDay, rows: Rows, past: boolean): string {
  const n = day.appointments.length;
  if (rows === "bays") {
    const used = new Set(day.appointments.map((a) => a.serviceBayId)).size;
    return `${appointmentsWord(n)} across ${used} of ${count(day.serviceBays.length, "bay", "bays")}. Free time is shown by technician.`;
  }
  const flagged = day.appointments.filter((a) => a.flags.length > 0).length;
  if (past) {
    return `${n === 0 ? "No appointments" : `${appointmentsWord(n)}, ${flagged} flagged`}. This day has passed, so no free gaps are shown.`;
  }
  const working = day.technicians.filter((t) => t.shift !== null).length;
  const leave = day.technicians.filter((t) => t.onLeave).length;
  const people =
    count(working, "technician working", "technicians working") +
    (leave > 0 ? `, ${leave} on leave` : "");
  if (n === 0) return `No appointments. ${people}.`;
  const gaps = day.technicians.reduce((sum, t) => sum + t.free.length, 0);
  return `${appointmentsWord(n)}, ${flagged} flagged, ${count(gaps, "free gap", "free gaps")}. ${people}.`;
}

export type ListItem =
  | { kind: "appointment"; start: string; appointment: Appointment }
  | {
      kind: "gap";
      start: string;
      gap: TimeSlot;
      technician: ScheduleTechnician;
    };

/** The list view: appointments in time order, with the free gaps between them (none in bay mode). */
export function listItems(
  day: ScheduleDay,
  withGaps: boolean,
  only?: { rows: Rows; id: string },
): ListItem[] {
  const appointments = only
    ? appointmentsOf(day, only.rows, only.id)
    : day.appointments;
  const items: ListItem[] = appointments.map((appointment) => ({
    kind: "appointment",
    start: appointment.start,
    appointment,
  }));
  if (withGaps) {
    for (const technician of day.technicians) {
      if (only && technician.id !== only.id) continue;
      for (const gap of technician.free) {
        items.push({ kind: "gap", start: gap.start, gap, technician });
      }
    }
  }
  return items.sort(
    (a, b) =>
      ms(a.start) - ms(b.start) ||
      (a.kind === b.kind ? 0 : a.kind === "appointment" ? -1 : 1),
  );
}
