// The manager changes an appointment's start, technician and/or bay (Q-0001-7 A). It is the same
// check as booking, with the appointment left out of it (AD-4, AD-10). A technician or bay that is
// not named is kept if it is free and otherwise picked by the booking rule (D-0001-33).
import { isManager, servesDealership, type Actor } from "../actor";
import type { CommandDeps } from "../deps";
import { loadSnapshot } from "../load-snapshot";
import type { Outcome } from "../ports";
import { isBlocking } from "../../domain/appointment/blocking";
import type {
  CheckRequest,
  SchedulingSnapshot,
} from "../../domain/availability";
import type { Appointment, EpochMs } from "../../domain/model";
import { REMINDER_KINDS, messagesForMove } from "../../domain/outbox";
import { MINUTE_MS } from "../../domain/time";
import type { FieldError } from "../../domain/validation/new-customer";
import {
  logOutcome,
  outboxRows,
  runCheck,
  slotUnavailable,
  type CommandResult,
  type Conflict,
  type Failure,
} from "./shared";

export interface AdjustRequest {
  start?: EpochMs;
  technicianId?: string;
  serviceBayId?: string;
}

/** `picked` holds the technician or bay the rule chose because the old one was busy (D-0001-33). */
export type AdjustResult =
  | { kind: "ok"; appointment: Appointment; picked: AdjustPicked }
  | Exclude<CommandResult, { kind: "ok" }>;

export interface AdjustPicked {
  technicianId?: string;
  serviceBayId?: string;
}

interface Lost extends Conflict {
  dealershipId: string;
  serviceTypeId: string;
  request: CheckRequest;
}

function validate(request: AdjustRequest): FieldError[] {
  const errors: FieldError[] = [];
  const { start, technicianId, serviceBayId } = request;
  if (
    start === undefined &&
    technicianId === undefined &&
    serviceBayId === undefined
  ) {
    errors.push({
      field: "body",
      message: "Give a start, a technician or a bay to change.",
    });
  }
  if (
    start !== undefined &&
    (typeof start !== "number" || !Number.isFinite(start))
  ) {
    errors.push({ field: "start", message: "Start time must be a time." });
  }
  for (const [field, value] of [
    ["technicianId", technicianId],
    ["serviceBayId", serviceBayId],
  ] as const) {
    if (value !== undefined && (typeof value !== "string" || value === "")) {
      errors.push({ field, message: "Must be an id." });
    }
  }
  return errors;
}

export async function adjustAppointment(
  actor: Actor,
  deps: CommandDeps,
  appointmentId: string,
  request: AdjustRequest,
): Promise<AdjustResult> {
  const result = await adjust(actor, deps, appointmentId, request);
  logOutcome(deps, "appointment.adjust", actor, result);
  return result;
}

async function adjust(
  actor: Actor,
  deps: CommandDeps,
  appointmentId: string,
  request: AdjustRequest,
): Promise<AdjustResult> {
  if (!isManager(actor)) return { kind: "forbidden" };
  const errors = validate(request);
  if (errors.length > 0) return { kind: "validation_failed", errors };
  const now = deps.clock.now();

  const outcome = await deps.uow.write<
    { appointment: Appointment; picked: AdjustPicked },
    Failure | Lost
  >(async (stores) => {
    const loaded = await deps.logger.step(
      "load",
      async (): Promise<
        Outcome<{ current: Appointment; snapshot: SchedulingSnapshot }, Failure>
      > => {
        const current = await stores.appointments.get(appointmentId);
        if (!current || !servesDealership(actor, current.dealershipId)) {
          return { ok: false, error: { kind: "not_found" } };
        }
        if (!isBlocking(current)) {
          return { ok: false, error: { kind: "already_cancelled" } };
        }
        const snapshot = await loadSnapshot(stores, {
          dealershipId: current.dealershipId,
          serviceTypeId: current.serviceTypeId,
          around: request.start ?? current.start,
          daysEitherSide: 0,
        });
        if (!snapshot) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: { current, snapshot } };
      },
    );
    if (!loaded.ok) return loaded;
    const { current, snapshot } = loaded.value;
    // D-0001-48 g: nothing named differs from what is stored and no flag would be cleared, so
    // nothing is written (no version bump, no new `updatedAt`, no messages).
    if (
      (request.start ?? current.start) === current.start &&
      (request.technicianId ?? current.technicianId) === current.technicianId &&
      (request.serviceBayId ?? current.serviceBayId) === current.serviceBayId &&
      current.flags.length === 0
    ) {
      return { ok: true, value: { appointment: current, picked: {} } };
    }

    const start = request.start ?? current.start;
    // What is named is a must. What is not named is first kept as it is, then left to the rule.
    const technicians =
      request.technicianId !== undefined
        ? [request.technicianId]
        : [current.technicianId, undefined];
    const bays =
      request.serviceBayId !== undefined
        ? [request.serviceBayId]
        : [current.serviceBayId, undefined];
    const attempts = technicians.flatMap((technicianId) =>
      bays.map((serviceBayId) => ({
        start,
        transport: current.transport,
        excludeAppointmentId: current.id,
        technicianId,
        serviceBayId,
      })),
    );
    let checked = await runCheck(deps, snapshot, attempts[0]!, now);
    for (const attempt of attempts.slice(1)) {
      if (checked.available) break;
      checked = await runCheck(deps, snapshot, attempt, now);
    }
    if (!checked.available) {
      return {
        ok: false,
        error: {
          kind: "conflict",
          reasons: checked.reasons,
          dealershipId: current.dealershipId,
          serviceTypeId: current.serviceTypeId,
          request: {
            start,
            transport: current.transport,
            excludeAppointmentId: current.id,
            technicianId: request.technicianId,
            serviceBayId: request.serviceBayId,
          },
        },
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
      // Only a new start changes what the customer was told; a new technician or bay queues nothing
      // (Q-0001-123 g: nothing changed, nothing to queue).
      if (moved.start !== current.start) {
        await stores.outbox.cancelPending(moved.id, REMINDER_KINDS);
        await stores.outbox.add(outboxRows(deps, messagesForMove(moved, now)));
      }
    });
    const picked: AdjustPicked = {};
    if (
      request.technicianId === undefined &&
      moved.technicianId !== current.technicianId
    ) {
      picked.technicianId = moved.technicianId;
    }
    if (
      request.serviceBayId === undefined &&
      moved.serviceBayId !== current.serviceBayId
    ) {
      picked.serviceBayId = moved.serviceBayId;
    }
    return { ok: true, value: { appointment: moved, picked } };
  });

  if (outcome.ok) return { kind: "ok", ...outcome.value };
  const { error } = outcome;
  if (error.kind !== "conflict") return error;
  return (await slotUnavailable(deps, error, error, now)) as Extract<
    AdjustResult,
    { kind: "slot_unavailable" }
  >;
}
