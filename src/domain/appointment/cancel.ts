import type { Appointment, EpochMs } from "../model";

/** The appointment as it is once cancelled: it lets go of its resources, `version` goes up by 1 (AD-1). */
export function cancelled(appointment: Appointment, now: EpochMs): Appointment {
  return {
    ...appointment,
    status: "cancelled",
    cancelledAt: now,
    updatedAt: now,
    version: appointment.version + 1,
  };
}
