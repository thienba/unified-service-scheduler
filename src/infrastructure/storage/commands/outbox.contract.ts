// The outbox messages the commands queue, over a real store (plan ticket A7, REQ-BOOK-013, AD-13).
import { describe, expect, it } from "vitest";
import {
  adjustAppointment,
  bookAppointment,
  cancelAppointment,
  rescheduleAppointment,
} from "../../../application/commands";
import type {
  OutboxMessage,
  Repository,
  UnitOfWork,
} from "../../../application/ports";
import type { Appointment, SeedData } from "../../../domain/model";
import { messageLinks } from "../../../domain/outbox";
import {
  KEY,
  OTHER_KEY,
  at,
  bookRequest,
  customerActor,
  makeDeps,
  managerActor,
  newCustomerRequest,
  seed,
  seededRepo,
  staffActor,
} from "./fixtures";

/** The test dealerships are in London, where 2026-11-02 to 2026-11-05 is on GMT (UTC+0). */
const london = (techs = 2, bays = 2): SeedData => {
  const data = seed(techs, bays);
  return {
    ...data,
    dealerships: data.dealerships.map((d) => ({
      ...d,
      timeZone: "Europe/London",
    })),
  };
};

const NOV_2_NINE = at("09:00");
const NOV_3 = "2026-11-03";
const NOV_4 = "2026-11-04";
const NOV_5 = "2026-11-05";

export function describeOutboxContract(
  storeName: string,
  open: () => Promise<Repository>,
): void {
  async function setup(now = NOV_2_NINE, data = london()) {
    const repo = await seededRepo(open, data);
    return { repo, ...makeDeps(repo, now) };
  }
  type Ctx = Awaited<ReturnType<typeof setup>>;

  async function book(
    ctx: Ctx,
    start: number,
    key = KEY,
  ): Promise<Appointment> {
    const result = await bookAppointment(
      customerActor("c1"),
      ctx.deps,
      bookRequest({ start }),
      key,
    );
    if (result.kind !== "ok") throw new Error(`setup failed: ${result.kind}`);
    return result.appointment;
  }
  const rows = (repo: UnitOfWork, status?: OutboxMessage["status"]) =>
    repo.read((s) => s.outbox.list(status ? { status } : undefined));
  const summary = (list: OutboxMessage[]) =>
    list
      .map((m) => `${m.kind}:${m.status}:${m.dedupeKey.split(":")[2]}`)
      .sort();

  describe(`outbox messages over the ${storeName} store`, () => {
    it("REQ-BOOK-013.AC-1, Q-0001-21 A: booking on 2 November at 09:00 for 5 November at 10:00 queues a confirmation, a 48-hour reminder for 3 November 10:00 and a morning reminder for 5 November 08:00, each pending, with ids and links only", async () => {
      const ctx = await setup();
      const appt = await book(ctx, at("10:00", NOV_5));
      const list = await rows(ctx.repo);
      const byKind = Object.fromEntries(list.map((m) => [m.kind, m]));
      expect(list).toHaveLength(3);
      expect(byKind.confirmation).toMatchObject({
        appointmentId: appt.id,
        dueAt: NOV_2_NINE,
        status: "pending",
        dedupeKey: `${appt.id}:confirmation:1`,
      });
      expect(byKind.reminder_48h!.dueAt).toBe(at("10:00", NOV_3));
      expect(byKind.reminder_morning!.dueAt).toBe(at("08:00", NOV_5));
      expect(Object.keys(byKind.confirmation!).sort()).toEqual([
        "appointmentId",
        "dedupeKey",
        "dueAt",
        "id",
        "kind",
        "status",
      ]);
      // SEC-17.AC-2: the links are fixed paths and the appointment id, nothing else.
      expect(messageLinks(appt.id)).toEqual({
        cancel: `/appointments/${appt.id}/cancel`,
        reschedule: `/appointments/${appt.id}/reschedule`,
      });
    });

    it("Q-0001-21 A: a reminder whose time has passed is skipped (next day 10:00 keeps the morning one; same day 15:00 keeps only the confirmation)", async () => {
      const next = await setup();
      await book(next, at("10:00", NOV_3));
      expect(summary(await rows(next.repo))).toEqual([
        "confirmation:pending:1",
        "reminder_morning:pending:1",
      ]);

      const same = await setup();
      await book(same, at("15:00"));
      expect(summary(await rows(same.repo))).toEqual([
        "confirmation:pending:1",
      ]);
    });

    it("REQ-BOOK-013.AC-3, D-0001-50: a cancel marks the pending reminders cancelled, leaves the confirmation as it was, and queues a cancellation", async () => {
      const ctx = await setup();
      const appt = await book(ctx, at("10:00", NOV_5));
      const result = await cancelAppointment(
        customerActor("c1"),
        ctx.deps,
        appt.id,
      );
      expect(result.kind).toBe("ok");
      const list = await rows(ctx.repo);
      expect(summary(list)).toEqual([
        "cancellation:pending:2",
        "confirmation:pending:1",
        "reminder_48h:cancelled:1",
        "reminder_morning:cancelled:1",
      ]);
      // A second cancel changes nothing.
      await cancelAppointment(customerActor("c1"), ctx.deps, appt.id);
      expect(await rows(ctx.repo)).toEqual(list);
    });

    it("REQ-BOOK-013.AC-4, D-0001-17: a reschedule cancels the old reminders, queues a moved message and new reminders with the new version", async () => {
      const ctx = await setup();
      const appt = await book(ctx, at("10:00", NOV_5));
      const result = await rescheduleAppointment(
        customerActor("c1"),
        ctx.deps,
        appt.id,
        { start: at("11:00", "2026-11-09") },
        OTHER_KEY,
      );
      expect(result.kind).toBe("ok");
      const list = await rows(ctx.repo);
      expect(
        list.filter((m) => m.status === "pending" && m.kind.startsWith("rem")),
      ).toEqual([
        expect.objectContaining({
          kind: "reminder_48h",
          dedupeKey: `${appt.id}:reminder_48h:2`,
          dueAt: at("11:00", "2026-11-07"),
        }),
        expect.objectContaining({
          kind: "reminder_morning",
          dedupeKey: `${appt.id}:reminder_morning:2`,
          dueAt: at("08:00", "2026-11-09"),
        }),
      ]);
      expect(
        list
          .filter((m) => m.kind.startsWith("rem") && m.dedupeKey.endsWith(":1"))
          .map((m) => m.status),
      ).toEqual(["cancelled", "cancelled"]);
      // D-0001-50: the confirmation keeps its status.
      expect(summary(list)).toContain("confirmation:pending:1");
      expect(summary(list)).toContain("moved:pending:2");
    });

    it("REQ-BOOK-013.AC-5, AD-13: a booking and a reschedule retried with the same key queue the messages once", async () => {
      const ctx = await setup();
      const first = await book(ctx, at("10:00", NOV_5));
      await book(ctx, at("10:00", NOV_5));
      expect(await rows(ctx.repo)).toHaveLength(3);
      const move = () =>
        rescheduleAppointment(
          customerActor("c1"),
          ctx.deps,
          first.id,
          { start: at("11:00", "2026-11-09") },
          OTHER_KEY,
        );
      await move();
      const afterFirst = await rows(ctx.repo);
      await move();
      expect(await rows(ctx.repo)).toEqual(afterFirst);
    });

    it("AD-13 Check: a write unit that fails after the messages were prepared stores no message", async () => {
      const ctx = await setup();
      const failing: UnitOfWork = {
        read: (work) => ctx.repo.read(work),
        write: (work) =>
          ctx.repo.write((stores) =>
            work({
              ...stores,
              idempotency: {
                ...stores.idempotency,
                put: () => Promise.reject(new Error("store failed")),
              },
            }),
          ),
      };
      await expect(
        bookAppointment(
          customerActor("c1"),
          { ...ctx.deps, uow: failing },
          bookRequest({ start: at("10:00", NOV_5) }),
          KEY,
        ),
      ).rejects.toThrow("store failed");
      expect(await rows(ctx.repo)).toEqual([]);
    });

    it("SEC-17.AC-1, SEC-10: a booking for a new customer leaves no name, phone, email or registration in any row", async () => {
      const ctx = await setup();
      const result = await bookAppointment(
        staffActor(),
        ctx.deps,
        newCustomerRequest({
          start: at("10:00", NOV_5),
          newCustomer: {
            name: "Zz Canary Name",
            phone: "+0 000 0000",
            email: "canary@example.invalid",
          },
          newVehicle: { registration: "ZZ00 CNR", make: "Make", model: "M" },
        }),
        KEY,
      );
      expect(result.kind).toBe("ok");
      const list = await rows(ctx.repo);
      expect(list).toHaveLength(3);
      const text = JSON.stringify(list);
      for (const canary of [
        "Zz Canary Name",
        "+0 000 0000",
        "canary@example.invalid",
        "ZZ00 CNR",
        "ZZ00CNR",
      ]) {
        expect(text).not.toContain(canary);
      }
    });

    it("AD-13: a book, cancel or reschedule that is refused adds no message", async () => {
      const ctx = await setup(NOV_2_NINE, london(1, 1));
      const appt = await book(ctx, at("10:00", NOV_5));
      const other = await book(ctx, at("10:00", NOV_4), OTHER_KEY);
      const before = await rows(ctx.repo);

      // Conflict: the same technician and bay are busy (one technician and bay are enough here).
      const clash = await rescheduleAppointment(
        managerActor(),
        ctx.deps,
        appt.id,
        { start: at("10:00", NOV_4) },
        "key-clash",
      );
      // Forbidden: staff cannot cancel or reschedule; another customer's appointment is not found.
      const forbidden = await cancelAppointment(
        staffActor(),
        ctx.deps,
        other.id,
      );
      const notMine = await cancelAppointment(
        customerActor("c2"),
        ctx.deps,
        other.id,
      );
      const refusedBook = await bookAppointment(
        staffActor(["d2"]),
        ctx.deps,
        bookRequest({ customerId: "c1" }),
        "key-forbidden",
      );
      expect([
        clash.kind,
        forbidden.kind,
        notMine.kind,
        refusedBook.kind,
      ]).toEqual(["slot_unavailable", "forbidden", "not_found", "forbidden"]);
      expect(await rows(ctx.repo)).toEqual(before);
    });

    it("AD-13: a customer past the change window is refused and nothing is queued", async () => {
      const ctx = await setup();
      const appt = await book(ctx, at("10:00", NOV_3));
      const before = await rows(ctx.repo);
      ctx.clock.set(at("09:00", NOV_3));
      const cancel = await cancelAppointment(
        customerActor("c1"),
        ctx.deps,
        appt.id,
      );
      const move = await rescheduleAppointment(
        customerActor("c1"),
        ctx.deps,
        appt.id,
        { start: at("11:00", NOV_4) },
        OTHER_KEY,
      );
      expect([cancel.kind, move.kind]).toEqual([
        "change_window_closed",
        "change_window_closed",
      ]);
      expect(await rows(ctx.repo)).toEqual(before);
    });

    it("D-0001-17, Q-0001-123 g: a manager's move to a new time replaces the reminders and queues a moved message; a move that changes only the technician, or nothing, queues nothing", async () => {
      const ctx = await setup();
      const appt = await book(ctx, at("10:00", NOV_5));
      const manager = managerActor();
      const base = await rows(ctx.repo);

      await adjustAppointment(manager, ctx.deps, appt.id, {
        technicianId: "t2",
      });
      await adjustAppointment(manager, ctx.deps, appt.id, {
        start: at("10:00", NOV_5),
      });
      expect(await rows(ctx.repo)).toEqual(base);

      const result = await adjustAppointment(manager, ctx.deps, appt.id, {
        start: at("12:00", NOV_5),
      });
      expect(result.kind).toBe("ok");
      const version = (result as { appointment: Appointment }).appointment
        .version;
      const pending = (await rows(ctx.repo, "pending")).filter((m) =>
        m.dedupeKey.endsWith(`:${version}`),
      );
      expect(pending.map((m) => m.kind).sort()).toEqual([
        "moved",
        "reminder_48h",
        "reminder_morning",
      ]);
      expect(
        (await rows(ctx.repo))
          .filter((m) => m.kind.startsWith("rem") && m.dedupeKey.includes(":1"))
          .map((m) => m.status),
      ).toEqual(["cancelled", "cancelled"]);
      // D-0001-50: the confirmation keeps its status.
      expect(summary(await rows(ctx.repo))).toContain("confirmation:pending:1");

      // A second move: the earlier "moved" message keeps its status too.
      const second = await adjustAppointment(manager, ctx.deps, appt.id, {
        start: at("13:00", NOV_5),
      });
      expect(second.kind).toBe("ok");
      const after = summary(await rows(ctx.repo));
      expect(after).toContain(`moved:pending:${version}`);
      expect(after).toContain("confirmation:pending:1");
    });
  });
}
