// One plain line that says why an appointment is flagged (D-0001-34). The words are for the manager
// reading the flagged list; the flag test itself is in flags.ts.
import type {
  Appointment,
  AppointmentFlagKind,
  Dealership,
  Technician,
} from "../model";
import { openingWindow } from "../policies/opening-window";
import { shiftSegments } from "../policies/work-segments";
import { localDateOf, localTimeOf } from "../time";

export function flagReason(
  kind: AppointmentFlagKind,
  appointment: Pick<Appointment, "start" | "end">,
  dealership: Dealership,
  technician: Technician | undefined,
): string {
  const zone = dealership.timeZone;
  const date = localDateOf(appointment.start, zone);
  const starts = localTimeOf(appointment.start, zone);
  const ends = localTimeOf(appointment.end, zone);

  if (kind === "outside_opening_hours") {
    const window = openingWindow(dealership, date);
    if (window === null) return `The dealership is closed on ${date}.`;
    return `The dealership is open ${localTimeOf(window.start, zone)} to ${localTimeOf(window.end, zone)} that day; this booking runs ${starts} to ${ends}.`;
  }

  if (technician === undefined) {
    return "The technician for this booking can no longer be found.";
  }
  const segments = shiftSegments(technician, dealership, date);
  const first = segments[0];
  const last = segments[segments.length - 1];
  if (first === undefined || last === undefined) {
    return `${technician.name} is not working on ${date}.`;
  }
  if (appointment.end > last.end) {
    return `${technician.name}'s shift ends at ${localTimeOf(last.end, zone)}; this booking ends at ${ends}.`;
  }
  if (appointment.start < first.start) {
    return `${technician.name}'s shift starts at ${localTimeOf(first.start, zone)}; this booking starts at ${starts}.`;
  }
  return `${technician.name} is on a break during this booking.`;
}
