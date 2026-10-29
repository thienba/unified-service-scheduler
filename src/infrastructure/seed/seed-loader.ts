// Builds the demo data and loads it into a store (AD-17, D-0000-8).
import type { SeedTarget } from "../../application/ports";
import type {
  Appointment,
  Customer,
  CourtesyCar,
  Dealership,
  DemoUser,
  EpochMs,
  LocalDate,
  LocalTime,
  SeedData,
  ServiceBay,
  ServiceType,
  Technician,
  Transport,
  Vehicle,
} from "../../domain/model";
import {
  MINUTE_MS,
  addDays,
  instantAt,
  localDateOf,
  weekdayOf,
} from "../../domain/time";
import { validateSeed } from "../../domain/validation/seed-validation";
import appointmentFile from "./appointments.json";
import customerFile from "./customers.json";
import dealershipFile from "./dealerships.json";
import demoUserFile from "./demo-users.json";
import resourceFile from "./resources.json";
import serviceTypeFile from "./service-types.json";

/** Raise this when the seed files change, so older browser databases are reset (AD-17). */
export const SEED_VERSION = 2;

/** A seeded appointment is written as "N days from today at a local time". */
interface SeedAppointment extends Omit<
  Appointment,
  | "timeZone"
  | "start"
  | "end"
  | "status"
  | "flags"
  | "version"
  | "createdAt"
  | "updatedAt"
  | "cancelledAt"
  | "transport"
> {
  transport: Transport;
  daysFromToday: number;
  localTime: LocalTime;
}

/** The date itself, or the next date on which the dealership is open (D-0001-38). */
export function firstOpenDate(
  dealership: Dealership,
  date: LocalDate,
): LocalDate {
  let open = date;
  while (dealership.weeklyHours[weekdayOf(open)] === undefined) {
    open = addDays(open, 1);
  }
  return open;
}

/** The seed with its appointments turned into instants, counting "today" from `now`. */
export function buildSeedData(now: EpochMs): SeedData {
  // The JSON files are typed by their content; they are checked by validateSeed below.
  const dealerships = dealershipFile as unknown as Dealership[];
  const serviceTypes = serviceTypeFile as ServiceType[];
  const appointments = (appointmentFile as SeedAppointment[]).map(
    ({ daysFromToday, localTime, ...rest }): Appointment => {
      const dealership = dealerships.find((d) => d.id === rest.dealershipId);
      const serviceType = serviceTypes.find((s) => s.id === rest.serviceTypeId);
      // A broken reference is reported by validateSeed; here it only has to build something.
      const zone = dealership?.timeZone ?? "UTC";
      const wanted = addDays(localDateOf(now, zone), daysFromToday);
      const date = dealership ? firstOpenDate(dealership, wanted) : wanted;
      const start = instantAt(date, localTime, zone);
      return {
        ...rest,
        timeZone: zone,
        start,
        end: start + (serviceType?.durationMinutes ?? 0) * MINUTE_MS,
        status: "confirmed",
        flags: [],
        version: 1,
        createdAt: now,
        updatedAt: now,
        cancelledAt: null,
      };
    },
  );
  return {
    dealerships,
    technicians: resourceFile.technicians as unknown as Technician[],
    serviceBays: resourceFile.serviceBays as ServiceBay[],
    courtesyCars: resourceFile.courtesyCars as CourtesyCar[],
    serviceTypes,
    customers: customerFile.customers as Customer[],
    vehicles: customerFile.vehicles as Vehicle[],
    demoUsers: demoUserFile as DemoUser[],
    appointments,
  };
}

export type SeedLoadResult = "loaded" | "kept" | "reset";

/**
 * Fills an empty store, or resets the demo data when the stored seed version is older than
 * `version`. With the same version the data added since is kept.
 */
export async function loadSeed(
  target: SeedTarget,
  now: EpochMs,
  version: number = SEED_VERSION,
): Promise<SeedLoadResult> {
  const stored = await target.getSeedVersion();
  if (stored !== undefined && stored >= version) return "kept";
  const data = buildSeedData(now);
  const problems = validateSeed(data, now);
  if (problems.length > 0) {
    throw new Error(`The seed is not valid: ${problems.join("; ")}`);
  }
  await target.replaceAll(data, version);
  return stored === undefined ? "loaded" : "reset";
}
