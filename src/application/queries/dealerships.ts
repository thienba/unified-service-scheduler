// The small lists the screens need: dealerships, service types, technicians, bays (section 7.3).
import { servesDealership, type Actor } from "../actor";
import type {
  Dealership,
  EpochMs,
  LocalDate,
  ServiceBay,
  ServiceType,
  Technician,
} from "../../domain/model";
import { addDays, dayBounds, isLocalDate } from "../../domain/time";
import {
  MAX_RANGE_DAYS,
  invalid,
  type QueryDeps,
  type QueryFailure,
} from "./shared";

export async function listDealerships(
  actor: Actor,
  deps: QueryDeps,
): Promise<Dealership[]> {
  return deps.uow.read((stores) =>
    deps.logger.step("load", () => stores.scheduling.listDealerships()),
  );
}

export async function getDealership(
  actor: Actor,
  deps: QueryDeps,
  dealershipId: string,
): Promise<Dealership | undefined> {
  return deps.uow.read((stores) =>
    deps.logger.step("load", () =>
      stores.scheduling.getDealership(dealershipId),
    ),
  );
}

export async function listServiceTypes(
  actor: Actor,
  deps: QueryDeps,
): Promise<ServiceType[]> {
  return deps.uow.read((stores) =>
    deps.logger.step("load", () => stores.scheduling.listServiceTypes()),
  );
}

export type BaysResult =
  { kind: "ok"; bays: ServiceBay[] } | { kind: "forbidden" };

/** Staff and managers of the dealership (SEC-3.AC-2, SEC-4). */
export async function listServiceBays(
  actor: Actor,
  deps: QueryDeps,
  dealershipId: string,
): Promise<BaysResult> {
  if (!servesDealership(actor, dealershipId)) return { kind: "forbidden" };
  const bays = await deps.uow.read((stores) =>
    deps.logger.step("load", () =>
      stores.scheduling.listServiceBays(dealershipId),
    ),
  );
  return { kind: "ok", bays };
}

export interface TechnicianView extends Technician {
  /** The technician's booked times between the two dates. */
  booked: { appointmentId: string; start: EpochMs; end: EpochMs }[];
}

export type TechniciansResult =
  { kind: "ok"; technicians: TechnicianView[] } | QueryFailure;

/** Technicians with skills, shifts, exceptions and booked times for the dates, both included (REQ-BOOK-004.AC-4). */
export async function listTechnicians(
  actor: Actor,
  deps: QueryDeps,
  request: { dealershipId: string; from: LocalDate; to: LocalDate },
): Promise<TechniciansResult> {
  const { dealershipId, from, to } = request;
  if (!servesDealership(actor, dealershipId)) return { kind: "forbidden" };
  for (const [field, date] of [
    ["from", from],
    ["to", to],
  ] as const) {
    if (!isLocalDate(date)) {
      return invalid(field, "Date must be a real date, YYYY-MM-DD.");
    }
  }
  if (to < from) return invalid("to", "The end date is before the start date.");
  // `from` is day 1, so the 31st day is `from` plus 30.
  if (to > addDays(from, MAX_RANGE_DAYS - 1)) {
    return { kind: "search_range_too_large" };
  }
  return deps.uow.read((stores) =>
    deps.logger.step("load", async (): Promise<TechniciansResult> => {
      const dealership = await stores.scheduling.getDealership(dealershipId);
      if (!dealership) return { kind: "not_found" };
      const booked = await stores.scheduling.listBlockingAppointments(
        dealershipId,
        dayBounds(from, dealership.timeZone).start,
        dayBounds(to, dealership.timeZone).end,
      );
      const technicians = await stores.scheduling.listTechnicians(dealershipId);
      return {
        kind: "ok",
        technicians: technicians.map((technician) => ({
          ...technician,
          booked: booked
            .filter((a) => a.technicianId === technician.id)
            .map(({ id, start, end }) => ({ appointmentId: id, start, end })),
        })),
      };
    }),
  );
}
