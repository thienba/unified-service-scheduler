// Cancel is one write unit. A second cancel returns the same cancelled appointment (section 7.3).
import { canReach, mayChangeAppointments, type Actor } from "../actor";
import type { CommandDeps } from "../deps";
import type { Outcome } from "../ports";
import { cancelled } from "../../domain/appointment/cancel";
import { isBlocking } from "../../domain/appointment/blocking";
import type { Appointment } from "../../domain/model";
import { REMINDER_KINDS, messagesForCancel } from "../../domain/outbox";
import { customerMayChange } from "../../domain/policies/change-cutoff";
import {
  logOutcome,
  outboxRows,
  type CommandResult,
  type Failure,
} from "./shared";

export async function cancelAppointment(
  actor: Actor,
  deps: CommandDeps,
  appointmentId: string,
): Promise<CommandResult> {
  const result = await cancel(actor, deps, appointmentId);
  logOutcome(deps, "appointment.cancel", actor, result);
  return result;
}

async function cancel(
  actor: Actor,
  deps: CommandDeps,
  appointmentId: string,
): Promise<CommandResult> {
  if (!mayChangeAppointments(actor)) return { kind: "forbidden" };
  const now = deps.clock.now();

  const outcome = await deps.uow.write<
    { appointment: Appointment; changed: boolean },
    Failure
  >(async (stores) => {
    const loaded = await deps.logger.step(
      "load",
      async (): Promise<Outcome<Appointment, Failure>> => {
        const appointment = await stores.appointments.get(appointmentId);
        // The owner check comes before the cutoff, so the cutoff cannot reveal the record (SEC-5.AC-2).
        if (!appointment || !canReach(actor, appointment)) {
          return { ok: false, error: { kind: "not_found" } };
        }
        if (isBlocking(appointment) && actor.role === "customer") {
          const dealership = await stores.scheduling.getDealership(
            appointment.dealershipId,
          );
          const { leadTimeMinutes } = dealership!.policies;
          if (!customerMayChange(appointment.start, now, leadTimeMinutes)) {
            return { ok: false, error: { kind: "change_window_closed" } };
          }
        }
        return { ok: true, value: appointment };
      },
    );
    if (!loaded.ok) return loaded;
    if (!isBlocking(loaded.value)) {
      return { ok: true, value: { appointment: loaded.value, changed: false } };
    }
    const done = cancelled(loaded.value, now);
    await deps.logger.step("write", async () => {
      await stores.appointments.update(done);
      await stores.outbox.cancelPending(done.id, REMINDER_KINDS);
      await stores.outbox.add(outboxRows(deps, messagesForCancel(done, now)));
    });
    return { ok: true, value: { appointment: done, changed: true } };
  });

  if (!outcome.ok) return outcome.error;
  const { appointment, changed } = outcome.value;
  if (changed) {
    deps.metrics.increment("appointments_cancelled_total", {
      dealershipId: appointment.dealershipId,
      actorRole: actor.role,
    });
  }
  return { kind: "ok", appointment };
}
