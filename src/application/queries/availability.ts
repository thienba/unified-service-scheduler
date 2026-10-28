// Free start times (REQ-BOOK-001, 002). Both queries use the one availability check of AD-10 and never
// touch what they read.
import { servesDealership, type Actor } from "../actor";
import { loadSnapshot } from "../load-snapshot";
import { SUGGEST_WINDOW_DAYS, type TimeSuggestion } from "../commands/shared";
import {
  checkStart,
  searchDay,
  suggest,
  type CheckRequest,
  type CheckResult,
  type UnavailableReason,
} from "../../domain/availability";
import type { EpochMs, LocalDate, Transport } from "../../domain/model";
import { MINUTE_MS, instantAt, isLocalDate } from "../../domain/time";
import { invalid, type QueryDeps, type QueryFailure } from "./shared";

/** A customer is tied to no dealership; staff and managers ask about their own (SEC-4). */
function refused(
  actor: Actor,
  dealershipId: string,
  technicianId: string | undefined,
): boolean {
  if (actor.role === "customer") return technicianId !== undefined;
  return !servesDealership(actor, dealershipId);
}

export interface DayRequest {
  dealershipId: string;
  serviceTypeId: string;
  date: LocalDate;
  transport: Transport;
  /** Staff and managers may fix the technician (D-0001-31 A). */
  technicianId?: string;
}

export type DayResult =
  | {
      kind: "ok";
      date: LocalDate;
      timeZone: string;
      gridMinutes: number;
      slots: TimeSuggestion[];
    }
  | QueryFailure;

export async function searchAvailability(
  actor: Actor,
  deps: QueryDeps,
  request: DayRequest,
): Promise<DayResult> {
  const { dealershipId, serviceTypeId, date, transport, technicianId } =
    request;
  if (refused(actor, dealershipId, technicianId)) return { kind: "forbidden" };
  if (!isLocalDate(date)) {
    return invalid("date", "Date must be a real date, YYYY-MM-DD.");
  }
  const now = deps.clock.now();
  const began = now;
  const found = await deps.uow.read((stores) =>
    deps.logger.step("load", async () => {
      const dealership = await stores.scheduling.getDealership(dealershipId);
      if (!dealership) return undefined;
      return loadSnapshot(stores, {
        dealershipId,
        serviceTypeId,
        around: instantAt(date, "00:00", dealership.timeZone),
        daysEitherSide: 0,
      });
    }),
  );
  if (!found) return { kind: "not_found" };
  const lengthMs = found.serviceType.durationMinutes * MINUTE_MS;
  const slots = await deps.logger.step("check", async () =>
    searchDay(found, { date, transport, technicianId }, now).map((start) => ({
      start,
      end: start + lengthMs,
    })),
  );
  deps.metrics.observe(
    "availability_search_duration_ms",
    deps.clock.now() - began,
    { dealershipId, kind: "day" },
  );
  if (slots.length === 0) {
    deps.metrics.increment("availability_search_empty_total", { dealershipId });
  }
  return {
    kind: "ok",
    date,
    timeZone: found.dealership.timeZone,
    gridMinutes: found.dealership.policies.gridMinutes,
    slots,
  };
}

export interface CheckQuery {
  dealershipId: string;
  serviceTypeId: string;
  start: EpochMs;
  transport: Transport;
  technicianId?: string;
}

/** Never a conflict: a taken time is an answer (REQ-BOOK-002.AC-1). */
export type CheckAnswer =
  | ({ available: true } & Extract<CheckResult, { available: true }>)
  | {
      available: false;
      reasons: UnavailableReason[];
      suggestions: TimeSuggestion[];
    };

export type CheckQueryResult =
  { kind: "ok"; answer: CheckAnswer } | QueryFailure;

export async function checkAvailability(
  actor: Actor,
  deps: QueryDeps,
  query: CheckQuery,
): Promise<CheckQueryResult> {
  const { dealershipId, serviceTypeId, start, transport, technicianId } = query;
  if (refused(actor, dealershipId, technicianId)) return { kind: "forbidden" };
  const now = deps.clock.now();
  const request: CheckRequest = { start, transport, technicianId };

  const checked = await deps.uow.read((stores) =>
    deps.logger.step("load", async () => {
      const snapshot = await loadSnapshot(stores, {
        dealershipId,
        serviceTypeId,
        around: start,
        daysEitherSide: 0,
      });
      return (
        snapshot && {
          snapshot,
          result: await deps.logger.step("check", async () =>
            checkStart(snapshot, request, now),
          ),
        }
      );
    }),
  );
  if (!checked) return { kind: "not_found" };
  if (checked.result.available) {
    return { kind: "ok", answer: checked.result };
  }
  const { reasons } = checked.result;
  const suggestions = await deps.uow.read((stores) =>
    deps.logger.step("suggest", async () => {
      const wide = await loadSnapshot(stores, {
        dealershipId,
        serviceTypeId,
        around: start,
        daysEitherSide: SUGGEST_WINDOW_DAYS,
      });
      const lengthMs = checked.snapshot.serviceType.durationMinutes * MINUTE_MS;
      return suggest(wide!, request, now, {
        windowDays: SUGGEST_WINDOW_DAYS,
      }).map((from) => ({ start: from, end: from + lengthMs }));
    }),
  );
  if (suggestions.length === 0) {
    deps.metrics.increment("availability_search_empty_total", { dealershipId });
  }
  return { kind: "ok", answer: { available: false, reasons, suggestions } };
}
