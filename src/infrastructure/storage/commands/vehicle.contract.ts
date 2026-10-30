// One car, one appointment at a time (D-0001-146): book, reschedule and adjust over a real store.
import { describe, expect, it } from "vitest";
import {
  adjustAppointment,
  bookAppointment,
  cancelAppointment,
  rescheduleAppointment,
  type CommandResult,
} from "../../../application/commands";
import type { Repository } from "../../../application/ports";
import {
  KEY,
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
} from "./fixtures";

export function describeVehicleContract(
  storeName: string,
  open: () => Promise<Repository>,
): void {
  async function setup() {
    const repo = await seededRepo(open, seed(2, 2));
    return { repo, ...makeDeps(repo) };
  }
  type Ctx = Awaited<ReturnType<typeof setup>>;

  let keys = 0;
  const key = () =>
    `00000000-0000-4000-8000-${String(++keys).padStart(12, "0")}`;
  const owner = customerActor("c1");

  /** Car v1 books; the answer must be ok. */
  async function bookCar(ctx: Ctx, time: string, dealershipId = "d1") {
    const result = await bookAppointment(
      owner,
      ctx.deps,
      bookRequest({ start: at(time), dealershipId }),
      key(),
    );
    if (result.kind !== "ok") throw new Error(`setup failed: ${result.kind}`);
    return result.appointment;
  }
  const tryBook = (ctx: Ctx, time: string, dealershipId = "d1") =>
    bookAppointment(
      owner,
      ctx.deps,
      bookRequest({ start: at(time), dealershipId }),
      key(),
    );
  const busyWords = {
    kind: "slot_unavailable",
    reasons: ["VEHICLE_BUSY"],
  } as const;
  /** No suggested time overlaps the car's busy hour from 10:00 to 11:00. */
  const leavesOutBusy = (result: unknown) => {
    const { suggestions } = result as Extract<
      CommandResult,
      { kind: "slot_unavailable" }
    >;
    expect(suggestions.length).toBeGreaterThan(0);
    for (const s of suggestions) {
      expect(s.start < at("11:00") && at("10:00") < s.end).toBe(false);
    }
  };

  describe(`one car, one appointment over the ${storeName} store`, () => {
    it("book: an overlap at the same dealership is VEHICLE_BUSY with times that leave out the busy time, and stores nothing", async () => {
      const ctx = await setup();
      await bookCar(ctx, "10:00");
      const before = await dump(ctx.repo, [owner]);
      const result = await tryBook(ctx, "10:30");
      expect(result).toMatchObject(busyWords);
      leavesOutBusy(result);
      expect(await dump(ctx.repo, [owner])).toEqual(before);
    });

    it("book: an overlap at the other dealership is VEHICLE_BUSY too", async () => {
      const ctx = await setup();
      await bookCar(ctx, "10:00");
      const result = await tryBook(ctx, "10:30", "d2");
      expect(result).toMatchObject(busyWords);
      leavesOutBusy(result);
      expect(await appointmentsOf(ctx.repo)).toHaveLength(1);
    });

    it("book: touching times do not clash, and no rest break applies to a car", async () => {
      const ctx = await setup();
      await bookCar(ctx, "10:00");
      expect(await tryBook(ctx, "11:00", "d2")).toMatchObject({ kind: "ok" });
      expect(await tryBook(ctx, "09:00", "d2")).toMatchObject({ kind: "ok" });
    });

    it("book: a cancelled appointment does not block", async () => {
      const ctx = await setup();
      const first = await bookCar(ctx, "10:00");
      await cancelAppointment(managerActor(), ctx.deps, first.id);
      expect(await tryBook(ctx, "10:30")).toMatchObject({ kind: "ok" });
    });

    it("book: another car at the same time is not blocked", async () => {
      const ctx = await setup();
      await bookCar(ctx, "10:00");
      const other = await bookAppointment(
        customerActor("c2"),
        ctx.deps,
        bookRequest({ vehicleId: "v2", start: at("10:30") }),
        OTHER_KEY,
      );
      expect(other).toMatchObject({ kind: "ok" });
    });

    it("book: a new car has no appointments, so it needs no check", async () => {
      const ctx = await setup();
      await bookCar(ctx, "10:00");
      const result = await bookAppointment(
        managerActor(["d1"]),
        ctx.deps,
        {
          ...bookRequest({ start: at("10:00") }),
          vehicleId: undefined,
          customerId: "c1",
          newVehicle: { registration: "NEW1 CAR", make: "Make", model: "M" },
        },
        KEY,
      );
      expect(result).toMatchObject({ kind: "ok" });
    });

    it("reschedule: a move onto another appointment of the car is VEHICLE_BUSY; a move across its own time is fine", async () => {
      const ctx = await setup();
      const first = await bookCar(ctx, "10:00");
      const second = await bookCar(ctx, "13:00", "d2");
      const clash = await rescheduleAppointment(
        owner,
        ctx.deps,
        second.id,
        { start: at("10:30") },
        key(),
      );
      expect(clash).toMatchObject(busyWords);
      leavesOutBusy(clash);
      const self = await rescheduleAppointment(
        owner,
        ctx.deps,
        first.id,
        { start: at("10:30") },
        key(),
      );
      expect(self).toMatchObject({ kind: "ok" });
      const stored = await ctx.repo.read((s) => s.appointments.get(second.id));
      expect(stored?.start).toBe(at("13:00"));
    });

    it("adjust: a manager's move onto another appointment of the car is VEHICLE_BUSY; the appointment does not block itself", async () => {
      const ctx = await setup();
      const first = await bookCar(ctx, "10:00");
      const second = await bookCar(ctx, "13:00");
      const manager = managerActor(["d1"]);
      const clash = await adjustAppointment(manager, ctx.deps, second.id, {
        start: at("10:30"),
      });
      expect(clash).toMatchObject(busyWords);
      leavesOutBusy(clash);
      const self = await adjustAppointment(manager, ctx.deps, first.id, {
        start: at("10:30"),
      });
      expect(self).toMatchObject({ kind: "ok" });
    });

    it("two confirms together for the same car at two dealerships give one ok and one VEHICLE_BUSY", async () => {
      const ctx = await setup();
      const results = await Promise.all([
        tryBook(ctx, "10:00", "d1"),
        tryBook(ctx, "10:00", "d2"),
      ]);
      expect(results.map((r) => r.kind).sort()).toEqual([
        "ok",
        "slot_unavailable",
      ]);
      expect(results.find((r) => r.kind === "slot_unavailable")).toMatchObject(
        busyWords,
      );
    });
  });
}
