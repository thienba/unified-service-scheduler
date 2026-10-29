// Reschedule keeps the appointment id and raises `version`. The appointment is left out of its own
// check, so the old time is let go only when the new time is written (AD-4).
import { canReach, mayChangeAppointments, type Actor } from "../actor";
import type { CommandDeps } from "../deps";
import { keyRecord, lookupKey, requestHash } from "../idempotency";
import { loadSnapshot } from "../load-snapshot";
import type { Outcome } from "../ports";
import { isBlocking } from "../../domain/appointment/blocking";
import type { SchedulingSnapshot } from "../../domain/availability";
import type { Appointment, EpochMs } from "../../domain/model";
import { customerMayChange } from "../../domain/policies/change-cutoff";
import { REMINDER_KINDS, messagesForMove } from "../../domain/outbox";
import { MINUTE_MS } from "../../domain/time";
import {
  ROUTES,
  logOutcome,
  outboxRows,
  runCheck,
  slotUnavailable,
  type CommandResult,
  type Conflict,
  type Failure,
} from "./shared";

export interface RescheduleRequest {
  start?: EpochMs;
}

interface Replayed {
  kind: "replay";
  appointment: Appointment;
}

export async function rescheduleAppointment(
  actor: Actor,
  deps: CommandDeps,
  appointmentId: string,
  request: RescheduleRequest,
  idempotencyKey: string | undefined,
): Promise<CommandResult> {
  const result = await reschedule(
    actor,
    deps,
    appointmentId,
    request,
    idempotencyKey,
  );
  logOutcome(deps, "appointment.reschedule", actor, result);
  return result;
}

async function reschedule(
  actor: Actor,
  deps: CommandDeps,
  appointmentId: string,
  request: RescheduleRequest,
  idempotencyKey: string | undefined,
): Promise<CommandResult> {
  if (idempotencyKey === undefined || idempotencyKey === "") {
    return { kind: "idempotency_key_missing" };
  }
  if (!mayChangeAppointments(actor)) return { kind: "forbidden" };
  const { start } = request;
  if (typeof start !== "number" || !Number.isFinite(start)) {
    return {
      kind: "validation_failed",
      errors: [{ field: "start", message: "Start time is required." }],
    };
  }
  const now = deps.clock.now();
  const hash = await requestHash("rescheduleAppointment", {
    appointmentId,
    ...request,
  });

  const outcome = await deps.uow.write<
    Appointment,
    Failure | Conflict | Replayed
  >(async (stores) => {
    const loaded = await deps.logger.step(
      "load",
      async (): Promise<
        Outcome<
          { current: Appointment; snapshot: SchedulingSnapshot },
          Failure | Replayed
        >
      > => {
        const key = await lookupKey(stores, actor, idempotencyKey, hash);
        if (key.kind === "reused") {
          return { ok: false, error: { kind: "idempotency_key_reused" } };
        }
        if (key.kind === "same") {
          const appointment = await stores.appointments.get(
            key.response.appointmentId,
          );
          return {
            ok: false,
            error: { kind: "replay", appointment: appointment! },
          };
        }
        const current = await stores.appointments.get(appointmentId);
        if (!current || !canReach(actor, current)) {
          return { ok: false, error: { kind: "not_found" } };
        }
        // After the owner check, so it cannot reveal a record (D-0001-39).
        if (!isBlocking(current)) {
          return { ok: false, error: { kind: "already_cancelled" } };
        }
        const snapshot = await loadSnapshot(stores, {
          dealershipId: current.dealershipId,
          serviceTypeId: current.serviceTypeId,
          around: start,
          daysEitherSide: 0,
        });
        if (!snapshot) return { ok: false, error: { kind: "not_found" } };
        if (
          actor.role === "customer" &&
          !customerMayChange(
            current.start,
            now,
            snapshot.dealership.policies.leadTimeMinutes,
          )
        ) {
          return { ok: false, error: { kind: "change_window_closed" } };
        }
        return { ok: true, value: { current, snapshot } };
      },
    );
    if (!loaded.ok) return loaded;
    const { current, snapshot } = loaded.value;

    const check = {
      start,
      transport: current.transport,
      excludeAppointmentId: current.id,
    };
    const checked = await runCheck(deps, snapshot, check, now);
    if (!checked.available) {
      return {
        ok: false,
        error: { kind: "conflict", reasons: checked.reasons },
      };
    }

    const moved: Appointment = {
      ...current,
      technicianId: checked.technicianId,
      serviceBayId: checked.serviceBayId,
      courtesyCarId: checked.courtesyCarId,
      start,
      end: start + snapshot.serviceType.durationMinutes * MINUTE_MS,
      flags: [],
      version: current.version + 1,
      updatedAt: now,
    };
    await deps.logger.step("write", async () => {
      await stores.appointments.update(moved);
      await stores.outbox.cancelPending(moved.id, REMINDER_KINDS);
      await stores.outbox.add(outboxRows(deps, messagesForMove(moved, now)));
      await stores.idempotency.put(
        keyRecord(actor, idempotencyKey, hash, moved.id, now),
      );
    });
    return { ok: true, value: moved };
  });

  if (outcome.ok) return { kind: "ok", appointment: outcome.value };
  const { error } = outcome;
  if (error.kind === "replay") {
    deps.metrics.increment("idempotent_replays_total", {
      route: ROUTES.reschedule,
    });
    return { kind: "ok", appointment: error.appointment };
  }
  if (error.kind === "conflict") {
    const current = await deps.uow.read((stores) =>
      stores.appointments.get(appointmentId),
    );
    return slotUnavailable(
      deps,
      {
        dealershipId: current!.dealershipId,
        serviceTypeId: current!.serviceTypeId,
        request: {
          start,
          transport: current!.transport,
          excludeAppointmentId: appointmentId,
        },
      },
      error,
      now,
    );
  }
  return error;
}
