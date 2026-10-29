// One short phrase that says why an appointment is flagged (D-0001-34, D-0001-69). The words are the design's
// (staff.md 5.1) and every screen shows them as they are; the flag test itself is in flags.ts.
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

  if (kind === "outside_opening_hours") {
    const window = openingWindow(dealership, date);
    if (window === null) return "The dealership is closed this day";
    if (appointment.end > window.end) {
      return `Ends after closing time, ${localTimeOf(window.end, zone)}`;
    }
    return `Starts before opening time, ${localTimeOf(window.start, zone)}`;
  }

  if (technician === undefined) {
    return "The technician for this booking can no longer be found";
  }
  const name = technician.name.split(" ")[0];
  const segments = shiftSegments(technician, dealership, date);
  const first = segments[0];
  const last = segments[segments.length - 1];
  if (first === undefined || last === undefined) {
    return `${name} is not working this day`;
  }
  if (appointment.end > last.end) {
    return `Ends after ${name}'s shift, ${localTimeOf(last.end, zone)}`;
  }
  if (appointment.start < first.start) {
    return `Starts before ${name}'s shift, ${localTimeOf(first.start, zone)}`;
  }
  return `${name} is on a break during this booking`;
}
