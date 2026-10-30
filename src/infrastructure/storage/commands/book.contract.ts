// bookAppointment over a real store (plan ticket A5). The entry test file mocks `checkStart` as a spy.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  bookAppointment,
  cancelAppointment,
  rescheduleAppointment,
} from "../../../application/commands";
import { loadSnapshot } from "../../../application/load-snapshot";
import type { Repository } from "../../../application/ports";
import { checkStart, searchDay } from "../../../domain/availability";
import {
  KEY,
  MIN,
  MONDAY,
  NOW,
  OTHER_KEY,
  appointmentsOf,
  at,
  bookRequest,
  customerActor,
  dump,
  makeDeps,
  managerActor,
  newCustomerRequest,
  seed,
  seededRepo,
  spyOnStore,
  staffActor,
} from "./fixtures";

export function describeBookContract(
  storeName: string,
  open: () => Promise<Repository>,
): void {
  async function setup(data = seed()) {
    const repo = await seededRepo(open, data);
    return { repo, ...makeDeps(repo) };
  }

  describe(`bookAppointment over the ${storeName} store`, () => {
    beforeEach(() => {
      vi.mocked(checkStart).mockClear();
    });

    it("REQ-BOOK-001.AC-1: runs the check for that service type, at that dealership, from that start", async () => {
      const { deps } = await setup();
      await bookAppointment(customerActor(), deps, bookRequest(), KEY);
      expect(checkStart).toHaveBeenCalledTimes(1);
      expect(checkStart).toHaveBeenCalledWith(
        expect.objectContaining({
          dealership: expect.objectContaining({ id: "d1" }),
          serviceType: expect.objectContaining({
            id: "st1",
            durationMinutes: 60,
            requiredSkill: "mechanic",
          }),
        }),
        expect.objectContaining({ start: at("10:00"), transport: "wait" }),
        NOW,
      );
    });

    it("REQ-BOOK-001.AC-2: a request with vehicle, service type, dealership and time missing is validation_failed and the check does not run", async () => {
      const { deps, repo } = await setup();
      const before = await dump(repo);
      const result = await bookAppointment(
        customerActor(),
        deps,
        { transport: "wait" },
        KEY,
      );
      expect(result).toMatchObject({ kind: "validation_failed" });
      const fields = (result as { errors: { field: string }[] }).errors.map(
        (e) => e.field,
      );
      expect(fields).toEqual(
        expect.arrayContaining([
          "vehicleId",
          "serviceTypeId",
          "dealershipId",
          "start",
        ]),
      );
      expect(checkStart).toHaveBeenCalledTimes(0);
      expect(await dump(repo)).toEqual(before);
    });

    it("REQ-BOOK-003.AC-1: stores a confirmed appointment with every field and version 1", async () => {
      const { deps, repo } = await setup();
      const result = await bookAppointment(
        customerActor(),
        deps,
        bookRequest(),
        KEY,
      );
      expect(result.kind).toBe("ok");
      if (result.kind !== "ok") return;
      expect(result.appointment).toEqual({
        id: expect.any(String),
        dealershipId: "d1",
        timeZone: "UTC",
        customerId: "c1",
        vehicleId: "v1",
        serviceTypeId: "st1",
        technicianId: "t1",
        serviceBayId: "bay1",
        courtesyCarId: null,
        transport: "wait",
        start: at("10:00"),
        end: at("11:00"),
        status: "confirmed",
        flags: [],
        version: 1,
        createdAt: NOW,
        updatedAt: NOW,
        cancelledAt: null,
      });
      expect(await appointmentsOf(repo)).toEqual([result.appointment]);
    });

    it("REQ-BOOK-003.AC-3: an overlapping interval reports the same technician busy", async () => {
      const { deps } = await setup(seed(1, 2));
      await bookAppointment(customerActor("c1"), deps, bookRequest(), KEY);
      const result = await bookAppointment(
        customerActor("c2"),
        deps,
        bookRequest({ vehicleId: "v2", start: at("10:30") }),
        OTHER_KEY,
      );
      expect(result).toMatchObject({
        kind: "slot_unavailable",
        reasons: ["TECHNICIAN_BUSY"],
      });
    });

    it("REQ-BOOK-003.AC-3: an overlapping interval reports the same bay busy", async () => {
      const { deps } = await setup(seed(2, 1));
      await bookAppointment(customerActor("c1"), deps, bookRequest(), KEY);
      const result = await bookAppointment(
        customerActor("c2"),
        deps,
        bookRequest({ vehicleId: "v2", start: at("10:30") }),
        OTHER_KEY,
      );
      expect(result).toMatchObject({
        kind: "slot_unavailable",
        reasons: ["BAY_BUSY"],
      });
    });

    it("REQ-BOOK-010.AC-1: a request with no transport, or with two, is validation_failed", async () => {
      const { deps, repo } = await setup();
      const before = await dump(repo);
      for (const transport of [undefined, "wait,courtesy_car"]) {
        const result = await bookAppointment(
          customerActor(),
          deps,
          bookRequest({ transport: transport as never }),
          KEY,
        );
        expect(result).toMatchObject({
          kind: "validation_failed",
          errors: [{ field: "transport" }],
        });
      }
      expect(await dump(repo)).toEqual(before);
    });

    it("REQ-BOOK-010.AC-3: courtesy_car stores the id of a free courtesy car", async () => {
      const { deps } = await setup();
      const result = await bookAppointment(
        customerActor(),
        deps,
        bookRequest({ transport: "courtesy_car" }),
        KEY,
      );
      expect(result).toMatchObject({
        kind: "ok",
        appointment: { transport: "courtesy_car", courtesyCarId: "car1" },
      });
    });

    it("REQ-BOOK-009.AC-3: a time the day search listed as free, then taken by someone else, is slot_unavailable at confirm", async () => {
      const { deps, repo } = await setup(seed(1, 1));
      const listed = await repo.read(async (s) => {
        const snapshot = await loadSnapshot(s, {
          dealershipId: "d1",
          serviceTypeId: "st1",
          around: at("10:00"),
          daysEitherSide: 0,
        });
        return searchDay(
          snapshot!,
          { date: "2026-11-02", transport: "wait" },
          NOW,
        );
      });
      expect(listed).toContain(at("10:00"));
      await bookAppointment(
        customerActor("c2"),
        deps,
        bookRequest({ vehicleId: "v2" }),
        OTHER_KEY,
      );
      const result = await bookAppointment(
        customerActor("c1"),
        deps,
        bookRequest(),
        KEY,
      );
      expect(result).toMatchObject({ kind: "slot_unavailable" });
    });

    it("REQ-BOOK-009.AC-4: the same confirm twice, one after the other, gives one appointment and counts one replay", async () => {
      const { deps, repo, metrics } = await setup();
      const first = await bookAppointment(
        customerActor(),
        deps,
        bookRequest(),
        KEY,
      );
      const second = await bookAppointment(
        customerActor(),
        deps,
        bookRequest(),
        KEY,
      );
      expect(first.kind).toBe("ok");
      expect(second).toEqual({ ...first, replayed: true });
      expect(await appointmentsOf(repo)).toHaveLength(1);
      expect(metrics.count("idempotent_replays_total")).toBe(1);
      expect(metrics.count("appointments_confirmed_total")).toBe(1);
    });

    it("a replayed confirm logs outcome replayed, the first logs ok", async () => {
      const { deps, logger } = await setup();
      for (let i = 0; i < 2; i++) {
        await bookAppointment(customerActor(), deps, bookRequest(), KEY);
      }
      const outcomes = logger.calls.flatMap((c) =>
        c.kind === "info" && c.msg === "appointment.book"
          ? [c.fields.outcome]
          : [],
      );
      expect(outcomes).toEqual(["ok", "replayed"]);
    });

    it("a 409 with two reasons counts each reason and one refusal", async () => {
      const { deps, metrics } = await setup(seed(1, 1));
      await bookAppointment(customerActor("c1"), deps, bookRequest(), KEY);
      metrics.counters.length = 0;
      const lost = await bookAppointment(
        customerActor("c2"),
        deps,
        bookRequest({ vehicleId: "v2" }),
        OTHER_KEY,
      );
      expect(lost).toMatchObject({
        kind: "slot_unavailable",
        reasons: ["TECHNICIAN_BUSY", "BAY_BUSY"],
      });
      expect(metrics.counters).toEqual([
        {
          name: "appointments_refused_total",
          labels: { dealershipId: "d1" },
        },
        {
          name: "appointment_conflicts_total",
          labels: { dealershipId: "d1", reason: "TECHNICIAN_BUSY" },
        },
        {
          name: "appointment_conflicts_total",
          labels: { dealershipId: "d1", reason: "BAY_BUSY" },
        },
      ]);
    });

    it("REQ-BOOK-009.AC-4: the same confirm twice together gives one appointment and the same answer", async () => {
      const { deps, repo } = await setup();
      const [first, second] = await Promise.all([
        bookAppointment(customerActor(), deps, bookRequest(), KEY),
        bookAppointment(customerActor(), deps, bookRequest(), KEY),
      ]);
      expect(first.kind).toBe("ok");
      expect(second.kind).toBe("ok");
      // Either one can run first, so which of the two is the replay is not fixed.
      const answers = [first, second];
      const original = answers.filter((a) => !("replayed" in a && a.replayed));
      expect(original).toHaveLength(1);
      expect(answers.filter((a) => a !== original[0])).toEqual([
        { ...original[0], replayed: true },
      ]);
      expect(await appointmentsOf(repo)).toHaveLength(1);
    });

    it("AD-5: the same key with another body is idempotency_key_reused, and no key is idempotency_key_missing", async () => {
      const { deps, repo } = await setup();
      await bookAppointment(customerActor(), deps, bookRequest(), KEY);
      const reused = await bookAppointment(
        customerActor(),
        deps,
        bookRequest({ start: at("12:00") }),
        KEY,
      );
      expect(reused).toEqual({ kind: "idempotency_key_reused" });
      const before = await dump(repo);
      for (const key of [undefined, ""]) {
        expect(
          await bookAppointment(customerActor(), deps, bookRequest(), key),
        ).toEqual({
          kind: "idempotency_key_missing",
        });
      }
      expect(await dump(repo)).toEqual(before);
    });

    it("SEC-8.AC-4: a failed request saves no key, so after the cause is gone the same key runs fresh", async () => {
      const { deps, repo } = await setup(seed(1, 1));
      const blocker = await bookAppointment(
        customerActor("c2"),
        deps,
        bookRequest({ vehicleId: "v2" }),
        OTHER_KEY,
      );
      const lost = await bookAppointment(
        customerActor("c1"),
        deps,
        bookRequest(),
        KEY,
      );
      expect(lost.kind).toBe("slot_unavailable");
      const forbidden = await bookAppointment(
        customerActor("c1"),
        deps,
        bookRequest({ customerId: "c2" }),
        KEY,
      );
      const missing = await bookAppointment(
        customerActor("c1"),
        deps,
        bookRequest({ vehicleId: "v2" }),
        KEY,
      );
      const invalid = await bookAppointment(
        customerActor("c1"),
        deps,
        bookRequest({ serviceTypeId: undefined }),
        KEY,
      );
      expect([forbidden.kind, missing.kind, invalid.kind]).toEqual([
        "forbidden",
        "not_found",
        "validation_failed",
      ]);
      expect(
        await repo.read((s) => s.idempotency.get("user-c1", KEY)),
      ).toBeUndefined();
      // The cause is gone: the other booking is cancelled, and the same key now succeeds.
      await cancelAppointment(
        managerActor(),
        deps,
        (blocker as { appointment: { id: string } }).appointment.id,
      );
      const again = await bookAppointment(
        customerActor("c1"),
        deps,
        bookRequest(),
        KEY,
      );
      expect(again.kind).toBe("ok");
    });

    it("SEC-8.AC-2: another customer using the same key gets their own appointment, never the first one's answer", async () => {
      const { deps, repo } = await setup();
      const a = await bookAppointment(
        customerActor("c1"),
        deps,
        bookRequest(),
        KEY,
      );
      const b = await bookAppointment(
        customerActor("c2"),
        deps,
        bookRequest({ vehicleId: "v2", start: at("13:00") }),
        KEY,
      );
      expect(a.kind).toBe("ok");
      expect(b.kind).toBe("ok");
      if (a.kind !== "ok" || b.kind !== "ok") return;
      expect(b.appointment.id).not.toBe(a.appointment.id);
      expect(b.appointment.customerId).toBe("c2");
      expect(await appointmentsOf(repo)).toHaveLength(2);
    });

    it("SEC-8.AC-3: a key used to book, sent with the same body to reschedule, is idempotency_key_reused", async () => {
      const { deps } = await setup();
      const booked = await bookAppointment(
        customerActor(),
        deps,
        bookRequest(),
        KEY,
      );
      if (booked.kind !== "ok") throw new Error("setup failed");
      const body = bookRequest();
      const result = await rescheduleAppointment(
        customerActor(),
        deps,
        booked.appointment.id,
        { start: body.start },
        KEY,
      );
      expect(result).toEqual({ kind: "idempotency_key_reused" });
    });

    it("SEC-8.AC-5 and SEC-10: the saved record holds a hash and ids only, and the logs, outbox and record hold no canary details", async () => {
      const { deps, repo, logger } = await setup();
      const staff = staffActor();
      const result = await bookAppointment(
        staff,
        deps,
        newCustomerRequest(),
        KEY,
      );
      expect(result.kind).toBe("ok");
      const record = await repo.read((s) =>
        s.idempotency.get(staff.userId, KEY),
      );
      expect(record?.requestHash).toMatch(/^[0-9a-f]{64}$/);
      const outbox = await repo.read((s) => s.outbox.list());
      const everything = JSON.stringify([record, outbox, logger.calls]);
      for (const canary of [
        "Test Person",
        "+44 7700 900123",
        "t@example.com",
        "ZZ99 TST",
        "ZZ99TST",
      ]) {
        expect(everything).not.toContain(canary);
      }
      expect(record?.response).toEqual({
        appointmentId: (result as { appointment: { id: string } }).appointment
          .id,
      });
    });

    it("REQ-BOOK-009.AC-5: two free technicians and two free bays: two confirms together are both ok, with different technicians and bays", async () => {
      const { deps, repo } = await setup(seed(2, 2));
      const [a, b] = await Promise.all([
        bookAppointment(customerActor("c1"), deps, bookRequest(), KEY),
        bookAppointment(
          customerActor("c2"),
          deps,
          bookRequest({ vehicleId: "v2" }),
          OTHER_KEY,
        ),
      ]);
      expect([a.kind, b.kind]).toEqual(["ok", "ok"]);
      const stored = await appointmentsOf(repo);
      expect(new Set(stored.map((x) => x.technicianId)).size).toBe(2);
      expect(new Set(stored.map((x) => x.serviceBayId)).size).toBe(2);
    });

    it("AD-4: a failure after the appointment was prepared (the idempotency write throws) stores nothing, not even a new customer", async () => {
      const { repo, ...rest } = await setup();
      const failing: Repository = {
        ...repo,
        read: repo.read,
        write: (work) =>
          repo.write((stores) =>
            work({
              ...stores,
              idempotency: {
                ...stores.idempotency,
                put: async () => {
                  throw new Error("disk full");
                },
              },
            }),
          ),
      };
      const before = await dump(repo, [staffActor()]);
      await expect(
        bookAppointment(
          staffActor(),
          { ...rest.deps, uow: failing },
          newCustomerRequest(),
          KEY,
        ),
      ).rejects.toThrow("disk full");
      expect(await dump(repo, [staffActor()])).toEqual(before);
    });

    it("REQ-BOOK-014.AC-5, SEC-6.AC-1..3: customer A cannot book for B, with B's vehicle, or with a new customer or vehicle, and nothing is stored", async () => {
      const { deps, repo } = await setup();
      const before = await dump(repo);
      const a = customerActor("c1");
      expect(
        await bookAppointment(
          a,
          deps,
          bookRequest({ customerId: "c2", vehicleId: "v2" }),
          KEY,
        ),
      ).toEqual({ kind: "forbidden" });
      expect(
        await bookAppointment(
          a,
          deps,
          bookRequest({ customerId: "c1", vehicleId: "v2" }),
          KEY,
        ),
      ).toEqual({ kind: "not_found" });
      expect(await bookAppointment(a, deps, newCustomerRequest(), KEY)).toEqual(
        { kind: "forbidden" },
      );
      expect(
        await bookAppointment(
          a,
          deps,
          bookRequest({
            newVehicle: { registration: "AA11", make: "m", model: "m" },
          }),
          KEY,
        ),
      ).toEqual({ kind: "forbidden" });
      expect(
        await bookAppointment(
          a,
          deps,
          bookRequest({ technicianId: "t1" }),
          KEY,
        ),
      ).toEqual({ kind: "forbidden" });
      expect(await dump(repo)).toEqual(before);
    });

    it("SEC-6.AC-4: staff booking a vehicle that is not the customer's is validation_failed and nothing is stored", async () => {
      const { deps, repo } = await setup();
      const before = await dump(repo);
      const result = await bookAppointment(
        staffActor(),
        deps,
        bookRequest({ customerId: "c1", vehicleId: "v2" }),
        KEY,
      );
      expect(result).toMatchObject({
        kind: "validation_failed",
        errors: [{ field: "vehicleId" }],
      });
      expect(await dump(repo)).toEqual(before);
    });

    it("SEC-4.AC-2, AC-5: staff and managers book for any customer in their dealerships, and a dealership outside the list is forbidden", async () => {
      const { deps, repo } = await setup();
      for (const [actor, key] of [
        [staffActor(), KEY],
        [managerActor(), OTHER_KEY],
      ] as const) {
        const result = await bookAppointment(
          actor,
          deps,
          bookRequest({
            customerId: "c2",
            vehicleId: "v2",
            start: key === KEY ? at("10:00") : at("14:00"),
          }),
          key,
        );
        expect(result).toMatchObject({
          kind: "ok",
          appointment: { customerId: "c2" },
        });
      }
      const before = await dump(repo);
      expect(
        await bookAppointment(
          staffActor(["d2"]),
          deps,
          bookRequest({ customerId: "c1" }),
          KEY,
        ),
      ).toEqual({ kind: "forbidden" });
      const both = staffActor(["d1", "d2"]);
      const ok = await bookAppointment(
        both,
        deps,
        bookRequest({ customerId: "c1", start: at("16:00") }),
        "33333333-3333-4333-8333-333333333333",
      );
      expect(ok.kind).toBe("ok");
      expect(await dump(repo)).not.toEqual(before);
      const d2 = await bookAppointment(
        both,
        deps,
        bookRequest({
          dealershipId: "d2",
          customerId: "c1",
          start: at("12:00"),
        }),
        "44444444-4444-4444-8444-444444444444",
      );
      expect(d2.kind).toBe("ok");
    });

    it("SEC-3: a refused command leaves the stores as they were, and the actor is checked before any store is read", async () => {
      const { repo, deps } = await setup();
      const { uow, calls } = spyOnStore(repo);
      const result = await bookAppointment(
        customerActor("c1"),
        { ...deps, uow },
        bookRequest({ customerId: "c2" }),
        KEY,
      );
      expect(result).toEqual({ kind: "forbidden" });
      expect(calls).toEqual([]);
    });

    it("REQ-BOOK-014: staff booking for an existing customer give the same result values as a customer's own booking", async () => {
      const { deps } = await setup(seed(1, 1));
      const own = await bookAppointment(
        customerActor("c1"),
        deps,
        bookRequest(),
        KEY,
      );
      const staff = await bookAppointment(
        staffActor(),
        deps,
        bookRequest({ customerId: "c2", vehicleId: "v2" }),
        OTHER_KEY,
      );
      expect(own.kind).toBe("ok");
      expect(staff).toMatchObject({
        kind: "slot_unavailable",
        reasons: expect.arrayContaining(["TECHNICIAN_BUSY"]),
      });
    });

    it("REQ-BOOK-014.AC-2: a new customer, vehicle and appointment are stored together, and the customer is found by name, phone and registration", async () => {
      const { deps, repo } = await setup();
      const result = await bookAppointment(
        staffActor(),
        deps,
        newCustomerRequest(),
        KEY,
      );
      expect(result.kind).toBe("ok");
      if (result.kind !== "ok") return;
      const found = await repo.read(async (s) => ({
        name: await s.customers.search("test person"),
        phone: await s.customers.search("7700 900123"),
        registration: await s.customers.search("zz99tst"),
      }));
      for (const list of Object.values(found)) {
        expect(list).toHaveLength(1);
        expect(list[0]).toMatchObject({
          id: result.appointment.customerId,
          vehicles: [{ id: result.appointment.vehicleId, year: 2020 }],
        });
      }
    });

    it("REQ-BOOK-014.AC-3: a missing required field is validation_failed naming it, without repeating what was typed, and nothing is stored", async () => {
      const { deps, repo } = await setup();
      const before = await dump(repo);
      const result = await bookAppointment(
        staffActor(),
        deps,
        newCustomerRequest({
          newCustomer: { email: "t@example.com" },
          newVehicle: { year: 2020 },
        }),
        KEY,
      );
      const errors = (
        result as { errors: { field: string; message: string }[] }
      ).errors;
      expect(errors.map((e) => e.field).sort()).toEqual([
        "newCustomer.name",
        "newCustomer.phone",
        "newVehicle.make",
        "newVehicle.model",
        "newVehicle.registration",
      ]);
      expect(JSON.stringify(errors)).not.toContain("t@example.com");
      expect(await dump(repo)).toEqual(before);
    });

    it("REQ-BOOK-014.AC-3, D-0001-18: an invalid value is validation_failed naming the field and rule, never the value", async () => {
      const { deps, repo } = await setup();
      const before = await dump(repo);
      const result = await bookAppointment(
        staffActor(),
        deps,
        newCustomerRequest({
          newCustomer: {
            name: "Test Person",
            phone: "12ab",
            email: "no-at-sign",
          },
          newVehicle: { registration: "?", make: "m", model: "m", year: 1900 },
        }),
        KEY,
      );
      const errors = (
        result as { errors: { field: string; message: string }[] }
      ).errors;
      expect(errors.map((e) => e.field).sort()).toEqual([
        "newCustomer.email",
        "newCustomer.phone",
        "newVehicle.registration",
        "newVehicle.year",
      ]);
      const text = JSON.stringify(errors);
      for (const typed of ["12ab", "no-at-sign", "1900"])
        expect(text).not.toContain(typed);
      expect(await dump(repo)).toEqual(before);
    });

    it("REQ-BOOK-014: a new customer needs a new vehicle, and cannot be sent with an existing customer or vehicle", async () => {
      const { deps } = await setup();
      const noVehicle = await bookAppointment(
        staffActor(),
        deps,
        newCustomerRequest({ newVehicle: undefined }),
        KEY,
      );
      expect(noVehicle).toMatchObject({
        kind: "validation_failed",
        errors: [{ field: "newVehicle" }],
      });
      const both = await bookAppointment(
        staffActor(),
        deps,
        newCustomerRequest({ customerId: "c1" }),
        KEY,
      );
      expect(both).toMatchObject({
        kind: "validation_failed",
        errors: [{ field: "customerId" }],
      });
      const twoVehicles = await bookAppointment(
        staffActor(),
        deps,
        newCustomerRequest({ vehicleId: "v1" }),
        KEY,
      );
      expect(twoVehicles).toMatchObject({
        kind: "validation_failed",
        errors: [{ field: "vehicleId" }],
      });
    });

    it("D-0001-29: staff add a new vehicle to the customer they picked; it is stored with the appointment, once, and the customer keeps one record", async () => {
      const { deps, repo } = await setup();
      const request = bookRequest({
        customerId: "c1",
        vehicleId: undefined,
        newVehicle: {
          registration: "NW 22 CAR",
          make: "Kia",
          model: "Ceed",
          year: 2019,
        },
      });
      const first = await bookAppointment(staffActor(), deps, request, KEY);
      const second = await bookAppointment(staffActor(), deps, request, KEY);
      expect(first.kind).toBe("ok");
      expect(second).toEqual({ ...first, replayed: true });
      if (first.kind !== "ok") return;
      const customer = await repo.read((s) => s.customers.get("c1"));
      expect(customer?.vehicles.map((v) => v.id)).toEqual(
        ["v1", first.appointment.vehicleId].sort(),
      );
      expect(
        customer?.vehicles.find((v) => v.id === first.appointment.vehicleId),
      ).toMatchObject({
        customerId: "c1",
        registration: "NW 22 CAR",
        year: 2019,
      });
      expect(await repo.read((s) => s.customers.search("alex"))).toHaveLength(
        1,
      );
    });

    it("D-0001-29: the new vehicle of an existing customer gets the same checks, and an unknown customer is not_found; nothing is stored", async () => {
      const { deps, repo } = await setup();
      const before = await dump(repo);
      const bad = await bookAppointment(
        staffActor(),
        deps,
        bookRequest({
          customerId: "c1",
          vehicleId: undefined,
          newVehicle: { registration: "!", make: "", model: "m" },
        }),
        KEY,
      );
      expect(bad).toMatchObject({ kind: "validation_failed" });
      expect(
        (bad as { errors: { field: string }[] }).errors.map((e) => e.field),
      ).toEqual(["newVehicle.registration", "newVehicle.make"]);
      const unknown = await bookAppointment(
        staffActor(),
        deps,
        bookRequest({
          customerId: "nope",
          vehicleId: undefined,
          newVehicle: { registration: "AB12", make: "m", model: "m" },
        }),
        KEY,
      );
      expect(unknown).toEqual({ kind: "not_found" });
      expect(await dump(repo)).toEqual(before);
    });

    it("D-0001-29: a customer still cannot send a new vehicle, also for their own customer id", async () => {
      const { deps } = await setup();
      const result = await bookAppointment(
        customerActor("c1"),
        deps,
        bookRequest({
          customerId: "c1",
          vehicleId: undefined,
          newVehicle: { registration: "AB12", make: "m", model: "m" },
        }),
        KEY,
      );
      expect(result).toEqual({ kind: "forbidden" });
    });

    it("D-0001-31: with a fixed technician the suggestions follow that technician", async () => {
      const { deps } = await setup(seed(2, 2));
      const first = await bookAppointment(
        customerActor("c1"),
        deps,
        bookRequest(),
        KEY,
      );
      expect(first).toMatchObject({
        kind: "ok",
        appointment: { technicianId: "t1" },
      });
      const pinned = await bookAppointment(
        staffActor(),
        deps,
        bookRequest({ customerId: "c2", vehicleId: "v2", technicianId: "t1" }),
        OTHER_KEY,
      );
      expect(pinned).toMatchObject({
        kind: "slot_unavailable",
        reasons: ["TECHNICIAN_BUSY"],
      });
      const { suggestions } = pinned as {
        suggestions: { start: number; end: number }[];
      };
      expect(suggestions.length).toBeGreaterThan(0);
      for (const { start, end } of suggestions) {
        // t1 works 10:00 to 11:00 and rests 15 minutes after it.
        expect(end <= at("10:00") - 15 * MIN || start >= at("11:15")).toBe(
          true,
        );
      }
    });

    it("REQ-BOOK-014.AC-4: a time taken while staff fill the form is slot_unavailable and no customer, vehicle or appointment is stored", async () => {
      const { deps, repo } = await setup(seed(1, 1));
      await bookAppointment(
        customerActor("c2"),
        deps,
        bookRequest({ vehicleId: "v2" }),
        OTHER_KEY,
      );
      const before = await dump(repo);
      const result = await bookAppointment(
        staffActor(),
        deps,
        newCustomerRequest(),
        KEY,
      );
      expect(result).toMatchObject({
        kind: "slot_unavailable",
        reasons: expect.any(Array),
        suggestions: expect.any(Array),
      });
      expect(await dump(repo)).toEqual(before);
    });

    it("REQ-BOOK-009.AC-4, REQ-BOOK-014.AC-2: a retry with a new customer and the same key leaves one customer, one vehicle and one appointment", async () => {
      const { deps, repo } = await setup();
      const first = await bookAppointment(
        staffActor(),
        deps,
        newCustomerRequest(),
        KEY,
      );
      const second = await bookAppointment(
        staffActor(),
        deps,
        newCustomerRequest(),
        KEY,
      );
      expect(second).toEqual({ ...first, replayed: true });
      const found = await repo.read((s) => s.customers.search("test person"));
      expect(found).toHaveLength(1);
      expect(found[0]?.vehicles).toHaveLength(1);
      expect(await appointmentsOf(repo)).toHaveLength(1);
    });

    it("D-0001-22 g: a possible duplicate customer is not refused", async () => {
      const { deps } = await setup();
      const result = await bookAppointment(
        staffActor(),
        deps,
        newCustomerRequest({
          newCustomer: { name: "Other Name", phone: "+44 7700 900111" },
        }),
        KEY,
      );
      expect(result.kind).toBe("ok");
    });

    it("unknown dealership or service type is not_found", async () => {
      const { deps } = await setup();
      expect(
        await bookAppointment(
          customerActor(),
          deps,
          bookRequest({ dealershipId: "nope" }),
          KEY,
        ),
      ).toEqual({ kind: "not_found" });
      expect(
        await bookAppointment(
          customerActor(),
          deps,
          bookRequest({ serviceTypeId: "nope" }),
          KEY,
        ),
      ).toEqual({ kind: "not_found" });
      expect(
        await bookAppointment(
          staffActor(),
          deps,
          bookRequest({ customerId: "nope" }),
          KEY,
        ),
      ).toEqual({ kind: "not_found" });
    });

    it("a fixed technician is honoured for staff (D-0001-20 B)", async () => {
      const { deps } = await setup();
      const result = await bookAppointment(
        staffActor(),
        deps,
        bookRequest({ customerId: "c1", technicianId: "t2" }),
        KEY,
      );
      expect(result).toMatchObject({
        kind: "ok",
        appointment: { technicianId: "t2" },
      });
    });

    it("section 7.7: logs and metrics", async () => {
      const { deps, repo, logger, metrics } = await setup(seed(1, 1));
      const ok = await bookAppointment(
        customerActor("c1"),
        deps,
        bookRequest(),
        KEY,
      );
      expect(ok.kind).toBe("ok");
      expect(logger.steps()).toEqual(["load", "check", "write"]);
      expect(metrics.counters).toContainEqual({
        name: "appointments_confirmed_total",
        labels: { dealershipId: "d1", actorRole: "customer" },
      });
      logger.calls.length = 0;
      metrics.counters.length = 0;
      const lost = await bookAppointment(
        customerActor("c2"),
        deps,
        bookRequest({ vehicleId: "v2" }),
        OTHER_KEY,
      );
      expect(lost.kind).toBe("slot_unavailable");
      expect(logger.steps()).toEqual(["load", "check", "suggest"]);
      expect(metrics.counters).toContainEqual({
        name: "appointment_conflicts_total",
        labels: { dealershipId: "d1", reason: "TECHNICIAN_BUSY" },
      });
      expect(metrics.count("availability_search_empty_total")).toBe(0);
      expect(metrics.observations.map((o) => o.name)).toContain(
        "availability_search_duration_ms",
      );
      expect(
        metrics.observations.filter((o) => o.labels.kind === "check").length,
      ).toBeGreaterThan(0);
      expect(await appointmentsOf(repo)).toHaveLength(1);
    });

    it("section 7.7: an empty search for other times raises availability_search_empty_total", async () => {
      // Only one hour of one day is open, and it is taken: nothing is left to suggest.
      const data = seed(1, 1);
      data.dealerships[0]!.weeklyHours = {};
      data.dealerships[0]!.dateOverrides = {
        [MONDAY]: { open: "10:00", close: "11:00" },
      };
      const { deps, metrics } = await setup(data);
      await bookAppointment(
        customerActor("c2"),
        deps,
        bookRequest({ vehicleId: "v2" }),
        OTHER_KEY,
      );
      const lost = await bookAppointment(
        customerActor("c1"),
        deps,
        bookRequest(),
        KEY,
      );
      expect(lost).toMatchObject({ kind: "slot_unavailable", suggestions: [] });
      expect(metrics.count("availability_search_empty_total")).toBe(1);
    });

    it("section 7.7: every log call holds allowed fields only and none of a customer's details", async () => {
      const { deps, logger } = await setup(seed(1, 1));
      await bookAppointment(staffActor(), deps, newCustomerRequest(), KEY);
      await bookAppointment(
        staffActor(),
        deps,
        newCustomerRequest({
          newCustomer: { name: "Test Person", phone: "bad" },
        }),
        OTHER_KEY,
      );
      const allowed = new Set([
        "traceId",
        "route",
        "method",
        "status",
        "durationMs",
        "dealershipId",
        "actorRole",
        "outcome",
        "code",
        "reasons",
        "appointmentId",
        "technicianId",
        "serviceBayId",
        "candidates",
      ]);
      const infos = logger.calls.flatMap((c) => (c.kind === "info" ? [c] : []));
      expect(infos.length).toBeGreaterThan(0);
      for (const call of infos) {
        for (const key of Object.keys(call.fields))
          expect(allowed.has(key)).toBe(true);
      }
      const text = JSON.stringify(logger.calls);
      for (const canary of [
        "Test Person",
        "+44 7700 900123",
        "t@example.com",
      ]) {
        expect(text).not.toContain(canary);
      }
    });
  });
}
