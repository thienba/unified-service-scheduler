// cancelAppointment and rescheduleAppointment over a real store (plan ticket A5).
import { describe, expect, it } from "vitest";
import {
  bookAppointment,
  cancelAppointment,
  rescheduleAppointment,
} from "../../../application/commands";
import type { Repository } from "../../../application/ports";
import type { Appointment } from "../../../domain/model";
import {
  KEY,
  MIN,
  OTHER_KEY,
  appointmentsOf,
  at,
  bookRequest,
  customerActor,
  dump,
  makeDeps,
  managerActor,
  seed,
  seededRepo,
  spyOnStore,
  staffActor,
} from "./fixtures";

export function describeChangeContract(
  storeName: string,
  open: () => Promise<Repository>,
): void {
  async function setup(data = seed(1, 1)) {
    const repo = await seededRepo(open, data);
    return { repo, ...makeDeps(repo) };
  }
  /** Customer c1 books 14:00 (or the given start); the appointment must be ok. */
  async function booked(
    ctx: Awaited<ReturnType<typeof setup>>,
    overrides = {},
  ): Promise<Appointment> {
    const result = await bookAppointment(
      customerActor("c1"),
      ctx.deps,
      bookRequest({ start: at("14:00"), ...overrides }),
      OTHER_KEY,
    );
    if (result.kind !== "ok") throw new Error(`setup failed: ${result.kind}`);
    return result.appointment;
  }
  const stored = (repo: Repository, id: string) =>
    repo.read((s) => s.appointments.get(id));

  describe(`cancelAppointment over the ${storeName} store`, () => {
    it("REQ-BOOK-012.AC-1: a customer cancels before the cutoff; status, cancelledAt and version change, and the resources can be booked again", async () => {
      const ctx = await setup();
      const appt = await booked(ctx, { transport: "courtesy_car" });
      const blocked = await bookAppointment(
        customerActor("c2"),
        ctx.deps,
        bookRequest({
          vehicleId: "v2",
          start: at("14:00"),
          transport: "courtesy_car",
        }),
        KEY,
      );
      expect(blocked.kind).toBe("slot_unavailable");
      ctx.clock.set(at("09:00"));
      const result = await cancelAppointment(
        customerActor("c1"),
        ctx.deps,
        appt.id,
      );
      expect(result).toMatchObject({
        kind: "ok",
        appointment: {
          status: "cancelled",
          cancelledAt: at("09:00"),
          version: 2,
        },
      });
      expect(await stored(ctx.repo, appt.id)).toEqual(
        (result as { appointment: Appointment }).appointment,
      );
      const again = await bookAppointment(
        customerActor("c2"),
        ctx.deps,
        bookRequest({
          vehicleId: "v2",
          start: at("14:00"),
          transport: "courtesy_car",
        }),
        KEY,
      );
      expect(again).toMatchObject({
        kind: "ok",
        appointment: {
          technicianId: "t1",
          serviceBayId: "bay1",
          courtesyCarId: "car1",
        },
      });
    });

    it("architecture 7.3: a second cancel returns the same cancelled appointment and does not count again", async () => {
      const ctx = await setup();
      const appt = await booked(ctx);
      const first = await cancelAppointment(
        customerActor("c1"),
        ctx.deps,
        appt.id,
      );
      const second = await cancelAppointment(
        customerActor("c1"),
        ctx.deps,
        appt.id,
      );
      expect(second).toEqual(first);
      expect(ctx.metrics.count("appointments_cancelled_total")).toBe(1);
      expect(ctx.metrics.counters).toContainEqual({
        name: "appointments_cancelled_total",
        labels: { dealershipId: "d1", actorRole: "customer" },
      });
    });

    it("REQ-BOOK-012.AC-4, Q-0001-20 A: with a 2-hour lead time and a 14:00 appointment, 12:00 is accepted, a millisecond later is change_window_closed, and a manager is not limited", async () => {
      const exact = await setup();
      const a = await booked(exact);
      exact.clock.set(at("12:00"));
      expect(
        (await cancelAppointment(customerActor("c1"), exact.deps, a.id)).kind,
      ).toBe("ok");

      const late = await setup();
      const b = await booked(late);
      late.clock.set(at("12:00") + 1);
      expect(
        await cancelAppointment(customerActor("c1"), late.deps, b.id),
      ).toEqual({ kind: "change_window_closed" });
      expect(await stored(late.repo, b.id)).toEqual(b);
      const byManager = await cancelAppointment(
        managerActor(),
        late.deps,
        b.id,
      );
      expect(byManager).toMatchObject({
        kind: "ok",
        appointment: { status: "cancelled" },
      });
      expect(late.metrics.counters).toContainEqual({
        name: "appointments_cancelled_total",
        labels: { dealershipId: "d1", actorRole: "manager" },
      });
    });

    it("REQ-BOOK-012.AC-5, SEC-5.AC-2: another customer's appointment is not_found, also past the cutoff, and nothing changes", async () => {
      const ctx = await setup();
      const appt = await booked(ctx);
      const before = await dump(ctx.repo);
      expect(
        await cancelAppointment(customerActor("c2"), ctx.deps, appt.id),
      ).toEqual({ kind: "not_found" });
      ctx.clock.set(at("13:00"));
      expect(
        await cancelAppointment(customerActor("c2"), ctx.deps, appt.id),
      ).toEqual({ kind: "not_found" });
      expect(
        await cancelAppointment(customerActor("c2"), ctx.deps, "no-such-id"),
      ).toEqual({ kind: "not_found" });
      expect(await dump(ctx.repo)).toEqual(before);
    });

    it("SEC-4.AC-4: a manager of another dealership gets not_found for this appointment", async () => {
      const ctx = await setup();
      const appt = await booked(ctx);
      const result = await cancelAppointment(
        managerActor(["d2"]),
        ctx.deps,
        appt.id,
      );
      expect(result).toEqual({ kind: "not_found" });
      expect((await stored(ctx.repo, appt.id))?.status).toBe("confirmed");
    });

    it("REQ-BOOK-005.AC-3, D-0001-19: staff cannot cancel, and no store is read", async () => {
      const ctx = await setup();
      const appt = await booked(ctx);
      const before = await dump(ctx.repo);
      const { uow, calls } = spyOnStore(ctx.repo);
      expect(
        await cancelAppointment(staffActor(), { ...ctx.deps, uow }, appt.id),
      ).toEqual({ kind: "forbidden" });
      expect(calls).toEqual([]);
      expect(await dump(ctx.repo)).toEqual(before);
    });

    it("section 7.7: a cancel reports its steps load and write", async () => {
      const ctx = await setup();
      const appt = await booked(ctx);
      ctx.logger.calls.length = 0;
      await cancelAppointment(customerActor("c1"), ctx.deps, appt.id);
      expect(ctx.logger.steps()).toEqual(["load", "write"]);
    });
  });

  describe(`rescheduleAppointment over the ${storeName} store`, () => {
    it("REQ-BOOK-012.AC-2: the same appointment gets the new time and version + 1, and the old time is free only after that", async () => {
      const ctx = await setup();
      const appt = await booked(ctx);
      const wantOld = () =>
        bookAppointment(
          customerActor("c2"),
          ctx.deps,
          bookRequest({ vehicleId: "v2", start: at("14:00") }),
          KEY,
        );
      expect((await wantOld()).kind).toBe("slot_unavailable");
      const result = await rescheduleAppointment(
        customerActor("c1"),
        ctx.deps,
        appt.id,
        { start: at("16:00") },
        KEY,
      );
      expect(result).toMatchObject({
        kind: "ok",
        appointment: {
          id: appt.id,
          start: at("16:00"),
          end: at("17:00"),
          version: 2,
          flags: [],
        },
      });
      expect(await appointmentsOf(ctx.repo)).toHaveLength(1);
      expect((await wantOld()).kind).toBe("ok");
    });

    it("AD-4: a reschedule 15 minutes later that overlaps its own old time succeeds", async () => {
      const ctx = await setup();
      const appt = await booked(ctx);
      const result = await rescheduleAppointment(
        customerActor("c1"),
        ctx.deps,
        appt.id,
        { start: at("14:15") },
        KEY,
      );
      expect(result).toMatchObject({
        kind: "ok",
        appointment: { start: at("14:15"), version: 2 },
      });
    });

    it("REQ-BOOK-012.AC-3: a time someone else takes first is slot_unavailable with reasons and suggestions, and the original is unchanged", async () => {
      const ctx = await setup();
      const appt = await booked(ctx);
      await bookAppointment(
        customerActor("c2"),
        ctx.deps,
        bookRequest({ vehicleId: "v2", start: at("16:00") }),
        KEY,
      );
      const result = await rescheduleAppointment(
        customerActor("c1"),
        ctx.deps,
        appt.id,
        { start: at("16:00") },
        "55555555-5555-4555-8555-555555555555",
      );
      expect(result).toMatchObject({
        kind: "slot_unavailable",
        reasons: expect.arrayContaining(["TECHNICIAN_BUSY"]),
        suggestions: expect.any(Array),
      });
      expect(
        (result as { suggestions: unknown[] }).suggestions.length,
      ).toBeGreaterThan(0);
      expect(await stored(ctx.repo, appt.id)).toEqual(appt);
    });

    it("REQ-BOOK-012.AC-4, AC-5: after the cutoff a customer gets change_window_closed, another customer's appointment is not_found, and a manager may still move it", async () => {
      const ctx = await setup();
      const appt = await booked(ctx);
      ctx.clock.set(at("12:00") + 1);
      expect(
        await rescheduleAppointment(
          customerActor("c1"),
          ctx.deps,
          appt.id,
          { start: at("16:00") },
          KEY,
        ),
      ).toEqual({ kind: "change_window_closed" });
      expect(
        await rescheduleAppointment(
          customerActor("c2"),
          ctx.deps,
          appt.id,
          { start: at("16:00") },
          KEY,
        ),
      ).toEqual({ kind: "not_found" });
      expect(
        await rescheduleAppointment(
          managerActor(["d2"]),
          ctx.deps,
          appt.id,
          { start: at("16:00") },
          KEY,
        ),
      ).toEqual({ kind: "not_found" });
      expect(await stored(ctx.repo, appt.id)).toEqual(appt);
      const byManager = await rescheduleAppointment(
        managerActor(),
        ctx.deps,
        appt.id,
        { start: at("16:00") },
        KEY,
      );
      expect(byManager).toMatchObject({
        kind: "ok",
        appointment: { start: at("16:00") },
      });
    });

    it("AD-5: the same key twice gives one change, and a replay is counted", async () => {
      const ctx = await setup();
      const appt = await booked(ctx);
      const first = await rescheduleAppointment(
        customerActor("c1"),
        ctx.deps,
        appt.id,
        { start: at("16:00") },
        KEY,
      );
      const second = await rescheduleAppointment(
        customerActor("c1"),
        ctx.deps,
        appt.id,
        { start: at("16:00") },
        KEY,
      );
      expect(second).toEqual(first);
      expect((await stored(ctx.repo, appt.id))?.version).toBe(2);
      expect(ctx.metrics.counters).toContainEqual({
        name: "idempotent_replays_total",
        labels: { route: "POST /appointments/{id}/reschedule" },
      });
      expect(
        await rescheduleAppointment(
          customerActor("c1"),
          ctx.deps,
          appt.id,
          { start: at("15:00") },
          KEY,
        ),
      ).toEqual({ kind: "idempotency_key_reused" });
      expect(
        await rescheduleAppointment(
          customerActor("c1"),
          ctx.deps,
          appt.id,
          { start: at("15:00") },
          undefined,
        ),
      ).toEqual({ kind: "idempotency_key_missing" });
    });

    it("AD-14: a reschedule clears the flags of the appointment", async () => {
      const ctx = await setup();
      const appt = await booked(ctx);
      await ctx.repo.write(async (s) => {
        await s.appointments.update({
          ...appt,
          flags: [{ kind: "outside_shift", since: 1 }],
        });
        return { ok: true, value: undefined };
      });
      const result = await rescheduleAppointment(
        customerActor("c1"),
        ctx.deps,
        appt.id,
        { start: at("16:00") },
        KEY,
      );
      expect(result).toMatchObject({ kind: "ok", appointment: { flags: [] } });
    });

    it("staff cannot reschedule, a missing start is validation_failed, and a cancelled appointment is already_cancelled, but not_found for someone else", async () => {
      const ctx = await setup();
      const appt = await booked(ctx);
      const before = await dump(ctx.repo);
      expect(
        await rescheduleAppointment(
          staffActor(),
          ctx.deps,
          appt.id,
          { start: at("16:00") },
          KEY,
        ),
      ).toEqual({ kind: "forbidden" });
      expect(
        await rescheduleAppointment(
          customerActor("c1"),
          ctx.deps,
          appt.id,
          {},
          KEY,
        ),
      ).toMatchObject({
        kind: "validation_failed",
        errors: [{ field: "start" }],
      });
      expect(await dump(ctx.repo)).toEqual(before);
      await cancelAppointment(customerActor("c1"), ctx.deps, appt.id);
      expect(
        await rescheduleAppointment(
          customerActor("c1"),
          ctx.deps,
          appt.id,
          { start: at("16:00") },
          KEY,
        ),
      ).toEqual({ kind: "already_cancelled" });
      // The owner check still comes first (D-0001-39).
      expect(
        await rescheduleAppointment(
          customerActor("c2"),
          ctx.deps,
          appt.id,
          { start: at("16:00") },
          OTHER_KEY,
        ),
      ).toEqual({ kind: "not_found" });
    });

    it("a reschedule into the lead time is slot_unavailable (TOO_SOON)", async () => {
      const ctx = await setup();
      const appt = await booked(ctx);
      ctx.clock.set(at("10:00") - 30 * MIN);
      const result = await rescheduleAppointment(
        customerActor("c1"),
        ctx.deps,
        appt.id,
        { start: at("10:30") },
        KEY,
      );
      expect(result).toMatchObject({
        kind: "slot_unavailable",
        reasons: ["TOO_SOON"],
      });
    });
  });
}
