// AD-14: an appointment that no longer fits the hours or its technician's shift gets a flag. It is
// still confirmed and still holds its resources; only a move or a cancel lets go.
import type {
  Appointment,
  AppointmentFlag,
  AppointmentFlagKind,
  Dealership,
  EpochMs,
  Technician,
} from "../model";
import { openingWindow } from "../policies/opening-window";
import { shiftSegments } from "../policies/work-segments";
import { localDateOf } from "../time";
import { contains } from "./interval";

/**
 * The flags an appointment deserves under these hours and this technician's shifts.
 * A technician that is not known has no shift, so the appointment is outside it.
 */
export function flagKinds(
  appointment: Pick<Appointment, "start" | "end">,
  dealership: Dealership,
  technician: Technician | undefined,
): AppointmentFlagKind[] {
  const date = localDateOf(appointment.start, dealership.timeZone);
  const window = openingWindow(dealership, date);
  const kinds: AppointmentFlagKind[] = [];
  if (window === null || !contains(window, appointment)) {
    kinds.push("outside_opening_hours");
  }
  const fitsShift =
    technician !== undefined &&
    shiftSegments(technician, dealership, date).some((segment) =>
      contains(segment, appointment),
    );
  if (!fitsShift) kinds.push("outside_shift");
  return kinds;
}

/**
 * The appointment with its flags brought up to date. A flag that stays keeps its `since`.
 * Flags are not a change of time, resource or status, so `version` and `status` stay (D-0001-22 c).
 * Gives back the same object when nothing changes.
 */
export function withFlags(
  appointment: Appointment,
  dealership: Dealership,
  technician: Technician | undefined,
  now: EpochMs,
): Appointment {
  const kinds = flagKinds(appointment, dealership, technician);
  const same =
    kinds.length === appointment.flags.length &&
    kinds.every((kind, i) => appointment.flags[i]!.kind === kind);
  if (same) return appointment;
  const flags: AppointmentFlag[] = kinds.map((kind) => ({
    kind,
    since: appointment.flags.find((f) => f.kind === kind)?.since ?? now,
  }));
  return { ...appointment, flags };
}
