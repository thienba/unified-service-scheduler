// Domain data to wire data and back: instants are epoch milliseconds inside and RFC 3339 `Z` text on the
// wire. Every object is built field by field, so a field the contract does not list cannot leak out.
import type { AdjustPicked } from "../../application/commands";
import type {
  AppointmentView,
  OutboxEntry,
  TechnicianView,
} from "../../application/queries";
import type { CustomerWithVehicles } from "../../application/ports";
import type {
  Dealership,
  EpochMs,
  ServiceBay,
  ServiceType,
  Vehicle,
} from "../../domain/model";
import type { components } from "../contract/schema";

type Schemas = components["schemas"];

export const instant = (ms: EpochMs): string =>
  new Date(ms).toISOString().replace(".000Z", "Z");

/** The epoch milliseconds of a wire instant, or undefined when it is not a real moment (for example 31 June). */
export function parseInstant(text: string): EpochMs | undefined {
  const ms = Date.parse(text);
  return Number.isNaN(ms) || instant(ms).slice(0, 10) !== text.slice(0, 10)
    ? undefined
    : ms;
}

export const slot = (s: {
  start: EpochMs;
  end: EpochMs;
}): Schemas["TimeSlot"] => ({
  start: instant(s.start),
  end: instant(s.end),
});

export function appointmentToWire(
  view: AppointmentView,
  picked?: AdjustPicked,
): Schemas["Appointment"] {
  const a = view.appointment;
  return {
    id: a.id,
    dealershipId: a.dealershipId,
    timeZone: a.timeZone,
    customerId: a.customerId,
    vehicleId: a.vehicleId,
    serviceTypeId: a.serviceTypeId,
    technicianId: a.technicianId,
    serviceBayId: a.serviceBayId,
    courtesyCarId: a.courtesyCarId,
    transport: a.transport,
    start: instant(a.start),
    end: instant(a.end),
    status: a.status,
    flags: a.flags.map((flag, i) => ({
      kind: flag.kind,
      since: instant(flag.since),
      reason: view.flagReasons[i]!,
    })),
    version: a.version,
    createdAt: instant(a.createdAt),
    updatedAt: instant(a.updatedAt),
    cancelledAt: a.cancelledAt === null ? null : instant(a.cancelledAt),
    display: view.display,
    ...(picked ? { picked } : {}),
  };
}

export const dealershipToWire = (d: Dealership): Schemas["Dealership"] => ({
  id: d.id,
  name: d.name,
  timeZone: d.timeZone,
  ...(d.phone === undefined ? {} : { phone: d.phone }),
  weeklyHours: d.weeklyHours,
  dateOverrides: d.dateOverrides,
  policies: d.policies,
});

export const serviceTypeToWire = (s: ServiceType): Schemas["ServiceType"] => ({
  id: s.id,
  name: s.name,
  durationMinutes: s.durationMinutes,
  requiredSkill: s.requiredSkill,
});

export const bayToWire = (b: ServiceBay): Schemas["ServiceBay"] => ({
  id: b.id,
  dealershipId: b.dealershipId,
  name: b.name,
  active: b.active,
});

export const technicianToWire = (t: TechnicianView): Schemas["Technician"] => ({
  id: t.id,
  dealershipId: t.dealershipId,
  name: t.name,
  active: t.active,
  skills: t.skills,
  shiftPattern: t.shiftPattern,
  shiftExceptions: t.shiftExceptions,
  booked: t.booked.map((b) => ({ appointmentId: b.appointmentId, ...slot(b) })),
});

export const vehicleToWire = (v: Vehicle): Schemas["Vehicle"] => ({
  id: v.id,
  customerId: v.customerId,
  registration: v.registration,
  make: v.make,
  model: v.model,
  ...(v.year === undefined ? {} : { year: v.year }),
});

export const customerToWire = (
  c: CustomerWithVehicles,
): Schemas["CustomerWithVehicles"] => ({
  id: c.id,
  name: c.name,
  phone: c.phone,
  email: c.email,
  vehicles: c.vehicles.map(vehicleToWire),
});

/** The fixed paths of the screens that a message links to; the origin is the one the request came from (SEC-17.AC-2). */
export const outboxToWire = (
  m: OutboxEntry,
  origin: string,
): Schemas["OutboxMessage"] => ({
  id: m.id,
  appointmentId: m.appointmentId,
  dealershipId: m.dealershipId,
  kind: m.kind,
  dueAt: instant(m.dueAt),
  status: m.status,
  links: {
    cancel: `${origin}/appointments/${m.appointmentId}`,
    reschedule: `${origin}/appointments/${m.appointmentId}/reschedule`,
  },
});
