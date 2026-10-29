import { describe, expect, it } from "vitest";
import { isBlocking } from "../../domain/appointment/blocking";
import { overlaps, contains } from "../../domain/appointment/interval";
import { isTechnicianFree } from "../../domain/policies/technician-free";
import { workSegments } from "../../domain/policies/work-segments";
import type { Appointment, SeedData } from "../../domain/model";
import {
  addDays,
  instantAt,
  localDateOf,
  MINUTE_MS,
  weekdayOf,
} from "../../domain/time";
import { validateSeed } from "../../domain/validation/seed-validation";
import { createMemoryRepository } from "../storage/memory/memory-repository";
import {
  buildSeedData,
  firstOpenDate,
  loadSeed,
  SEED_VERSION,
} from "./seed-loader";

const DAY_1 = Date.parse("2026-11-02T09:00:00Z");
const DAY_2 = Date.parse("2027-03-01T09:00:00Z");

describe("the shipped seed", () => {
  it("passes the seed validation", () => {
    for (const now of [DAY_1, DAY_2]) {
      expect(validateSeed(buildSeedData(now), now)).toEqual([]);
    }
  });

  it("has two dealerships in different zones, and for each three technicians with two skills, two bays, a courtesy car and three service types", () => {
    const seed = buildSeedData(DAY_1);
    expect(seed.dealerships.map((d) => d.timeZone).sort()).toEqual([
      "Asia/Ho_Chi_Minh",
      "Europe/London",
    ]);
    for (const d of seed.dealerships) {
      const technicians = seed.technicians.filter(
        (t) => t.dealershipId === d.id,
      );
      expect(technicians.length).toBeGreaterThanOrEqual(3);
      expect(
        new Set(technicians.flatMap((t) => t.skills)).size,
      ).toBeGreaterThanOrEqual(2);
      expect(
        technicians.some((t) =>
          Object.values(t.shiftPattern).some((s) => s.breakStart !== undefined),
        ),
      ).toBe(true);
      expect(
        seed.serviceBays.filter((b) => b.dealershipId === d.id).length,
      ).toBeGreaterThanOrEqual(2);
      expect(
        seed.courtesyCars.filter((c) => c.dealershipId === d.id).length,
      ).toBeGreaterThanOrEqual(1);
    }
    expect(seed.serviceTypes.length).toBeGreaterThanOrEqual(3);
    for (const s of seed.serviceTypes) {
      expect(s.durationMinutes).toBeGreaterThan(0);
      expect(s.requiredSkill).not.toBe("");
    }
  });

  it("has customers A and B with a vehicle and an appointment each, and staff and a manager per dealership and one staff member for both", () => {
    const seed = buildSeedData(DAY_1);
    for (const id of ["customer-a", "customer-b"]) {
      expect(seed.vehicles.some((v) => v.customerId === id)).toBe(true);
      expect(seed.appointments.some((a) => a.customerId === id)).toBe(true);
      expect(
        seed.demoUsers.some(
          (u) => u.role === "customer" && u.customerId === id,
        ),
      ).toBe(true);
    }
    for (const d of seed.dealerships) {
      for (const role of ["staff", "manager"]) {
        expect(
          seed.demoUsers.some(
            (u) =>
              u.role === role &&
              u.dealershipIds.length === 1 &&
              u.dealershipIds[0] === d.id,
          ),
        ).toBe(true);
      }
    }
    const both = seed.demoUsers.filter(
      (u) =>
        u.role === "staff" &&
        u.dealershipIds.length === seed.dealerships.length,
    );
    expect(both).toHaveLength(1);
  });

  it("holds only made-up contact details", () => {
    const seed = buildSeedData(DAY_1);
    for (const c of seed.customers) {
      expect(c.email.endsWith("@demo.example")).toBe(true);
      expect(c.phone).toMatch(/^\+44 7700 900\d{3}$/);
    }
    const text = JSON.stringify(seed);
    for (const canary of [
      "Zz Canary Name",
      "+0 000 0000",
      "canary@example.invalid",
      "ZZ00 CNR",
    ]) {
      expect(text).not.toContain(canary);
    }
  });

  for (const [label, now] of [
    ["2026-11-02", DAY_1],
    ["2027-03-01", DAY_2],
  ] as const) {
    it(`loaded on ${label} has seeded appointments after the load date`, () => {
      const seed = buildSeedData(now);
      expect(seed.appointments.length).toBeGreaterThanOrEqual(2);
      for (const a of seed.appointments) {
        expect(a.start).toBeGreaterThan(now);
        expect(
          localDateOf(a.start, a.timeZone) > localDateOf(now, a.timeZone),
        ).toBe(true);
        const type = seed.serviceTypes.find((s) => s.id === a.serviceTypeId);
        expect(a.end - a.start).toBe(type!.durationMinutes * MINUTE_MS);
      }
    });
  }

  it("D-0001-38: London is closed on Sunday and its technicians have no Sunday shift, and no appointment falls on a closed day", () => {
    for (let day = 0; day < 14; day++) {
      const seed = buildSeedData(DAY_1 + day * 24 * 60 * MINUTE_MS);
      const london = seed.dealerships.find(
        (d) => d.id === "dealership-london",
      )!;
      expect(london.weeklyHours[7]).toBeUndefined();
      for (const t of seed.technicians.filter(
        (t) => t.dealershipId === london.id,
      )) {
        expect(t.shiftPattern[7]).toBeUndefined();
      }
      for (const a of seed.appointments) {
        const d = seed.dealerships.find((x) => x.id === a.dealershipId)!;
        expect(
          d.weeklyHours[weekdayOf(localDateOf(a.start, a.timeZone))],
        ).toBeDefined();
      }
    }
    expect(
      firstOpenDate(buildSeedData(DAY_1).dealerships[0]!, "2026-11-08"),
    ).toBe("2026-11-09");
  });

  it("D-0001-25: every dealership has a phone number from a reserved or clearly fake range", () => {
    const [london, saigon] = buildSeedData(DAY_1).dealerships;
    expect(london!.phone).toMatch(/^\+44 1632 960 \d{3}$/);
    expect(saigon!.phone).toBe("+84 00 0000 0000");
  });

  it("has a future time at the first dealership with exactly one free qualified technician and one free bay", () => {
    // Any day of the week, so the time must not depend on today's weekday.
    for (let day = 0; day < 14; day++) {
      const now = DAY_1 + day * 24 * 60 * MINUTE_MS;
      const seed = buildSeedData(now);
      const first = seed.dealerships[0]!;
      const date = firstOpenDate(
        first,
        addDays(localDateOf(now, first.timeZone), 3),
      );
      expect(freeAt(seed, first.id, "service-ev-check", date, "10:00")).toEqual(
        {
          technicians: 1,
          bays: 1,
        },
      );
    }
  });
});

function freeAt(
  seed: SeedData,
  dealershipId: string,
  serviceTypeId: string,
  date: string,
  time: string,
) {
  const dealership = seed.dealerships.find((d) => d.id === dealershipId)!;
  const type = seed.serviceTypes.find((s) => s.id === serviceTypeId)!;
  const start = instantAt(date, time, dealership.timeZone);
  const slot = { start, end: start + type.durationMinutes * MINUTE_MS };
  const blocking = seed.appointments.filter(
    (a: Appointment) => a.dealershipId === dealershipId && isBlocking(a),
  );
  const technicians = seed.technicians.filter(
    (t) =>
      t.dealershipId === dealershipId &&
      t.active &&
      t.skills.includes(type.requiredSkill) &&
      workSegments(t, dealership, date).some((segment) =>
        contains(segment, slot),
      ) &&
      isTechnicianFree(
        slot,
        blocking.filter((a) => a.technicianId === t.id),
        dealership.policies.breakMinutes,
      ),
  );
  const bays = seed.serviceBays.filter(
    (b) =>
      b.dealershipId === dealershipId &&
      b.active &&
      !blocking.some((a) => a.serviceBayId === b.id && overlaps(a, slot)),
  );
  return { technicians: technicians.length, bays: bays.length };
}

describe("loading the seed", () => {
  it("fills an empty store, keeps the data added since when the version is the same, and resets on a newer version", async () => {
    const repo = createMemoryRepository();
    expect(await loadSeed(repo, DAY_1)).toBe("loaded");
    expect(await repo.getSeedVersion()).toBe(SEED_VERSION);
    expect((await repo.listDemoUsers()).length).toBeGreaterThanOrEqual(7);
    const before = await repo.read((s) =>
      s.appointments.listByCustomer("customer-a"),
    );
    expect(before).toHaveLength(1);

    await repo.write(async (s) => {
      await s.appointments.insert({ ...before[0]!, id: "added-later" });
      return { ok: true, value: null };
    });
    expect(await loadSeed(repo, DAY_2)).toBe("kept");
    const kept = await repo.read((s) =>
      s.appointments.listByCustomer("customer-a"),
    );
    expect(kept.map((a) => a.id).sort()).toEqual([
      "added-later",
      before[0]!.id,
    ]);

    expect(await loadSeed(repo, DAY_2, SEED_VERSION + 1)).toBe("reset");
    expect(await repo.getSeedVersion()).toBe(SEED_VERSION + 1);
    const reset = await repo.read((s) =>
      s.appointments.listByCustomer("customer-a"),
    );
    expect(reset.map((a) => a.id)).toEqual([before[0]!.id]);
    expect(reset[0]!.start).not.toBe(before[0]!.start);
  });
});
