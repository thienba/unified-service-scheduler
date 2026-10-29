// Reading appointments (REQ-BOOK-004, 010, 012). Every query checks the Actor before it reads data (AD-3).
import { canReach, servesDealership, type Actor } from "../actor";
import { isBlocking } from "../../domain/appointment/blocking";
import type { Interval } from "../../domain/appointment/interval";
import type {
  Appointment,
  LocalDate,
  ServiceBay,
  Technician,
} from "../../domain/model";
import { openingWindow } from "../../domain/policies/opening-window";
import {
  nextOpenDate,
  technicianDay,
  type TechnicianDay,
} from "../../domain/schedule/day-plan";
import { dayBounds, isLocalDate } from "../../domain/time";
import { viewAppointmentsIn, type AppointmentView } from "./appointmentView";
import {
  FAR_FUTURE,
  invalid,
  type QueryDeps,
  type QueryFailure,
} from "./shared";

export type AppointmentsResult =
  { kind: "ok"; appointments: AppointmentView[] } | QueryFailure;

export interface ScheduleRequest {
  dealershipId?: string;
  date?: LocalDate;
  /** Every flagged appointment of the dealership from now on, soonest first (D-0001-34). */
  flagged?: boolean;
  includeCancelled?: boolean;
}

/**
 * Staff and managers: one dealership's appointments on one local date, or its flagged ones.
 * A customer asking for a dealership and date gets only their own (SEC-5.AC-4).
 */
export async function getSchedule(
  actor: Actor,
  deps: QueryDeps,
  request: ScheduleRequest,
): Promise<AppointmentsResult> {
  const { dealershipId, date, flagged = false, includeCancelled } = request;
  if (flagged && actor.role === "customer") return { kind: "forbidden" };
  if (dealershipId === undefined) {
    return invalid("dealershipId", "Dealership is required.");
  }
  if (actor.role !== "customer" && !servesDealership(actor, dealershipId)) {
    return { kind: "forbidden" };
  }
  if (!flagged) {
    if (date === undefined) return invalid("date", "Date is required.");
    if (!isLocalDate(date)) {
      return invalid("date", "Date must be a real date, YYYY-MM-DD.");
    }
  }
  const now = deps.clock.now();

  return deps.uow.read((stores) =>
    deps.logger.step("load", async (): Promise<AppointmentsResult> => {
      const dealership = await stores.scheduling.getDealership(dealershipId);
      if (!dealership) return { kind: "not_found" };
      let found: Appointment[];
      if (flagged) {
        found = (
          await stores.scheduling.listBlockingAppointments(
            dealershipId,
            now,
            FAR_FUTURE,
          )
        ).filter((a) => a.flags.length > 0);
      } else {
        const bounds = dayBounds(date!, dealership.timeZone);
        found = await stores.appointments.listByDealershipDay(
          dealershipId,
          bounds.start,
          bounds.end,
        );
      }
      found = found.filter(
        (a) =>
          (includeCancelled === true || isBlocking(a)) &&
          (actor.role !== "customer" || a.customerId === actor.customerId),
      );
      return {
        kind: "ok",
        appointments: await viewAppointmentsIn(actor, stores, found),
      };
    }),
  );
}

/**
 * A customer's own appointments from now on, soonest first (the addition to section 7.3).
 * With `includePast` the ones that have ended follow, newest first (D-0001-94).
 */
export async function listMyAppointments(
  actor: Actor,
  deps: QueryDeps,
  request: { includeCancelled?: boolean; includePast?: boolean } = {},
): Promise<AppointmentsResult> {
  if (actor.role !== "customer") return { kind: "forbidden" };
  const now = deps.clock.now();
  return deps.uow.read((stores) =>
    deps.logger.step("load", async (): Promise<AppointmentsResult> => {
      const own = await stores.appointments.listByCustomer(actor.customerId!);
      const kept = own.filter(
        (a) => request.includeCancelled === true || isBlocking(a),
      );
      const upcoming = kept.filter((a) => a.end > now);
      const ended = request.includePast
        ? kept.filter((a) => a.end <= now).reverse()
        : [];
      return {
        kind: "ok",
        appointments: await viewAppointmentsIn(actor, stores, [
          ...upcoming,
          ...ended,
        ]),
      };
    }),
  );
}

export type AppointmentResult =
  { kind: "ok"; appointment: AppointmentView } | QueryFailure;

/** The owner, staff or a manager of its dealership. Anyone else is told it does not exist (SEC-5). */
export async function getAppointment(
  actor: Actor,
  deps: QueryDeps,
  appointmentId: string,
): Promise<AppointmentResult> {
  return deps.uow.read((stores) =>
    deps.logger.step("load", async (): Promise<AppointmentResult> => {
      const appointment = await stores.appointments.get(appointmentId);
      if (!appointment || !canReach(actor, appointment)) {
        return { kind: "not_found" };
      }
      const [view] = await viewAppointmentsIn(actor, stores, [appointment]);
      return { kind: "ok", appointment: view! };
    }),
  );
}

export interface ScheduleTechnicianView extends TechnicianDay {
  technician: Technician;
}

export type ScheduleDayResult =
  | {
      kind: "ok";
      date: LocalDate;
      timeZone: string;
      /** The dealership's open interval that date, or null when it is closed. */
      opening: Interval | null;
      nextOpenDate: LocalDate | null;
      technicians: ScheduleTechnicianView[];
      bays: ServiceBay[];
      appointments: AppointmentView[];
    }
  | QueryFailure;

/**
 * One local date of one dealership for the staff schedule (REQ-BOOK-004, D-0001-21 A): the day's
 * appointments, the active technicians with their shift, break, leave and free windows, and the
 * active bays. Staff and managers of the dealership only (SEC-3, SEC-4).
 */
export async function getScheduleDay(
  actor: Actor,
  deps: QueryDeps,
  request: { dealershipId: string; date: LocalDate },
): Promise<ScheduleDayResult> {
  const { dealershipId, date } = request;
  if (!servesDealership(actor, dealershipId)) return { kind: "forbidden" };
  if (!isLocalDate(date)) {
    return invalid("date", "Date must be a real date, YYYY-MM-DD.");
  }
  const now = deps.clock.now();
  return deps.uow.read((stores) =>
    deps.logger.step("load", async (): Promise<ScheduleDayResult> => {
      const dealership = await stores.scheduling.getDealership(dealershipId);
      if (!dealership) return { kind: "not_found" };
      const bounds = dayBounds(date, dealership.timeZone);
      const found = (
        await stores.appointments.listByDealershipDay(
          dealershipId,
          bounds.start,
          bounds.end,
        )
      ).filter(isBlocking);
      // Jobs that hold a technician that day, also ones that started the day before.
      const blocking = await stores.scheduling.listBlockingAppointments(
        dealershipId,
        bounds.start,
        bounds.end,
      );
      const technicians = (
        await stores.scheduling.listTechnicians(dealershipId)
      ).filter((t) => t.active);
      const bays = (
        await stores.scheduling.listServiceBays(dealershipId)
      ).filter((b) => b.active);
      return {
        kind: "ok",
        date,
        timeZone: dealership.timeZone,
        opening: openingWindow(dealership, date),
        nextOpenDate: nextOpenDate(dealership, date),
        technicians: technicians.map((technician) => ({
          technician,
          ...technicianDay(
            technician,
            dealership,
            date,
            blocking.filter((a) => a.technicianId === technician.id),
            now,
          ),
        })),
        bays,
        appointments: await viewAppointmentsIn(actor, stores, found),
      };
    }),
  );
}
