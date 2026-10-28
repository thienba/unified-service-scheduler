// Weekly hours, date overrides and policies of one dealership. Appointments that no longer fit are
// flagged in the same write unit, never deleted or moved (AD-14, Q-0001-12 A).
import { isManager, servesDealership, type Actor } from "../actor";
import type { CommandDeps } from "../deps";
import type { Outcome, ReadStores } from "../ports";
import type { Appointment, Dealership, Policies } from "../../domain/model";
import { validateDealershipSettings } from "../../domain/validation/manager-settings";
import {
  reflag,
  type SettingsFailure,
  type SettingsOptions,
  type SettingsResult,
} from "./flagging";

export interface SettingsRequest {
  weeklyHours: Dealership["weeklyHours"];
  dateOverrides: Dealership["dateOverrides"];
  /** The start-time grid and the time zone are not editable (D-0001-35). */
  policies: Pick<Policies, "leadTimeMinutes" | "horizonDays" | "breakMinutes">;
}

export async function updateDealershipSettings(
  actor: Actor,
  deps: CommandDeps,
  dealershipId: string,
  request: SettingsRequest,
  options: SettingsOptions = {},
): Promise<SettingsResult> {
  const result = await update(actor, deps, dealershipId, request, options);
  deps.logger.info("dealership.settings.update", {
    dealershipId,
    actorRole: actor.role,
    outcome: result.kind,
  });
  return result;
}

const hoursKey = (d: Pick<Dealership, "weeklyHours" | "dateOverrides">) =>
  JSON.stringify([
    Object.entries(d.weeklyHours).sort(),
    Object.entries(d.dateOverrides).sort(),
  ]);

async function update(
  actor: Actor,
  deps: CommandDeps,
  dealershipId: string,
  request: SettingsRequest,
  options: SettingsOptions,
): Promise<SettingsResult> {
  if (!isManager(actor) || !servesDealership(actor, dealershipId)) {
    return { kind: "forbidden" };
  }
  const errors = validateDealershipSettings(request);
  if (errors.length > 0) return { kind: "validation_failed", errors };
  const now = deps.clock.now();

  /** Reads what the change would do. Used by the preview as it is and by the save before it writes. */
  const plan = (stores: ReadStores) =>
    deps.logger.step(
      "load",
      async (): Promise<
        Outcome<
          { next: Dealership; changed: Appointment[]; flagged: Appointment[] },
          SettingsFailure
        >
      > => {
        const dealership = await stores.scheduling.getDealership(dealershipId);
        if (!dealership) return { ok: false, error: { kind: "not_found" } };
        const next: Dealership = {
          ...dealership,
          weeklyHours: request.weeklyHours,
          dateOverrides: request.dateOverrides,
          policies: { ...dealership.policies, ...request.policies },
        };
        const { changed, flagged } = await reflag(
          stores,
          next,
          await stores.scheduling.listTechnicians(dealershipId),
          now,
          hoursKey(next) !== hoursKey(dealership),
        );
        return { ok: true, value: { next, changed, flagged } };
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
      const { next, changed, flagged } = planned.value;
      await deps.logger.step("write", async () => {
        await stores.settings.saveDealershipSettings(dealershipId, {
          weeklyHours: next.weeklyHours,
          dateOverrides: next.dateOverrides,
          policies: next.policies,
        });
        for (const appointment of changed) {
          await stores.appointments.update(appointment);
        }
      });
      return { ok: true, value: flagged };
    },
  );
  return outcome.ok ? { kind: "ok", flagged: outcome.value } : outcome.error;
}
