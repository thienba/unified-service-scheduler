// One store test suite, run against every implementation (AD-8). The test names are the same for both.
// The data here is made up; the canary strings of the security tests live in their own fixtures.
import { describe, expect, it } from "vitest";
import type { Outcome, Repository } from "../../application/ports";
import type {
  Appointment,
  Customer,
  SeedData,
  Vehicle,
} from "../../domain/model";
import { instantAt, MINUTE_MS } from "../../domain/time";

const HOUR = 60 * MINUTE_MS;
export const T0 = Date.UTC(2026, 10, 3, 10, 0); // 2026-11-03 10:00 UTC

export function appointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: "appt-1",
    dealershipId: "d1",
    timeZone: "Europe/London",
    customerId: "c1",
    vehicleId: "v1",
    serviceTypeId: "st1",
    technicianId: "t1",
    serviceBayId: "bay1",
    courtesyCarId: null,
    transport: "wait",
    start: T0,
    end: T0 + HOUR,
    status: "confirmed",
    flags: [],
    version: 1,
    createdAt: T0 - 24 * HOUR,
    updatedAt: T0 - 24 * HOUR,
    cancelledAt: null,
    ...overrides,
  };
}

const customer = (id: string, name: string, phone: string): Customer => ({
  id,
  name,
  phone,
  email: `${id}@demo.example`,
});
const vehicle = (
  id: string,
  customerId: string,
  registration: string,
): Vehicle => ({
  id,
  customerId,
  registration,
  make: "Demo",
  model: "Model",
});

export function fixtureSeed(): SeedData {
  const hours = { open: "08:00", close: "18:00" };
  const shift = { start: "08:00", end: "17:00" };
  const tech = (id: string, dealershipId: string) => ({
    id,
    dealershipId,
    name: `Tech ${id}`,
    active: true,
    skills: ["mechanic"],
    shiftPattern: { 1: shift },
    shiftExceptions: { "2026-11-09": { kind: "leave" as const } },
  });
  const dealership = (id: string) => ({
    id,
    name: `Dealer ${id}`,
    timeZone: "Europe/London",
    weeklyHours: { 1: hours },
    dateOverrides: {},
    policies: {
      leadTimeMinutes: 120,
      horizonDays: 30,
      breakMinutes: 15,
      gridMinutes: 15,
    },
  });
  return {
    dealerships: [dealership("d1"), dealership("d2")],
    technicians: [tech("t1", "d1"), tech("t2", "d1"), tech("t3", "d2")],
    serviceBays: [
      { id: "bay1", dealershipId: "d1", name: "Bay 1", active: true },
      { id: "bay2", dealershipId: "d1", name: "Bay 2", active: true },
    ],
    courtesyCars: [
      { id: "car1", dealershipId: "d1", name: "Car 1", active: true },
    ],
    serviceTypes: [
      {
        id: "st1",
        name: "Oil change",
        durationMinutes: 60,
        requiredSkill: "mechanic",
      },
    ],
    customers: [
      customer("c1", "Alex Demo-Smith", "+44 7700 900111"),
      customer("c2", "Bo Demo-Jones", "+44 7700 900222"),
    ],
    vehicles: [
      vehicle("v1", "c1", "AB00 DEM"),
      vehicle("v2", "c2", "CD11 DEM"),
    ],
    demoUsers: [
      {
        id: "u1",
        name: "Demo staff",
        role: "staff",
        customerId: null,
        dealershipIds: ["d1"],
      },
    ],
    appointments: [],
  };
}

/** Reads the free bay and technician, then inserts a blocking appointment if they are free. */
export function bookOnce(
  repo: Repository,
  id: string,
): Promise<Outcome<string, "SLOT_UNAVAILABLE">> {
  return repo.write(async (stores) => {
    const busy = await stores.scheduling.listBlockingAppointments(
      "d1",
      T0,
      T0 + HOUR,
    );
    if (
      busy.some((a) => a.serviceBayId === "bay1" && a.technicianId === "t1")
    ) {
      return { ok: false, error: "SLOT_UNAVAILABLE" };
    }
    await stores.appointments.insert(appointment({ id }));
    return { ok: true, value: id };
  });
}

export function describeStoreContract(
  storeName: string,
  create: () => Promise<Repository>,
): void {
  async function seeded(): Promise<Repository> {
    const repo = await create();
    await repo.replaceAll(fixtureSeed(), 1);
    return repo;
  }
  const stored = (repo: Repository) =>
    repo.read((s) => s.appointments.listByDealershipDay("d1", 0, T0 * 2));

  describe(`${storeName} store`, () => {
    it("guarantee 1: two write units started together leave one overlapping appointment", async () => {
      const repo = await seeded();
      const results = await Promise.all([
        bookOnce(repo, "a1"),
        bookOnce(repo, "a2"),
      ]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.filter((r) => !r.ok)).toEqual([
        { ok: false, error: "SLOT_UNAVAILABLE" },
      ]);
      expect(await stored(repo)).toHaveLength(1);
    });

    it("guarantee 2: a unit that throws keeps nothing it wrote", async () => {
      const repo = await seeded();
      await expect(
        repo.write(async (s) => {
          await s.appointments.insert(appointment());
          await s.customers.insert(
            customer("c9", "New Demo", "+44 7700 900999"),
            vehicle("v9", "c9", "ZZ99 DEM"),
          );
          await s.outbox.add([
            {
              id: "m1",
              appointmentId: "appt-1",
              kind: "confirmation",
              dedupeKey: "appt-1:confirmation:1",
              dueAt: T0,
              status: "pending",
            },
          ]);
          await s.idempotency.put({
            actorId: "u1",
            key: "k1",
            requestHash: "h",
            response: {},
            createdAt: T0,
          });
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      await expectNothingKept(repo);
    });

    it("guarantee 2: a unit that returns a failure keeps nothing it wrote", async () => {
      const repo = await seeded();
      const outcome = await repo.write(async (s) => {
        await s.appointments.insert(appointment());
        await s.customers.insert(
          customer("c9", "New Demo", "+44 7700 900999"),
          vehicle("v9", "c9", "ZZ99 DEM"),
        );
        await s.outbox.add([
          {
            id: "m1",
            appointmentId: "appt-1",
            kind: "confirmation",
            dedupeKey: "appt-1:confirmation:1",
            dueAt: T0,
            status: "pending",
          },
        ]);
        await s.idempotency.put({
          actorId: "u1",
          key: "k1",
          requestHash: "h",
          response: {},
          createdAt: T0,
        });
        return { ok: false, error: "NO" } as Outcome<never, string>;
      });
      expect(outcome).toEqual({ ok: false, error: "NO" });
      await expectNothingKept(repo);
    });

    async function expectNothingKept(repo: Repository) {
      await repo.read(async (s) => {
        expect(await s.appointments.get("appt-1")).toBeUndefined();
        expect(await s.customers.get("c9")).toBeUndefined();
        expect(await s.outbox.list()).toEqual([]);
        expect(await s.idempotency.get("u1", "k1")).toBeUndefined();
      });
    }

    it("guarantee 3: a read inside a unit sees the writes made earlier in the same unit", async () => {
      const repo = await seeded();
      await repo.write(async (s) => {
        await s.appointments.insert(appointment());
        expect(await s.appointments.get("appt-1")).toEqual(appointment());
        expect(
          await s.scheduling.listBlockingAppointments("d1", T0, T0 + HOUR),
        ).toHaveLength(1);
        return { ok: true, value: null };
      });
    });

    it("guarantee 5: start and end come back as the same epoch milliseconds, also on a DST change day", async () => {
      const repo = await seeded();
      // 2026-03-29 is the day the clocks go forward in London; 01:00 UTC is the jump.
      const jump = instantAt("2026-03-29", "01:30", "Europe/London");
      const odd = appointment({
        id: "dst",
        start: jump - 1,
        end: jump + 3_600_001,
      });
      await repo.write(async (s) => {
        await s.appointments.insert(odd);
        return { ok: true, value: null };
      });
      const back = await repo.read((s) => s.appointments.get("dst"));
      expect(back?.start).toBe(jump - 1);
      expect(back?.end).toBe(jump + 3_600_001);
      expect(back).toEqual(odd);
    });

    it("listByDealershipDay returns only that dealership's appointments that touch the range", async () => {
      const repo = await seeded();
      await repo.write(async (s) => {
        await s.appointments.insert(appointment({ id: "in" }));
        await s.appointments.insert(
          appointment({
            id: "before",
            start: T0 - 3 * HOUR,
            end: T0 - 2 * HOUR,
          }),
        );
        await s.appointments.insert(
          appointment({ id: "touching-end", start: T0 - HOUR, end: T0 }),
        );
        await s.appointments.insert(
          appointment({ id: "straddles", start: T0 - HOUR, end: T0 + 1 }),
        );
        await s.appointments.insert(
          appointment({ id: "other", dealershipId: "d2" }),
        );
        return { ok: true, value: null };
      });
      const ids = (
        await repo.read((s) =>
          s.appointments.listByDealershipDay("d1", T0, T0 + HOUR),
        )
      )
        .map((a) => a.id)
        .sort();
      expect(ids).toEqual(["in", "straddles"]);
    });

    it("listBlockingAppointments leaves out cancelled appointments", async () => {
      const repo = await seeded();
      await repo.write(async (s) => {
        await s.appointments.insert(appointment({ id: "live" }));
        await s.appointments.insert(
          appointment({ id: "gone", status: "cancelled", cancelledAt: T0 }),
        );
        return { ok: true, value: null };
      });
      const blocking = await repo.read((s) =>
        s.scheduling.listBlockingAppointments("d1", T0, T0 + HOUR),
      );
      expect(blocking.map((a) => a.id)).toEqual(["live"]);
      expect(await stored(repo)).toHaveLength(2);
    });

    it("an appointment can be found by customer, updated, and not stored twice", async () => {
      const repo = await seeded();
      await repo.write(async (s) => {
        await s.appointments.insert(appointment());
        return { ok: true, value: null };
      });
      await expect(
        repo.write(async (s) => {
          await s.appointments.insert(appointment());
          return { ok: true, value: null };
        }),
      ).rejects.toThrow();
      await repo.write(async (s) => {
        await s.appointments.update(appointment({ version: 2 }));
        return { ok: true, value: null };
      });
      await expect(
        repo.write(async (s) => {
          await s.appointments.update(appointment({ id: "missing" }));
          return { ok: true, value: null };
        }),
      ).rejects.toThrow();
      const mine = await repo.read((s) => s.appointments.listByCustomer("c1"));
      expect(mine.map((a) => a.version)).toEqual([2]);
    });

    it("search finds a customer by part of the name in any case, by phone and by registration, with vehicles", async () => {
      const repo = await seeded();
      const find = (text: string) => repo.read((s) => s.customers.search(text));
      const byName = await find("DEMO-smi");
      expect(byName.map((c) => c.id)).toEqual(["c1"]);
      expect(byName[0]?.vehicles.map((v) => v.id)).toEqual(["v1"]);
      expect((await find("900222")).map((c) => c.id)).toEqual(["c2"]);
      expect((await find("cd11dem")).map((c) => c.id)).toEqual(["c2"]);
      expect(await find("nobody")).toEqual([]);
      expect(await find("  ")).toEqual([]);
    });

    it("a read unit may await several customer calls one after the other", async () => {
      const repo = await seeded();
      const found = await repo.read(async (s) => {
        const byName = await s.customers.search("alex");
        const byPhone = await s.customers.search("900222");
        const one = await s.customers.get("c1");
        const dup = await s.customers.findDuplicates("+44 7700 900111", "NONE");
        return [byName, byPhone, one ? [one] : [], dup].map((list) =>
          list.map((c) => c.id),
        );
      });
      expect(found).toEqual([["c1"], ["c2"], ["c1"], ["c1"]]);
    });

    it("insertVehicle adds a vehicle to a stored customer, and fails when the vehicle id is stored", async () => {
      const repo = await seeded();
      await repo.write(async (s) => {
        await s.customers.insertVehicle(vehicle("v9", "c1", "NEW 123"));
        return { ok: true, value: null };
      });
      const c1 = await repo.read((s) => s.customers.get("c1"));
      expect(c1?.vehicles.map((v) => v.id)).toEqual(["v1", "v9"]);
      await expect(
        repo.write(async (s) => {
          await s.customers.insertVehicle(vehicle("v9", "c1", "OTHER 1"));
          return { ok: true, value: null };
        }),
      ).rejects.toThrow();
    });

    it("findDuplicates returns a customer with that phone or a vehicle with that registration", async () => {
      const repo = await seeded();
      const dup = (phone: string, registration: string) =>
        repo
          .read((s) => s.customers.findDuplicates(phone, registration))
          .then((found) => found.map((c) => c.id).sort());
      expect(await dup("+44 7700 900111", "NONE")).toEqual(["c1"]);
      expect(await dup("none", "CD11 DEM")).toEqual(["c2"]);
      expect(await dup("+44 7700 900111", "CD11 DEM")).toEqual(["c1", "c2"]);
      expect(await dup("none", "NONE")).toEqual([]);
    });

    it("idempotency put then get returns the record, and another actor gets nothing", async () => {
      const repo = await seeded();
      const record = {
        actorId: "u1",
        key: "k1",
        requestHash: "abc",
        response: { appointmentId: "appt-1" },
        createdAt: T0,
      };
      await repo.write(async (s) => {
        await s.idempotency.put(record);
        return { ok: true, value: null };
      });
      expect(await repo.read((s) => s.idempotency.get("u1", "k1"))).toEqual(
        record,
      );
      expect(
        await repo.read((s) => s.idempotency.get("u2", "k1")),
      ).toBeUndefined();
    });

    it("outbox add twice with one dedupeKey stores one message, and cancelPending marks only pending ones", async () => {
      const repo = await seeded();
      const message = (
        id: string,
        dedupeKey: string,
        status: "pending" | "sent",
      ) => ({
        id,
        appointmentId: "appt-1",
        kind: "reminder",
        dedupeKey,
        dueAt: T0,
        status,
      });
      await repo.write(async (s) => {
        await s.outbox.add([message("m1", "appt-1:reminder:1", "pending")]);
        await s.outbox.add([
          message("m2", "appt-1:reminder:1", "pending"),
          message("m3", "appt-1:confirmation:1", "sent"),
          {
            ...message("m4", "appt-2:reminder:1", "pending"),
            appointmentId: "appt-2",
          },
        ]);
        return { ok: true, value: null };
      });
      expect(
        (await repo.read((s) => s.outbox.list())).map((m) => m.id).sort(),
      ).toEqual(["m1", "m3", "m4"]);
      await repo.write(async (s) => {
        await s.outbox.cancelPending("appt-1");
        return { ok: true, value: null };
      });
      const status = async (id: string) =>
        (await repo.read((s) => s.outbox.list())).find((m) => m.id === id)
          ?.status;
      expect(await status("m1")).toBe("cancelled");
      expect(await status("m3")).toBe("sent");
      expect(await status("m4")).toBe("pending");
      expect(
        (await repo.read((s) => s.outbox.list({ status: "pending" }))).map(
          (m) => m.id,
        ),
      ).toEqual(["m4"]);
      expect(
        (
          await repo.read((s) => s.outbox.list({ appointmentId: "appt-2" }))
        ).map((m) => m.id),
      ).toEqual(["m4"]);
    });

    it("the scheduling reader lists a dealership's own resources, and saved settings and shifts come back", async () => {
      const repo = await seeded();
      const read = <T>(
        f: (s: Parameters<Parameters<Repository["read"]>[0]>[0]) => Promise<T>,
      ) => repo.read(f);
      expect(
        (await read((s) => s.scheduling.listTechnicians("d1")))
          .map((t) => t.id)
          .sort(),
      ).toEqual(["t1", "t2"]);
      expect(
        (await read((s) => s.scheduling.listServiceBays("d1")))
          .map((b) => b.id)
          .sort(),
      ).toEqual(["bay1", "bay2"]);
      expect(
        (await read((s) => s.scheduling.listCourtesyCars("d1"))).map(
          (c) => c.id,
        ),
      ).toEqual(["car1"]);
      expect(
        (await read((s) => s.scheduling.getServiceType("st1")))
          ?.durationMinutes,
      ).toBe(60);
      expect((await read((s) => s.scheduling.getDealership("d2")))?.id).toBe(
        "d2",
      );
      const leave = { kind: "leave" as const };
      expect(
        await read((s) =>
          s.scheduling.listShiftExceptions("d1", "2026-11-09", "2026-11-09"),
        ),
      ).toHaveLength(2);
      expect(
        await read((s) =>
          s.scheduling.listShiftExceptions("d1", "2026-11-10", "2026-12-01"),
        ),
      ).toEqual([]);
      await repo.write(async (s) => {
        await s.settings.saveTechnicianShifts(
          "t1",
          { 2: { start: "09:00", end: "15:00" } },
          { "2026-12-01": leave },
        );
        const hours = { open: "09:00", close: "12:00" };
        await s.settings.saveDealershipSettings("d1", {
          weeklyHours: { 2: hours },
          dateOverrides: { "2026-12-25": "closed" },
          policies: {
            leadTimeMinutes: 60,
            horizonDays: 10,
            breakMinutes: 0,
            gridMinutes: 30,
          },
        });
        return { ok: true, value: null };
      });
      const t1 = (await read((s) => s.scheduling.listTechnicians("d1"))).find(
        (t) => t.id === "t1",
      );
      expect(t1?.shiftPattern).toEqual({ 2: { start: "09:00", end: "15:00" } });
      expect(t1?.shiftExceptions).toEqual({ "2026-12-01": leave });
      const d1 = await read((s) => s.scheduling.getDealership("d1"));
      expect(d1?.weeklyHours).toEqual({ 2: { open: "09:00", close: "12:00" } });
      expect(d1?.dateOverrides).toEqual({ "2026-12-25": "closed" });
      expect(d1?.policies.gridMinutes).toBe(30);
      expect(d1?.name).toBe("Dealer d1");
      await expect(
        repo.write(async (s) => {
          await s.settings.saveTechnicianShifts("nobody", {}, {});
          return { ok: true, value: null };
        }),
      ).rejects.toThrow();
      await expect(
        repo.write(async (s) => {
          await s.settings.saveDealershipSettings("nobody", d1!);
          return { ok: true, value: null };
        }),
      ).rejects.toThrow();
    });

    it("a customer is stored with their vehicle", async () => {
      const repo = await seeded();
      await repo.write(async (s) => {
        await s.customers.insert(
          customer("c9", "New Demo", "+44 7700 900999"),
          vehicle("v9", "c9", "ZZ99 DEM"),
        );
        return { ok: true, value: null };
      });
      const found = await repo.read((s) => s.customers.get("c9"));
      expect(found?.vehicles.map((v) => v.registration)).toEqual(["ZZ99 DEM"]);
      expect(await repo.read((s) => s.customers.get("none"))).toBeUndefined();
    });

    it("a customer insert with a stored vehicle id, and an outbox message with a stored id, are refused", async () => {
      const repo = await seeded();
      await expect(
        repo.write(async (s) => {
          await s.customers.insert(
            customer("c9", "New Demo", "+44 7700 900999"),
            vehicle("v1", "c9", "ZZ99 DEM"),
          );
          return { ok: true, value: null };
        }),
      ).rejects.toThrow();
      expect(await repo.read((s) => s.customers.get("c9"))).toBeUndefined();
      const message = {
        id: "m1",
        appointmentId: "appt-1",
        kind: "reminder",
        dedupeKey: "appt-1:reminder:1",
        dueAt: T0,
        status: "pending" as const,
      };
      await repo.write(async (s) => {
        await s.outbox.add([message]);
        return { ok: true, value: null };
      });
      await expect(
        repo.write(async (s) => {
          await s.outbox.add([{ ...message, dedupeKey: "appt-1:reminder:2" }]);
          return { ok: true, value: null };
        }),
      ).rejects.toThrow();
    });

    it("lists come back in the same order whatever order they were stored in", async () => {
      const repo = await seeded();
      await repo.write(async (s) => {
        await s.appointments.insert(appointment({ id: "z", start: T0 }));
        await s.appointments.insert(
          appointment({ id: "b", start: T0 + 2 * HOUR, end: T0 + 3 * HOUR }),
        );
        await s.appointments.insert(appointment({ id: "a", start: T0 }));
        await s.customers.insert(
          customer("c0", "Alex Zed", "+44 7700 900000"),
          vehicle("v0", "c0", "AB00 ZED"),
        );
        await s.outbox.add(
          ["m3", "m1", "m2"].map((id) => ({
            id,
            appointmentId: "z",
            kind: "reminder",
            dedupeKey: `z:reminder:${id}`,
            dueAt: T0,
            status: "pending" as const,
          })),
        );
        return { ok: true, value: null };
      });
      const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
      expect(
        ids(
          await repo.read((s) =>
            s.appointments.listByDealershipDay("d1", 0, T0 * 2),
          ),
        ),
      ).toEqual(["a", "z", "b"]);
      expect(
        ids(
          await repo.read((s) =>
            s.scheduling.listBlockingAppointments("d1", 0, T0 * 2),
          ),
        ),
      ).toEqual(["a", "z", "b"]);
      expect(
        ids(await repo.read((s) => s.appointments.listByCustomer("c1"))),
      ).toEqual(["a", "z", "b"]);
      expect(ids(await repo.read((s) => s.customers.search("alex")))).toEqual([
        "c0",
        "c1",
      ]);
      expect(ids(await repo.read((s) => s.outbox.list()))).toEqual([
        "m1",
        "m2",
        "m3",
      ]);
      expect(
        ids(await repo.read((s) => s.scheduling.listTechnicians("d1"))),
      ).toEqual(["t1", "t2"]);
    });

    it("replaceAll swaps everything stored for the seed and its version", async () => {
      const repo = await seeded();
      expect(await repo.getSeedVersion()).toBe(1);
      expect((await repo.listDemoUsers()).map((u) => u.id)).toEqual(["u1"]);
      await bookOnce(repo, "a1");
      await repo.replaceAll(fixtureSeed(), 2);
      expect(await repo.getSeedVersion()).toBe(2);
      expect(await stored(repo)).toEqual([]);
    });
  });
}
