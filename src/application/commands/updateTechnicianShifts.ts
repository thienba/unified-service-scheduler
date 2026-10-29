// A technician's weekly pattern and date exceptions. Appointments of that technician that no longer
// fit are flagged `outside_shift` in the same write unit, never deleted or moved (AD-14, Q-0001-12 A).
import { isManager, type Actor } from "../actor";
import type { CommandDeps } from "../deps";
import type { Outcome, ReadStores } from "../ports";
import type { Appointment, Technician } from "../../domain/model";
import { validateTechnicianShifts } from "../../domain/validation/manager-settings";
import {
  reflag,
  type SettingsFailure,
  type SettingsOptions,
  type SettingsResult,
} from "./flagging";

export interface ShiftsRequest {
  shiftPattern: Technician["shiftPattern"];
  shiftExceptions: Technician["shiftExceptions"];
}

export async function updateTechnicianShifts(
  actor: Actor,
  deps: CommandDeps,
  technicianId: string,
  request: ShiftsRequest,
  options: SettingsOptions = {},
): Promise<SettingsResult> {
  const result = await update(actor, deps, technicianId, request, options);
  deps.logger.info("technician.shifts.update", {
    technicianId,
    actorRole: actor.role,
    outcome: result.kind,
  });
  return result;
}

const shiftsKey = (t: ShiftsRequest) =>
  JSON.stringify([
    Object.entries(t.shiftPattern).sort(),
    Object.entries(t.shiftExceptions).sort(),
  ]);

async function update(
  actor: Actor,
  deps: CommandDeps,
  technicianId: string,
  request: ShiftsRequest,
  options: SettingsOptions,
): Promise<SettingsResult> {
  if (!isManager(actor)) return { kind: "forbidden" };
  const now = deps.clock.now();

  const plan = (stores: ReadStores) =>
    deps.logger.step(
      "load",
      async (): Promise<
        Outcome<
          { changed: Appointment[]; flagged: Appointment[] },
          SettingsFailure
        >
      > => {
        // A technician is looked for among the manager's own dealerships only, so one that belongs
        // to another dealership is answered like one that does not exist (SEC-4.AC-3).
        let found: Technician | undefined;
        for (const id of actor.dealershipIds) {
          const technicians = await stores.scheduling.listTechnicians(id);
          found = technicians.find((t) => t.id === technicianId);
          if (found) break;
        }
        const dealership =
          found && (await stores.scheduling.getDealership(found.dealershipId));
        if (!found || !dealership) {
          return { ok: false, error: { kind: "not_found" } };
        }
        const errors = validateTechnicianShifts(
          request,
          dealership.policies.gridMinutes,
        );
        if (errors.length > 0) {
          return { ok: false, error: { kind: "validation_failed", errors } };
        }
        const edited: Technician = { ...found, ...request };
        const technicians = (
          await stores.scheduling.listTechnicians(dealership.id)
        ).map((t) => (t.id === technicianId ? edited : t));
        const { changed, flagged } = await reflag(
          stores,
          dealership,
          technicians,
          now,
          shiftsKey(edited) !== shiftsKey(found),
          technicianId,
        );
        return { ok: true, value: { changed, flagged } };
      },
    );

  if (options.preview) {
    const planned = await deps.uow.read(plan);
    return planned.ok
      ? { kind: "ok", flagged: planned.value.flagged }
      : planned.error;
  }
  const outcome = await deps.uow.write<Appointment[], SettingsFailure>(
    async (stores) => {
      const planned = await plan(stores);
      if (!planned.ok) return planned;
      const { changed, flagged } = planned.value;
      await deps.logger.step("write", async () => {
        await stores.settings.saveTechnicianShifts(
          technicianId,
          request.shiftPattern,
          request.shiftExceptions,
        );
        for (const appointment of changed) {
          await stores.appointments.update(appointment);
        }
      });
      return { ok: true, value: flagged };
    },
  );
  return outcome.ok ? { kind: "ok", flagged: outcome.value } : outcome.error;
}
