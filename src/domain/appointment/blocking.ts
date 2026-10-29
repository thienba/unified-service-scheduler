import type { Appointment } from "../model";

/**
 * Whether an appointment holds its technician, bay and car (AD-1). Flags such as
 * `outside_shift` never change this; only a cancelled appointment lets go.
 */
export function isBlocking(appointment: Pick<Appointment, "status">): boolean {
  return appointment.status !== "cancelled";
}
