// Free start times (REQ-BOOK-001, 002). Both queries use the one availability check of AD-10 and never
// touch what they read.
import { canReach, servesDealership, type Actor } from "../actor";
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

/**
 * Whether the appointment to leave out of a check may be named: it exists in this dealership and the actor
 * may reach it. Anyone else is told it does not exist (SEC-5, D-0001-101).
 */
async function mayLeaveOut(
  actor: Actor,
  deps: QueryDeps,
  dealershipId: string,
  appointmentId: string,
): Promise<boolean> {
  const appointment = await deps.uow.read((stores) =>
    stores.appointments.get(appointmentId),
  );
  return (
    appointment !== undefined &&
    appointment.dealershipId === dealershipId &&
    canReach(actor, appointment)
  );
}

/**
 * Whether the car may be named: a customer must own it, and gets the same "not found" as for a car that does
 * not exist (SEC-6). Staff and managers follow the dealership rules, so any car id is allowed.
 */
async function mayNameVehicle(
  actor: Actor,
  deps: QueryDeps,
  vehicleId: string,
): Promise<boolean> {
  if (actor.role !== "customer") return true;
  const customer = await deps.uow.read((stores) =>
    stores.customers.get(actor.customerId!),
  );
  return customer?.vehicles.some((v) => v.id === vehicleId) ?? false;
}

export interface DayRequest {
  dealershipId: string;
  serviceTypeId: string;
  date: LocalDate;
  transport: Transport;
  /** Staff and managers may fix the technician (D-0001-31 A). */
  technicianId?: string;
  /** An appointment to leave out of the search, for the person moving it (D-0001-101). */
  appointmentId?: string;
  /** The car being booked: the times it is busy are left out (D-0001-146). */
  vehicleId?: string;
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
  const {
    dealershipId,
    serviceTypeId,
    date,
    transport,
    technicianId,
    appointmentId,
    vehicleId,
  } = request;
  if (refused(actor, dealershipId, technicianId)) return { kind: "forbidden" };
  if (
    appointmentId !== undefined &&
    !(await mayLeaveOut(actor, deps, dealershipId, appointmentId))
  ) {
    return { kind: "not_found" };
  }
  if (
    vehicleId !== undefined &&
    !(await mayNameVehicle(actor, deps, vehicleId))
  ) {
    return { kind: "not_found" };
  }
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
        vehicleId,
      });
    }),
  );
  if (!found) return { kind: "not_found" };
  const lengthMs = found.serviceType.durationMinutes * MINUTE_MS;
  const slots = await deps.logger.step("check", async () =>
    searchDay(
      found,
      {
        date,
        transport,
        technicianId,
        excludeAppointmentId: appointmentId,
        vehicleId,
      },
      now,
    ).map((start) => ({
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
  /** An appointment to leave out of the check, for the person moving it (D-0001-102). */
  appointmentId?: string;
  /** The car being booked: its own appointments count as busy times (D-0001-146). */
  vehicleId?: string;
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
  const {
    dealershipId,
    serviceTypeId,
    start,
    transport,
    technicianId,
    appointmentId,
    vehicleId,
  } = query;
  if (refused(actor, dealershipId, technicianId)) return { kind: "forbidden" };
  if (
    appointmentId !== undefined &&
    !(await mayLeaveOut(actor, deps, dealershipId, appointmentId))
  ) {
    return { kind: "not_found" };
  }
  if (
    vehicleId !== undefined &&
    !(await mayNameVehicle(actor, deps, vehicleId))
  ) {
    return { kind: "not_found" };
  }
  const now = deps.clock.now();
  const request: CheckRequest = {
    start,
    transport,
    technicianId,
    excludeAppointmentId: appointmentId,
    vehicleId,
  };

  const checked = await deps.uow.read((stores) =>
    deps.logger.step("load", async () => {
      const snapshot = await loadSnapshot(stores, {
        dealershipId,
        serviceTypeId,
        around: start,
        daysEitherSide: 0,
        vehicleId,
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
        vehicleId,
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
