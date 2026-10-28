import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { overlaps, type Interval } from "../appointment/interval";
import type { Appointment, CourtesyCar } from "../model";
import { checkStart, searchDay, suggest } from "./index";
import {
  MIN,
  MONDAY,
  NOW,
  appointment,
  at,
  bay,
  dealership,
  snapshot,
  technician,
} from "./fixtures";

const shiftArb = fc
  .tuple(fc.integer({ min: 6, max: 12 }), fc.integer({ min: 13, max: 20 }))
  .map(([s, e]) => ({
    start: `${String(s).padStart(2, "0")}:00`,
    end: `${String(e).padStart(2, "0")}:00`,
  }));

const scheduleArb = fc.record({
  shifts: fc.array(shiftArb, { minLength: 1, maxLength: 3 }),
  bays: fc.integer({ min: 1, max: 3 }),
  cars: fc.integer({ min: 0, max: 2 }),
  breakMinutes: fc.constantFrom(0, 15, 30),
  duration: fc.constantFrom(30, 45, 60, 120),
  // Existing appointments: [technician index, bay index, start slot, length in slots]
  booked: fc.array(
    fc.tuple(
      fc.nat(2),
      fc.nat(2),
      fc.integer({ min: 0, max: 60 }),
      fc.integer({ min: 1, max: 8 }),
    ),
    { maxLength: 12 },
  ),
});

type Schedule = typeof scheduleArb extends fc.Arbitrary<infer T> ? T : never;

function build(schedule: Schedule, withBooked: boolean) {
  const technicians = schedule.shifts.map((shift, i) =>
    technician(`t${i}`, {}, shift),
  );
  const bays = Array.from({ length: schedule.bays }, (_, i) => bay(`b${i}`));
  const courtesyCars: CourtesyCar[] = Array.from(
    { length: schedule.cars },
    (_, i) => ({
      id: `c${i}`,
      dealershipId: "d1",
      name: `c${i}`,
      active: true,
    }),
  );
  const appointments = withBooked
    ? schedule.booked.map(([t, b, slot, len], i) =>
        appointment(
          `a${i}`,
          `t${t % technicians.length}`,
          `b${b % bays.length}`,
          at("06:00") + slot * 15 * MIN,
          at("06:00") + (slot + len) * 15 * MIN,
        ),
      )
    : [];
  return snapshot({
    dealership: dealership({
      policies: {
        leadTimeMinutes: 120,
        horizonDays: 30,
        breakMinutes: schedule.breakMinutes,
        gridMinutes: 15,
      },
    }),
    serviceType: {
      id: "s1",
      name: "S",
      durationMinutes: schedule.duration,
      requiredSkill: "mechanic",
    },
    technicians,
    bays,
    courtesyCars,
    appointments,
  });
}

const transportArb = fc.constantFrom("wait", "drop_off", "courtesy_car");

describe("property: one check serves every search (AD-10)", () => {
  it("every start returned by searchDay and suggest passes checkStart", () => {
    fc.assert(
      fc.property(
        scheduleArb,
        transportArb,
        fc.integer({ min: 0, max: 40 }),
        (schedule, transport, slot) => {
          const s = build(schedule, true);
          const request = { transport } as const;
          for (const start of searchDay(s, { ...request, date: MONDAY }, NOW)) {
            expect(checkStart(s, { ...request, start }, NOW).available).toBe(
              true,
            );
          }
          const wanted = at("08:00") + slot * 15 * MIN;
          for (const start of suggest(s, { ...request, start: wanted }, NOW)) {
            expect(checkStart(s, { ...request, start }, NOW).available).toBe(
              true,
            );
          }
        },
      ),
      { numRuns: 60 },
    );
  });

  it("answers added one by one never overlap on a bay, a car or a technician (with the break)", () => {
    fc.assert(
      fc.property(
        scheduleArb,
        fc.array(fc.tuple(transportArb, fc.integer({ min: 0, max: 40 })), {
          minLength: 1,
          maxLength: 25,
        }),
        (schedule, tries) => {
          let s = build(schedule, false);
          const gap = schedule.breakMinutes * MIN;
          tries.forEach(([transport, slot], i) => {
            const start = at("08:00") + slot * 15 * MIN;
            const r = checkStart(s, { transport, start }, NOW);
            if (!r.available) return;
            const a: Appointment = appointment(
              `n${i}`,
              r.technicianId,
              r.serviceBayId,
              start,
              start + schedule.duration * MIN,
              { courtesyCarId: r.courtesyCarId, transport },
            );
            s = { ...s, appointments: [...s.appointments, a] };
          });
          const list = s.appointments;
          for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
              const a = list[i]!;
              const b = list[j]!;
              expect(a.serviceBayId === b.serviceBayId && overlaps(a, b)).toBe(
                false,
              );
              expect(
                a.courtesyCarId !== null &&
                  a.courtesyCarId === b.courtesyCarId &&
                  overlaps(a, b),
              ).toBe(false);
              const padded: Interval = {
                start: b.start - gap,
                end: b.end + gap,
              };
              expect(
                a.technicianId === b.technicianId && overlaps(a, padded),
              ).toBe(false);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
