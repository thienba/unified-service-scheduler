// The flagged list's grouping and words (manager.md 4.2, 5.2). The list comes from the API soonest first
// (`flagged=true`, D-0001-34 A); this file only groups it by the dealership's local date.
import type { components } from "../../../api/contract/schema";
import { formatDay, formatTime, localDateIn } from "../../format/format";

export type Appointment = components["schemas"]["Appointment"];

export interface DayGroup {
  date: string;
  heading: string;
  count: string;
  appointments: Appointment[];
}

export function bookingsWord(n: number): string {
  return `${n} ${n === 1 ? "booking" : "bookings"}`;
}

/** Groups by local date in the order the API sent them. */
export function groupByDay(
  list: readonly Appointment[],
  now: number,
): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const a of list) {
    const date = localDateIn(a.start, a.timeZone);
    let group = groups.find((g) => g.date === date);
    if (!group) {
      group = {
        date,
        heading: formatDay(a.start, a.timeZone, now),
        count: "",
        appointments: [],
      };
      groups.push(group);
    }
    group.appointments.push(a);
  }
  for (const g of groups) g.count = bookingsWord(g.appointments.length);
  return groups;
}

/** "4 bookings need a new time, or to be cancelled. Soonest first. …" */
export function ledeText(n: number): string {
  return `${n === 1 ? "1 booking needs" : `${n} bookings need`} a new time, or to be cancelled. Soonest first. They are still booked and keep their technician and bay until you act.`;
}

/** The strip on the schedule: "4 bookings need a new time" ("1 booking needs a new time"). */
export function stripTitle(n: number): string {
  return `${n === 1 ? "1 booking needs" : `${n} bookings need`} a new time`;
}

/** "Brake fluid change for Jonas Weber, Fri 30 Oct 12:15": the end of each row button's name. */
export function rowName(a: Appointment, now: number): string {
  return `${a.display.serviceTypeName} for ${a.display.customerName ?? "the customer"}, ${formatDay(a.start, a.timeZone, now)} ${formatTime(a.start, a.timeZone)}`;
}

/** The polite message after a cancel: "Appointment cancelled. 3 flagged bookings left." */
export function afterCancelText(left: number): string {
  if (left === 0) return "Appointment cancelled. No flagged bookings left.";
  return `Appointment cancelled. ${left} flagged ${left === 1 ? "booking" : "bookings"} left.`;
}
