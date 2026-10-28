import { describe, expect, it } from "vitest";
import type { SeedData, Shift } from "../model";
import { validateSeed } from "./seed-validation";

const NOW = Date.parse("2026-11-02T09:00:00Z");
const policies = {
  leadTimeMinutes: 120,
  horizonDays: 30,
  breakMinutes: 15,
  gridMinutes: 15,
};
const shift: Shift = { start: "08:00", end: "17:00" };

function seed(): SeedData {
  return {
    dealerships: [
      {
        id: "d1",
        name: "One",
        timeZone: "Europe/London",
        weeklyHours: { 1: { open: "08:00", close: "18:00" } },
        dateOverrides: {
          "2026-12-24": { open: "09:00", close: "12:00" },
          "2026-12-25": "closed",
        },
        policies,
      },
      {
        id: "d2",
        name: "Two",
        timeZone: "Asia/Ho_Chi_Minh",
        weeklyHours: { 1: { open: "07:30", close: "17:00" } },
        dateOverrides: {},
        policies,
      },
    ],
    technicians: [
      {
        id: "t1",
        dealershipId: "d1",
        name: "T",
        active: true,
        skills: ["mechanic"],
        shiftPattern: {
          1: { ...shift, breakStart: "12:00", breakEnd: "13:00" },
        },
        shiftExceptions: {
          "2026-11-09": { kind: "leave" },
          "2026-11-16": { kind: "changed", shift },
        },
      },
    ],
    serviceBays: [{ id: "b1", dealershipId: "d1", name: "B", active: true }],
    courtesyCars: [{ id: "car1", dealershipId: "d1", name: "C", active: true }],
    serviceTypes: [
      { id: "st1", name: "S", durationMinutes: 60, requiredSkill: "mechanic" },
    ],
    customers: [{ id: "c1", name: "N", phone: "1", email: "e" }],
    vehicles: [
      { id: "v1", customerId: "c1", registration: "R", make: "M", model: "X" },
    ],
    demoUsers: [
      {
        id: "u1",
        name: "U",
        role: "customer",
        customerId: "c1",
        dealershipIds: [],
      },
      {
        id: "u2",
        name: "S",
        role: "staff",
        customerId: null,
        dealershipIds: ["d1"],
      },
    ],
    appointments: [
      {
        id: "a1",
        dealershipId: "d1",
        timeZone: "Europe/London",
        customerId: "c1",
        vehicleId: "v1",
        serviceTypeId: "st1",
        technicianId: "t1",
        serviceBayId: "b1",
        courtesyCarId: "car1",
        transport: "courtesy_car",
        start: NOW,
        end: NOW + 3_600_000,
        status: "confirmed",
        flags: [],
        version: 1,
        createdAt: NOW,
        updatedAt: NOW,
        cancelledAt: null,
      },
    ],
  };
}

describe("seed validation", () => {
  it("passes on a seed whose references resolve, whose times sit on the grid and that has two sets of hours and a DST zone", () => {
    expect(validateSeed(seed(), NOW)).toEqual([]);
  });

  it("names the technician that does not exist", () => {
    const broken = seed();
    broken.appointments[0]!.technicianId = "tech-404";
    expect(validateSeed(broken, NOW)).toEqual([
      'appointment "a1" points to technician "tech-404", which does not exist',
    ]);
  });

  it("names every other broken reference", () => {
    const broken = seed();
    broken.technicians[0]!.dealershipId = "d-x1";
    broken.serviceBays[0]!.dealershipId = "d-x2";
    broken.courtesyCars[0]!.dealershipId = "d-x3";
    broken.vehicles[0]!.customerId = "c-x4";
    broken.demoUsers[0]!.customerId = "c-x5";
    broken.demoUsers[1]!.dealershipIds = ["d-x6"];
    const a = broken.appointments[0]!;
    Object.assign(a, {
      dealershipId: "d-x7",
      customerId: "c-x8",
      vehicleId: "v-x9",
      serviceTypeId: "st-x10",
      serviceBayId: "b-x11",
      courtesyCarId: "car-x12",
    });
    const text = validateSeed(broken, NOW).join("\n");
    for (let n = 1; n <= 12; n++) expect(text).toContain(`-x${n}"`);
  });

  it("fails on a shift that does not start on the grid, and names the technician", () => {
    const broken = seed();
    broken.technicians[0]!.shiftPattern[1] = { start: "08:10", end: "17:00" };
    expect(validateSeed(broken, NOW)).toEqual([
      'technician "t1": shift start 08:10 is not on the 15-minute grid',
    ]);
  });

  it("fails on breaks, shift ends, exception shifts and opening hours that are off the grid", () => {
    const broken = seed();
    broken.technicians[0]!.shiftPattern[1] = {
      start: "08:00",
      end: "17:05",
      breakStart: "12:07",
      breakEnd: "13:01",
    };
    broken.technicians[0]!.shiftExceptions["2026-11-16"] = {
      kind: "changed",
      shift: { start: "08:20", end: "17:00" },
    };
    broken.dealerships[0]!.weeklyHours[1] = { open: "08:05", close: "18:10" };
    broken.dealerships[0]!.dateOverrides["2026-12-24"] = {
      open: "09:00",
      close: "12:20",
    };
    expect(validateSeed(broken, NOW)).toHaveLength(7);
  });

  it("uses a 15-minute grid for a technician whose dealership is missing, and still names the dealership", () => {
    const broken = seed();
    broken.technicians[0]!.dealershipId = "d-gone";
    broken.technicians[0]!.shiftPattern[1] = { start: "08:10", end: "17:00" };
    const problems = validateSeed(broken, NOW);
    expect(problems).toHaveLength(2);
    expect(problems.join("\n")).toContain('"d-gone"');
  });

  it("fails when every dealership has the same weekly hours", () => {
    const broken = seed();
    broken.dealerships[1]!.weeklyHours = broken.dealerships[0]!.weeklyHours;
    expect(validateSeed(broken, NOW)).toEqual([
      "the seed needs at least two dealerships with different weekly hours",
    ]);
  });

  it("fails when no dealership is in a zone with DST", () => {
    const broken = seed();
    broken.dealerships[0]!.timeZone = "Asia/Singapore";
    expect(validateSeed(broken, NOW)).toEqual([
      "the seed needs at least one dealership in a zone that has DST",
    ]);
  });

  it("finds DST in the southern hemisphere too", () => {
    const southern = seed();
    southern.dealerships[0]!.timeZone = "Australia/Sydney";
    expect(validateSeed(southern, NOW)).toEqual([]);
  });
});
