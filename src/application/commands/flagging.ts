// The flag test of AD-14 over the stored appointments, shared by the two settings commands. It only
// reads; the command writes the changed appointments in its own unit.
import type { ReadStores } from "../ports";
import { withFlags } from "../../domain/appointment/flags";
import type { Appointment, Dealership, Technician } from "../../domain/model";
import type { EpochMs } from "../../domain/model";
import type { FieldError } from "../../domain/validation/new-customer";

export type SettingsFailure =
  | { kind: "validation_failed"; errors: FieldError[] }
  | { kind: "forbidden" }
  | { kind: "not_found" };

/** The appointments flagged after the change, which is also what a preview returns (D-0001-36). */
export type SettingsResult =
  { kind: "ok"; flagged: Appointment[] } | SettingsFailure;

export interface SettingsOptions {
  /** Work out what would be flagged and write nothing (D-0001-36). */
  preview?: boolean;
}

const FAR_FUTURE: EpochMs = 2 ** 52;

/**
 * Tests the blocking appointments that have not ended yet against the dealership's hours and their
 * technician's shifts (Q-0001-121). With `recheck` false the stored flags are kept as they are.
 * `onlyTechnicianId` narrows it to one technician's appointments.
 */
export async function reflag(
  stores: Pick<ReadStores, "scheduling">,
  dealership: Dealership,
  technicians: readonly Technician[],
  now: EpochMs,
  recheck: boolean,
  onlyTechnicianId?: string,
): Promise<{ changed: Appointment[]; flagged: Appointment[] }> {
  const appointments = await stores.scheduling.listBlockingAppointments(
    dealership.id,
    now,
    FAR_FUTURE,
  );
  const technicianOf = new Map(technicians.map((t) => [t.id, t]));
  const changed: Appointment[] = [];
  const flagged: Appointment[] = [];
  for (const stored of appointments) {
    if (
      onlyTechnicianId !== undefined &&
      stored.technicianId !== onlyTechnicianId
    ) {
      continue;
    }
    const next = recheck
      ? withFlags(
          stored,
          dealership,
          technicianOf.get(stored.technicianId)!,
          now,
        )
      : stored;
    if (next !== stored) changed.push(next);
    if (next.flags.length > 0) flagged.push(next);
  }
  return { changed, flagged };
}
