// Reading appointments (REQ-BOOK-004, 010, 012). Every query checks the Actor before it reads data (AD-3).
import { canReach, servesDealership, type Actor } from "../actor";
import { isBlocking } from "../../domain/appointment/blocking";
import type { Appointment, LocalDate } from "../../domain/model";
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

/** A customer's own appointments from now on, soonest first (the addition to section 7.3). */
export async function listMyAppointments(
  actor: Actor,
  deps: QueryDeps,
  request: { includeCancelled?: boolean } = {},
): Promise<AppointmentsResult> {
  if (actor.role !== "customer") return { kind: "forbidden" };
  const now = deps.clock.now();
  return deps.uow.read((stores) =>
    deps.logger.step("load", async (): Promise<AppointmentsResult> => {
      const own = await stores.appointments.listByCustomer(actor.customerId!);
      const upcoming = own.filter(
        (a) =>
          a.end > now && (request.includeCancelled === true || isBlocking(a)),
      );
      return {
        kind: "ok",
        appointments: await viewAppointmentsIn(actor, stores, upcoming),
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
