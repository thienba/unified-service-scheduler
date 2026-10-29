import type { Actor } from "../actor";
import type { CommandDeps } from "../deps";
import { loadSnapshot } from "../load-snapshot";
import {
  checkStart,
  suggest,
  type CheckRequest,
  type CheckResult,
  type SchedulingSnapshot,
  type UnavailableReason,
} from "../../domain/availability";
import type { Appointment, EpochMs } from "../../domain/model";
import { MINUTE_MS } from "../../domain/time";
import type { FieldError } from "../../domain/validation/new-customer";
import type { LogFields } from "../ports";

export interface TimeSuggestion {
  start: EpochMs;
  end: EpochMs;
}

/** The answers a command gives, as plain data. Mapping them to HTTP is the mock API's job. */
export type Failure =
  | { kind: "validation_failed"; errors: FieldError[] }
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | { kind: "already_cancelled" }
  | { kind: "change_window_closed" }
  | { kind: "idempotency_key_missing" }
  | { kind: "idempotency_key_reused" };

export type CommandResult =
  | { kind: "ok"; appointment: Appointment }
  | Failure
  | {
      kind: "slot_unavailable";
      reasons: UnavailableReason[];
      suggestions: TimeSuggestion[];
    };

/** Inside a write unit, a lost check is carried out as this; suggestions are worked out afterwards. */
export interface Conflict {
  kind: "conflict";
  reasons: UnavailableReason[];
}

/**
 * Days either side of the wanted time that suggestions look through.
 * Both sides of the wanted time (D-0001-37); one place to change.
 */
export const SUGGEST_WINDOW_DAYS = 14;

export const ROUTES = {
  book: "POST /appointments",
  reschedule: "POST /appointments/{id}/reschedule",
  cancel: "POST /appointments/{id}/cancel",
} as const;

/** Runs the one availability check of AD-10 on what is stored now, timed and counted. */
export async function runCheck(
  deps: CommandDeps,
  snapshot: SchedulingSnapshot,
  request: CheckRequest,
  now: EpochMs,
): Promise<CheckResult> {
  const began = deps.clock.now();
  const result = await deps.logger.step("check", async () =>
    checkStart(snapshot, request, now),
  );
  deps.metrics.observe(
    "availability_search_duration_ms",
    deps.clock.now() - began,
    { dealershipId: snapshot.dealership.id, kind: "check" },
  );
  return result;
}

/** After a lost check: counts the conflict and works out other times in a read unit (AD-4). */
export async function slotUnavailable(
  deps: CommandDeps,
  want: {
    dealershipId: string;
    serviceTypeId: string;
    request: CheckRequest;
  },
  conflict: Conflict,
  now: EpochMs,
): Promise<CommandResult> {
  const { dealershipId } = want;
  deps.metrics.increment("appointment_conflicts_total", {
    dealershipId,
    reason: conflict.reasons[0]!,
  });
  const began = deps.clock.now();
  const suggestions = await deps.uow.read((stores) =>
    deps.logger.step("suggest", async () => {
      const snapshot = await loadSnapshot(stores, {
        dealershipId,
        serviceTypeId: want.serviceTypeId,
        around: want.request.start,
        daysEitherSide: SUGGEST_WINDOW_DAYS,
      });
      if (!snapshot) return [];
      const lengthMs = snapshot.serviceType.durationMinutes * MINUTE_MS;
      return suggest(snapshot, want.request, now, {
        windowDays: SUGGEST_WINDOW_DAYS,
      }).map((start) => ({ start, end: start + lengthMs }));
    }),
  );
  deps.metrics.observe(
    "availability_search_duration_ms",
    deps.clock.now() - began,
    { dealershipId, kind: "suggest" },
  );
  if (suggestions.length === 0) {
    deps.metrics.increment("availability_search_empty_total", { dealershipId });
  }
  return {
    kind: "slot_unavailable",
    reasons: conflict.reasons,
    suggestions,
  };
}

/** One log line per command, with allowed fields only (AD-12). */
export function logOutcome(
  deps: CommandDeps,
  msg: string,
  actor: Actor,
  result: CommandResult,
  fields: LogFields = {},
): void {
  deps.logger.info(msg, {
    ...fields,
    actorRole: actor.role,
    outcome: result.kind,
    ...(result.kind === "slot_unavailable" ? { reasons: result.reasons } : {}),
    ...(result.kind === "ok" ? { appointmentId: result.appointment.id } : {}),
  });
}
