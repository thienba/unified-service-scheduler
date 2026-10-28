// Hand-built snapshots for the availability tests.
import type {
  Appointment,
  Dealership,
  ServiceBay,
  Shift,
  Technician,
  Transport,
} from "../model";
import type { SchedulingSnapshot } from "./types";

export const MIN = 60_000;
export const utc = (text: string) => Date.parse(text);
/** 2026-11-02 is a Monday. */
export const MONDAY = "2026-11-02";
export const at = (hhmm: string, date = MONDAY) => utc(`${date}T${hhmm}:00Z`);
/** 2026-11-02 00:00 UTC: with the default 2-hour lead time, 02:00 is the earliest start. */
export const NOW = at("00:00");

export const day = (open = "08:00", close = "18:00") => ({ open, close });

export function dealership(overrides: Partial<Dealership> = {}): Dealership {
  return {
    id: "d1",
    name: "Test",
    timeZone: "UTC",
    weeklyHours: { 1: day(), 2: day(), 3: day(), 4: day(), 5: day() },
    dateOverrides: {},
    policies: {
      leadTimeMinutes: 120,
      horizonDays: 30,
      breakMinutes: 15,
      gridMinutes: 15,
    },
    ...overrides,
  };
}

export function technician(
  id: string,
  overrides: Partial<Technician> = {},
  shift: Shift = { start: "08:00", end: "17:00" },
): Technician {
  return {
    id,
    dealershipId: "d1",
    name: id,
    active: true,
    skills: ["mechanic"],
    shiftPattern: { 1: shift, 2: shift, 3: shift, 4: shift, 5: shift },
    shiftExceptions: {},
    ...overrides,
  };
}

export const bay = (
  id: string,
  overrides: Partial<ServiceBay> = {},
): ServiceBay => ({
  id,
  dealershipId: "d1",
  name: id,
  active: true,
  ...overrides,
});

export function appointment(
  id: string,
  technicianId: string,
  serviceBayId: string,
  start: number,
  end: number,
  overrides: Partial<Appointment> = {},
): Appointment {
  return {
    id,
    dealershipId: "d1",
    timeZone: "UTC",
    customerId: "c1",
    vehicleId: "v1",
    serviceTypeId: "s1",
    technicianId,
    serviceBayId,
    courtesyCarId: null,
    transport: "wait" as Transport,
    start,
    end,
    status: "confirmed",
    flags: [],
    version: 1,
    createdAt: 0,
    updatedAt: 0,
    cancelledAt: null,
    ...overrides,
  };
}

/** A 60-minute service, two technicians, two bays, one courtesy car. */
export function snapshot(
  overrides: Partial<SchedulingSnapshot> = {},
): SchedulingSnapshot {
  return {
    dealership: dealership(),
    serviceType: {
      id: "s1",
      name: "Service",
      durationMinutes: 60,
      requiredSkill: "mechanic",
    },
    technicians: [technician("t1"), technician("t2")],
    bays: [bay("b1"), bay("b2")],
    courtesyCars: [
      { id: "c1", dealershipId: "d1", name: "Car 1", active: true },
    ],
    appointments: [],
    ...overrides,
  };
}
