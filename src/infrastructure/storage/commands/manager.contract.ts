// adjustAppointment, updateDealershipSettings and updateTechnicianShifts over a real store (plan
// ticket A5, second half). Each store runs the same tests (AD-8).
import { describe, expect, it } from "vitest";
import {
  adjustAppointment,
  bookAppointment,
  cancelAppointment,
  updateDealershipSettings,
  updateTechnicianShifts,
  type SettingsRequest,
  type ShiftsRequest,
} from "../../../application/commands";
import { loadSnapshot } from "../../../application/load-snapshot";
import type { Repository, UnitOfWork } from "../../../application/ports";
import { checkStart } from "../../../domain/availability";
import type {
  Appointment,
  Dealership,
  SeedData,
  Shift,
} from "../../../domain/model";
import {
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

const TUESDAY = "2026-11-03";
const hours = (open: string, close: string) => ({ open, close });
/** Technicians work 08:00 to 20:00, so only the opening hours decide what fits. */
function wideShifts(data: SeedData): SeedData {
  const shift: Shift = { start: "08:00", end: "20:00" };
  return {
    ...data,
    technicians: data.technicians.map((t) => ({
      ...t,
      shiftPattern: { 1: shift, 2: shift, 3: shift, 4: shift, 5: shift },
    })),
  };
}

const settingsOf = (
  d: Dealership,
  change: Partial<SettingsRequest> = {},
): SettingsRequest => ({
  weeklyHours: d.weeklyHours,
  dateOverrides: d.dateOverrides,
  policies: {
    leadTimeMinutes: d.policies.leadTimeMinutes,
    horizonDays: d.policies.horizonDays,
    breakMinutes: d.policies.breakMinutes,
  },
  ...change,
});

const ALLOWED_LOG_FIELDS = [
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
];

export function describeManagerContract(
  storeName: string,
  open: () => Promise<Repository>,
): void {
  async function setup(data: SeedData = seed(1, 1)) {
    const repo = await seededRepo(open, data);
    return { repo, ...makeDeps(repo) };
  }
  type Ctx = Awaited<ReturnType<typeof setup>>;

  let keyCount = 0;
  /** A customer books; the appointment must be ok. */
  async function book(
    ctx: Ctx,
    time: string,
    overrides: Parameters<typeof bookRequest>[0] = {},
    date = TUESDAY,
    actor = customerActor("c1"),
  ): Promise<Appointment> {
    const result = await bookAppointment(
      actor,
      ctx.deps,
      bookRequest({ start: at(time, date), ...overrides }),
      `key-${++keyCount}`,
    );
    if (result.kind !== "ok") throw new Error(`setup failed: ${result.kind}`);
    return result.appointment;
  }
  const get = (repo: UnitOfWork, id: string) =>
    repo.read((s) => s.appointments.get(id));
  const dealership = (repo: UnitOfWork, id = "d1") =>
    repo.read((s) => s.scheduling.getDealership(id));
  const technician = async (repo: UnitOfWork, id = "t1") =>
    (await repo.read((s) => s.scheduling.listTechnicians("d1"))).find(
      (t) => t.id === id,
    )!;
  /** Everything a manager command could change. */
  const world = async (repo: UnitOfWork) => ({
    ...(await dump(repo)),
    dealerships: await Promise.all(
      ["d1", "d2"].map((id) => dealership(repo, id)),
    ),
    technicians: await repo.read(async (s) => [
      ...(await s.scheduling.listTechnicians("d1")),
      ...(await s.scheduling.listTechnicians("d2")),
    ]),
  });
  const flagKinds = (a: Appointment) => a.flags.map((f) => f.kind);

  describe(`adjustAppointment over the ${storeName} store`, () => {
    it("REQ-BOOK-005.AC-1: a move to a free time updates start, end and version, and the day's schedule shows it", async () => {
      const ctx = await setup();
      const appt = await book(ctx, "14:00");
      const result = await adjustAppointment(
        managerActor(),
        ctx.deps,
        appt.id,
        {
          start: at("16:00", TUESDAY),
        },
      );
      expect(result).toMatchObject({
        kind: "ok",
        appointment: {
          id: appt.id,
          start: at("16:00", TUESDAY),
          end: at("17:00", TUESDAY),
          version: 2,
        },
        picked: {},
      });
      const day = await ctx.repo.read((s) =>
        s.appointments.listByDealershipDay(
          "d1",
          at("00:00", TUESDAY),
          at("00:00", "2026-11-04"),
        ),
      );
      expect(day.map((a) => a.start)).toEqual([at("16:00", TUESDAY)]);
    });

    it("REQ-BOOK-005.AC-2: a clashing time is slot_unavailable with reasons and suggestions, and the appointment is unchanged", async () => {
      const ctx = await setup();
      const appt = await book(ctx, "14:00");
      await book(
        ctx,
        "16:00",
        { vehicleId: "v2" },
        TUESDAY,
        customerActor("c2"),
      );
      const result = await adjustAdjustOnly(ctx, appt.id, {
        start: at("16:00", TUESDAY),
      });
      expect(result).toMatchObject({
        kind: "slot_unavailable",
        reasons: expect.arrayContaining(["TECHNICIAN_BUSY"]),
        suggestions: expect.any(Array),
      });
      expect(
        (result as { suggestions: unknown[] }).suggestions.length,
      ).toBeGreaterThan(0);
      expect(await get(ctx.repo, appt.id)).toEqual(appt);
      expect(ctx.metrics.count("appointment_conflicts_total")).toBe(1);
    });

    function adjustAdjustOnly(
      ctx: Ctx,
      id: string,
      request: Parameters<typeof adjustAppointment>[3],
    ) {
      return adjustAppointment(managerActor(), ctx.deps, id, request);
    }

    it("Q-0001-7 A: a named free technician or bay is stored; a busy one gives slot_unavailable and changes nothing", async () => {
      const ctx = await setup(seed(2, 2));
      const appt = await book(ctx, "14:00");
      expect(appt).toMatchObject({ technicianId: "t1", serviceBayId: "bay1" });
      const other = await book(
        ctx,
        "14:00",
        { vehicleId: "v2" },
        TUESDAY,
        customerActor("c2"),
      );
      expect(other).toMatchObject({ technicianId: "t2", serviceBayId: "bay2" });

      for (const request of [
        { technicianId: "t2" },
        { serviceBayId: "bay2" },
      ]) {
        const refused = await adjustAdjustOnly(ctx, appt.id, request);
        expect(refused).toMatchObject({ kind: "slot_unavailable" });
        expect(await get(ctx.repo, appt.id)).toEqual(appt);
      }
      await cancelAppointment(managerActor(), ctx.deps, other.id);
      expect(
        await adjustAdjustOnly(ctx, appt.id, { technicianId: "t2" }),
      ).toMatchObject({
        kind: "ok",
        appointment: { technicianId: "t2", serviceBayId: "bay1", version: 2 },
        picked: {},
      });
      expect(
        await adjustAdjustOnly(ctx, appt.id, { serviceBayId: "bay2" }),
      ).toMatchObject({
        kind: "ok",
        appointment: { technicianId: "t2", serviceBayId: "bay2", version: 3 },
      });
    });

    it("Q-0001-7 A: an off-shift, unqualified or other-dealership technician is slot_unavailable and nothing changes", async () => {
      const data = seed(2, 2);
      data.technicians[1]!.skills = ["tyres"];
      data.technicians.push({
        ...data.technicians[0]!,
        id: "t3",
        name: "Tech t3",
        shiftExceptions: { [TUESDAY]: { kind: "leave" } },
      });
      const ctx = await setup(data);
      const appt = await book(ctx, "14:00");
      for (const technicianId of ["t2", "t3", "t9"]) {
        const result = await adjustAdjustOnly(ctx, appt.id, { technicianId });
        expect(result).toMatchObject({
          kind: "slot_unavailable",
          reasons: ["NO_QUALIFIED_TECHNICIAN_ON_SHIFT"],
        });
      }
      expect(
        await adjustAdjustOnly(ctx, appt.id, { serviceBayId: "bay9" }),
      ).toMatchObject({ kind: "slot_unavailable", reasons: ["BAY_BUSY"] });
      expect(await get(ctx.repo, appt.id)).toEqual(appt);
    });

    it("D-0001-33: a move that leaves the technician or bay busy picks another free one by the booking rule and says who", async () => {
      const ctx = await setup(seed(2, 2));
      const appt = await book(ctx, "14:00");
      await book(
        ctx,
        "16:00",
        { technicianId: "t1", customerId: "c2", vehicleId: "v2" },
        TUESDAY,
        managerActor(),
      );
      const result = await adjustAdjustOnly(ctx, appt.id, {
        start: at("16:00", TUESDAY),
      });
      expect(result).toMatchObject({
        kind: "ok",
        appointment: { technicianId: "t2", serviceBayId: "bay2" },
        picked: { technicianId: "t2", serviceBayId: "bay2" },
      });
      // Free again at 12:00: both are kept and nothing is picked.
      const back = await adjustAdjustOnly(ctx, appt.id, {
        start: at("12:00", TUESDAY),
      });
      expect(back).toMatchObject({
        kind: "ok",
        appointment: { technicianId: "t2", serviceBayId: "bay2" },
        picked: {},
      });
    });

    it("AD-14 Check: moving a flagged appointment to a time that fits clears its flags", async () => {
      const ctx = await setup();
      const appt = await book(ctx, "14:00");
      await ctx.repo.write(async (s) => {
        await s.appointments.update({
          ...appt,
          flags: [{ kind: "outside_shift", since: 1 }],
        });
        return { ok: true, value: undefined };
      });
      const result = await adjustAdjustOnly(ctx, appt.id, {
        start: at("15:00", TUESDAY),
      });
      expect(result).toMatchObject({ kind: "ok", appointment: { flags: [] } });
    });

    it("REQ-BOOK-005.AC-3: a customer or staff member gets forbidden and no store is read", async () => {
      const ctx = await setup();
      const appt = await book(ctx, "14:00");
      const before = await world(ctx.repo);
      for (const actor of [customerActor("c1"), staffActor()]) {
        const { uow, calls } = spyOnStore(ctx.repo);
        expect(
          await adjustAppointment(actor, { ...ctx.deps, uow }, appt.id, {
            start: at("16:00", TUESDAY),
          }),
        ).toEqual({ kind: "forbidden" });
        expect(calls).toEqual([]);
      }
      expect(await world(ctx.repo)).toEqual(before);
    });

    it("SEC-4.AC-4: a manager of another dealership gets not_found and the version is unchanged", async () => {
      const ctx = await setup();
      const appt = await book(ctx, "14:00");
      expect(
        await adjustAppointment(managerActor(["d2"]), ctx.deps, appt.id, {
          start: at("16:00", TUESDAY),
        }),
      ).toEqual({ kind: "not_found" });
      expect(await get(ctx.repo, appt.id)).toEqual(appt);
      expect(
        await adjustAdjustOnly(ctx, "no-such-id", { start: at("16:00") }),
      ).toEqual({ kind: "not_found" });
    });

    it("AD-4: an empty or malformed request is validation_failed, a cancelled appointment is already_cancelled, and nothing changes", async () => {
      const ctx = await setup();
      const appt = await book(ctx, "14:00");
      const before = await world(ctx.repo);
      for (const [request, field] of [
        [{}, "body"],
        [{ start: Number.NaN }, "start"],
        [{ technicianId: "" }, "technicianId"],
        [{ serviceBayId: "" }, "serviceBayId"],
      ] as const) {
        expect(await adjustAdjustOnly(ctx, appt.id, request)).toMatchObject({
          kind: "validation_failed",
          errors: [{ field }],
        });
      }
      expect(await world(ctx.repo)).toEqual(before);
      await cancelAppointment(managerActor(), ctx.deps, appt.id);
      expect(
        await adjustAdjustOnly(ctx, appt.id, { start: at("16:00", TUESDAY) }),
      ).toEqual({ kind: "already_cancelled" });
    });

    it("section 7.7: an adjust reports its steps and logs allowed fields only", async () => {
      const ctx = await setup();
      const appt = await book(ctx, "14:00");
      ctx.logger.calls.length = 0;
      await adjustAdjustOnly(ctx, appt.id, { start: at("16:00", TUESDAY) });
      expect(ctx.logger.steps()).toEqual(["load", "check", "write"]);
      const info = ctx.logger.calls.flatMap((c) =>
        c.kind === "info" ? [c] : [],
      );
      expect(info).toHaveLength(1);
      expect(info[0]!.msg).toBe("appointment.adjust");
      for (const key of Object.keys(info[0]!.fields)) {
        expect(ALLOWED_LOG_FIELDS).toContain(key);
      }
    });
  });

  describe(`updateDealershipSettings over the ${storeName} store`, () => {
    const save = (ctx: Ctx, change: Partial<SettingsRequest>, d1 = "d1") =>
      dealership(ctx.repo, d1).then((d) =>
        updateDealershipSettings(
          managerActor([d1]),
          ctx.deps,
          d1,
          settingsOf(d!, change),
        ),
      );
    const overrideOn = (
      date: string,
      value: "closed" | { open: string; close: string },
    ) => ({
      dateOverrides: { [date]: value },
    });
    const tryBook = (ctx: Ctx, time: string, date = TUESDAY, id = "d1") =>
      bookAppointment(
        customerActor("c2"),
        ctx.deps,
        bookRequest({
          dealershipId: id,
          vehicleId: "v2",
          start: at(time, date),
        }),
        `key-${++keyCount}`,
      );

    it("REQ-BOOK-007.AC-2: a date override that extends the closing time lets a later job in", async () => {
      const ctx = await setup(wideShifts(seed(1, 1)));
      expect(await tryBook(ctx, "18:00")).toMatchObject({
        kind: "slot_unavailable",
        reasons: ["OUTSIDE_OPENING_HOURS"],
      });
      expect(
        await save(ctx, overrideOn(TUESDAY, hours("08:00", "20:00"))),
      ).toEqual({ kind: "ok", flagged: [] });
      expect(await tryBook(ctx, "18:00")).toMatchObject({ kind: "ok" });
    });

    it("REQ-BOOK-007.AC-3, AD-14: a shorter day refuses a job past closing with suggestions and flags a booked one, still confirmed and holding its resources", async () => {
      const ctx = await setup(wideShifts(seed(1, 1)));
      const late = await book(ctx, "16:00");
      const result = await save(
        ctx,
        overrideOn(TUESDAY, hours("08:00", "15:00")),
      );
      expect(result).toMatchObject({ kind: "ok", flagged: [{ id: late.id }] });
      const after = (await get(ctx.repo, late.id))!;
      expect(flagKinds(after)).toEqual(["outside_opening_hours"]);
      expect(after).toMatchObject({
        status: "confirmed",
        technicianId: late.technicianId,
        serviceBayId: late.serviceBayId,
        version: late.version,
      });
      const blocking = await ctx.repo.read((s) =>
        s.scheduling.listBlockingAppointments(
          "d1",
          at("00:00", TUESDAY),
          at("00:00", "2026-11-04"),
        ),
      );
      expect(blocking.map((a) => a.id)).toEqual([late.id]);
      const refused = await tryBook(ctx, "14:30");
      expect(refused).toMatchObject({
        kind: "slot_unavailable",
        reasons: ["OUTSIDE_OPENING_HOURS"],
      });
      expect(
        (refused as { suggestions: unknown[] }).suggestions.length,
      ).toBeGreaterThan(0);
    });

    it("REQ-BOOK-007.AC-4: a closed date refuses every time and suggests none on it, and flags the booked appointments without deleting any", async () => {
      const ctx = await setup(wideShifts(seed(2, 2)));
      const a = await book(ctx, "09:00");
      const b = await book(
        ctx,
        "13:00",
        { vehicleId: "v2" },
        TUESDAY,
        customerActor("c2"),
      );
      const result = await save(ctx, overrideOn(TUESDAY, "closed"));
      expect(result).toMatchObject({ kind: "ok" });
      expect(
        (result as { flagged: Appointment[] }).flagged.map((x) => x.id),
      ).toEqual([a.id, b.id]);
      for (const time of ["09:00", "12:00", "16:00"]) {
        const refused = await tryBook(ctx, time);
        expect(refused).toMatchObject({
          kind: "slot_unavailable",
          reasons: ["DEALERSHIP_CLOSED"],
        });
        const { suggestions } = refused as {
          suggestions: { start: number }[];
        };
        expect(suggestions.length).toBeGreaterThan(0);
        for (const s of suggestions) {
          expect(
            s.start < at("00:00", TUESDAY) ||
              s.start >= at("00:00", "2026-11-04"),
          ).toBe(true);
        }
      }
      expect(await get(ctx.repo, a.id)).toMatchObject({ status: "confirmed" });
      expect(await get(ctx.repo, b.id)).toMatchObject({ status: "confirmed" });
    });

    it("AD-14 Check: cutting a day with 5 appointments leaves exactly the 2 outside flagged, the count stays 5, and extending again clears both", async () => {
      const ctx = await setup(wideShifts(seed(5, 5)));
      const times = ["09:00", "10:00", "11:00", "13:00", "14:00"];
      const booked: Appointment[] = [];
      for (const time of times) booked.push(await book(ctx, time));
      const cut = await save(ctx, overrideOn(TUESDAY, hours("08:00", "12:00")));
      expect(
        (cut as { flagged: Appointment[] }).flagged.map((a) => a.start),
      ).toEqual([at("13:00", TUESDAY), at("14:00", TUESDAY)]);
      const stored = await Promise.all(booked.map((a) => get(ctx.repo, a.id)));
      expect(stored).toHaveLength(5);
      expect(stored.map((a) => flagKinds(a!).length)).toEqual([0, 0, 0, 1, 1]);
      const extended = await save(
        ctx,
        overrideOn(TUESDAY, hours("08:00", "18:00")),
      );
      expect(extended).toEqual({ kind: "ok", flagged: [] });
      for (const a of booked) expect(await get(ctx.repo, a.id)).toEqual(a);
    });

    it("REQ-BOOK-007.AC-1, D-0001-3: a change at one dealership changes the checks and flags of that dealership only", async () => {
      const ctx = await setup(wideShifts(seed(1, 1)));
      const one = await book(ctx, "16:00");
      const two = await book(ctx, "16:00", { dealershipId: "d2" });
      const before = await dealership(ctx.repo, "d2");
      await save(ctx, overrideOn(TUESDAY, hours("08:00", "15:00")));
      expect(flagKinds((await get(ctx.repo, one.id))!)).toEqual([
        "outside_opening_hours",
      ]);
      expect(await get(ctx.repo, two.id)).toEqual(two);
      expect(await dealership(ctx.repo, "d2")).toEqual(before);
      expect(await tryBook(ctx, "16:00", TUESDAY, "d2")).toMatchObject({
        kind: "slot_unavailable",
        reasons: expect.arrayContaining(["TECHNICIAN_BUSY"]),
      });
    });

    it("REQ-BOOK-011.AC-5, AD-14: lead time, horizon and break apply to later checks and change no stored appointment, not even its flags", async () => {
      const ctx = await setup(wideShifts(seed(1, 1)));
      const a = await book(ctx, "12:00");
      // A flag that the hours do not explain: a policy change must not rewrite it.
      const flagged = {
        ...a,
        flags: [{ kind: "outside_shift" as const, since: 7 }],
      };
      await ctx.repo.write(async (s) => {
        await s.appointments.update(flagged);
        return { ok: true, value: undefined };
      });
      const result = await save(ctx, {
        policies: {
          leadTimeMinutes: 36 * 60,
          horizonDays: 2,
          breakMinutes: 60,
        },
      });
      expect(result).toEqual({ kind: "ok", flagged: [flagged] });
      expect(await get(ctx.repo, a.id)).toEqual(flagged);
      expect((await dealership(ctx.repo))!.policies).toMatchObject({
        leadTimeMinutes: 2160,
        horizonDays: 2,
        breakMinutes: 60,
        gridMinutes: 15,
      });
      expect(await tryBook(ctx, "10:00", TUESDAY)).toMatchObject({
        reasons: ["TOO_SOON"],
      });
      expect(await tryBook(ctx, "10:00", "2026-11-10")).toMatchObject({
        reasons: ["BEYOND_HORIZON"],
      });
      // Break 60: the job at 12:00 to 13:00 holds the technician until 14:00.
      expect(await tryBook(ctx, "13:30")).toMatchObject({
        kind: "slot_unavailable",
        reasons: ["TECHNICIAN_BUSY"],
      });
    });

    it("AD-4: invalid values give validation_failed naming the field, and nothing is saved", async () => {
      const ctx = await setup();
      const d = (await dealership(ctx.repo))!;
      const before = await world(ctx.repo);
      const cases: [Partial<SettingsRequest>, string][] = [
        [
          { weeklyHours: { 1: hours("18:00", "08:00") } },
          "weeklyHours.1.close",
        ],
        [
          { weeklyHours: { 1: hours("08:00", "08:00") } },
          "weeklyHours.1.close",
        ],
        [
          { dateOverrides: { [TUESDAY]: hours("09:00", "09:00") } },
          `dateOverrides.${TUESDAY}.close`,
        ],
        [
          { dateOverrides: { "2026-02-31": "closed" } },
          "dateOverrides.2026-02-31",
        ],
        [
          { policies: { ...d.policies, breakMinutes: -1 } },
          "policies.breakMinutes",
        ],
        [
          { policies: { ...d.policies, leadTimeMinutes: -5 } },
          "policies.leadTimeMinutes",
        ],
        [
          { policies: { ...d.policies, horizonDays: 0 } },
          "policies.horizonDays",
        ],
        [
          { policies: { ...d.policies, horizonDays: 1.5 } },
          "policies.horizonDays",
        ],
        [{ timeZone: "Europe/Paris" } as never, "timeZone"],
        [
          { policies: { ...d.policies, gridMinutes: 5 } },
          "policies.gridMinutes",
        ],
      ];
      for (const [change, field] of cases) {
        const result = await save(ctx, change);
        expect(result).toMatchObject({ kind: "validation_failed" });
        expect(
          (result as { errors: { field: string }[] }).errors.map(
            (e) => e.field,
          ),
        ).toContain(field);
      }
      expect(await world(ctx.repo)).toEqual(before);
    });

    it("AD-4, AD-14: a failure after the settings are written and before the flags are keeps neither", async () => {
      const ctx = await setup(wideShifts(seed(1, 1)));
      const late = await book(ctx, "16:00");
      const before = await world(ctx.repo);
      const failing: UnitOfWork = {
        read: (work) => ctx.repo.read(work),
        write: (work) =>
          ctx.repo.write((stores) =>
            work({
              ...stores,
              appointments: {
                ...stores.appointments,
                update: async () => {
                  throw new Error("disk full");
                },
              },
            }),
          ),
      };
      const d = (await dealership(ctx.repo))!;
      await expect(
        updateDealershipSettings(
          managerActor(),
          { ...ctx.deps, uow: failing },
          "d1",
          settingsOf(d, overrideOn(TUESDAY, hours("08:00", "15:00"))),
        ),
      ).rejects.toThrow("disk full");
      expect(await world(ctx.repo)).toEqual(before);
      expect(await get(ctx.repo, late.id)).toEqual(late);
    });

    it("REQ-BOOK-008.AC-3, SEC-3.AC-1, SEC-4.AC-3: customer and staff get forbidden with no read, and so does a manager of another dealership", async () => {
      const ctx = await setup();
      const d = (await dealership(ctx.repo))!;
      const before = await world(ctx.repo);
      for (const actor of [
        customerActor(),
        staffActor(),
        managerActor(["d2"]),
      ]) {
        const { uow, calls } = spyOnStore(ctx.repo);
        expect(
          await updateDealershipSettings(
            actor,
            { ...ctx.deps, uow },
            "d1",
            settingsOf(d, overrideOn(TUESDAY, "closed")),
          ),
        ).toEqual({ kind: "forbidden" });
        expect(calls).toEqual([]);
      }
      expect(await world(ctx.repo)).toEqual(before);
    });

    it("a manager of a dealership that does not exist gets not_found, and the log holds allowed fields only", async () => {
      const ctx = await setup();
      const d = (await dealership(ctx.repo))!;
      expect(
        await updateDealershipSettings(
          managerActor(["zz"]),
          ctx.deps,
          "zz",
          settingsOf(d),
        ),
      ).toEqual({ kind: "not_found" });
      const info = ctx.logger.calls.flatMap((c) =>
        c.kind === "info" ? [c] : [],
      );
      expect(info[0]!.msg).toBe("dealership.settings.update");
      for (const key of Object.keys(info[0]!.fields)) {
        expect(ALLOWED_LOG_FIELDS).toContain(key);
      }
    });

    it("D-0001-36: a preview returns the bookings that would be flagged, reads only, and writes nothing", async () => {
      const ctx = await setup(wideShifts(seed(1, 1)));
      const late = await book(ctx, "16:00");
      const before = await world(ctx.repo);
      const d = (await dealership(ctx.repo))!;
      const { uow, calls } = spyOnStore(ctx.repo);
      const result = await updateDealershipSettings(
        managerActor(),
        { ...ctx.deps, uow },
        "d1",
        settingsOf(d, overrideOn(TUESDAY, hours("08:00", "15:00"))),
        { preview: true },
      );
      expect(result).toMatchObject({ kind: "ok", flagged: [{ id: late.id }] });
      expect(calls).toEqual(["read"]);
      expect(await world(ctx.repo)).toEqual(before);
      expect(
        await updateDealershipSettings(
          managerActor(["zz"]),
          ctx.deps,
          "zz",
          settingsOf(d),
          { preview: true },
        ),
      ).toEqual({ kind: "not_found" });
    });

    it("D-0001-35: the time zone cannot be changed", async () => {
      const ctx = await setup();
      const result = await save(ctx, { timeZone: "Asia/Tokyo" } as never);
      expect(result).toMatchObject({
        kind: "validation_failed",
        errors: [
          { field: "timeZone", message: "The time zone cannot be changed." },
        ],
      });
      expect((await dealership(ctx.repo))!.timeZone).toBe("UTC");
    });
  });

  describe(`updateTechnicianShifts over the ${storeName} store`, () => {
    const shiftsOf = (
      t: Awaited<ReturnType<typeof technician>>,
      change: Partial<ShiftsRequest> = {},
    ): ShiftsRequest => ({
      shiftPattern: t.shiftPattern,
      shiftExceptions: t.shiftExceptions,
      ...change,
    });
    const saveShifts = async (
      ctx: Ctx,
      change: Partial<ShiftsRequest>,
      id = "t1",
      options = {},
    ) =>
      updateTechnicianShifts(
        managerActor(),
        ctx.deps,
        id,
        shiftsOf(await technician(ctx.repo, id), change),
        options,
      );
    const tryBook = (ctx: Ctx, time: string, date = TUESDAY) =>
      bookAppointment(
        customerActor("c2"),
        ctx.deps,
        bookRequest({ vehicleId: "v2", start: at(time, date) }),
        `key-${++keyCount}`,
      );
    const morning: Shift = { start: "08:00", end: "12:00" };

    it("REQ-BOOK-008.AC-1: a shift added for a day lets the check choose that technician", async () => {
      const data = seed(1, 1);
      data.technicians[0]!.shiftPattern = {};
      const ctx = await setup(data);
      expect(await tryBook(ctx, "10:00")).toMatchObject({
        reasons: ["NO_QUALIFIED_TECHNICIAN_ON_SHIFT"],
      });
      expect(await saveShifts(ctx, { shiftPattern: { 2: morning } })).toEqual({
        kind: "ok",
        flagged: [],
      });
      expect(await tryBook(ctx, "10:00")).toMatchObject({
        kind: "ok",
        appointment: { technicianId: "t1" },
      });
    });

    it("REQ-BOOK-008.AC-2: a technician marked on leave is never chosen on that date", async () => {
      const ctx = await setup(seed(2, 2));
      await saveShifts(ctx, {
        shiftExceptions: { [TUESDAY]: { kind: "leave" } },
      });
      expect(await tryBook(ctx, "10:00")).toMatchObject({
        kind: "ok",
        appointment: { technicianId: "t2" },
      });
      await saveShifts(
        ctx,
        { shiftExceptions: { [TUESDAY]: { kind: "leave" } } },
        "t2",
      );
      const snapshot = await ctx.repo.read((s) =>
        loadSnapshot(s, {
          dealershipId: "d1",
          serviceTypeId: "st1",
          around: at("10:00", TUESDAY),
          daysEitherSide: 0,
        }),
      );
      expect(
        checkStart(
          snapshot!,
          { start: at("14:00", TUESDAY), transport: "wait" },
          at("00:00"),
        ),
      ).toMatchObject({
        available: false,
        reasons: ["NO_QUALIFIED_TECHNICIAN_ON_SHIFT"],
      });
    });

    it("REQ-BOOK-008.AC-4, AD-14: after an edit the appointments outside the shift are flagged and returned, none deleted or moved, and one that fits is not flagged; version and status stay", async () => {
      const ctx = await setup();
      const early = await book(ctx, "10:00");
      const late = await book(ctx, "15:00");
      const result = await saveShifts(ctx, {
        shiftExceptions: { [TUESDAY]: { kind: "changed", shift: morning } },
      });
      expect(result).toMatchObject({ kind: "ok", flagged: [{ id: late.id }] });
      expect(await get(ctx.repo, early.id)).toEqual(early);
      const after = (await get(ctx.repo, late.id))!;
      expect(flagKinds(after)).toEqual(["outside_shift"]);
      expect(after).toEqual({ ...late, flags: after.flags });
      expect(after).toMatchObject({
        version: late.version,
        status: "confirmed",
      });
      // The old shift again: the flag goes.
      expect(await saveShifts(ctx, { shiftExceptions: {} })).toEqual({
        kind: "ok",
        flagged: [],
      });
      expect(await get(ctx.repo, late.id)).toEqual(late);
    });

    it("Q-0001-10 A: an appointment that runs into the shift's break is flagged", async () => {
      const ctx = await setup();
      const a = await book(ctx, "12:00");
      const withBreak: Shift = {
        start: "08:00",
        end: "17:00",
        breakStart: "12:00",
        breakEnd: "13:00",
      };
      const result = await saveShifts(ctx, { shiftPattern: { 2: withBreak } });
      expect(result).toMatchObject({ kind: "ok", flagged: [{ id: a.id }] });
    });

    it("AD-4: shifts outside their day, breaks outside the shift or off the grid are validation_failed and nothing is saved", async () => {
      const ctx = await setup();
      const before = await world(ctx.repo);
      const base: Shift = { start: "08:00", end: "17:00" };
      const cases: [Shift | unknown, string][] = [
        [{ start: "08:00", end: "25:00" }, "shiftPattern.2.end"],
        [{ start: "17:00", end: "08:00" }, "shiftPattern.2.end"],
        [{ start: "08:10", end: "17:00" }, "shiftPattern.2.start"],
        [{ ...base, breakStart: "12:00" }, "shiftPattern.2.breakEnd"],
        [
          { ...base, breakStart: "13:00", breakEnd: "12:00" },
          "shiftPattern.2.breakEnd",
        ],
        [
          { ...base, breakStart: "07:00", breakEnd: "08:30" },
          "shiftPattern.2.breakStart",
        ],
        [
          { ...base, breakStart: "12:00", breakEnd: "17:30" },
          "shiftPattern.2.breakStart",
        ],
        [
          { ...base, breakStart: "12:05", breakEnd: "13:00" },
          "shiftPattern.2.breakStart",
        ],
        ["nope", "shiftPattern.2"],
      ];
      for (const [shift, field] of cases) {
        const result = await saveShifts(ctx, {
          shiftPattern: { 2: shift as Shift },
        });
        expect(result).toMatchObject({ kind: "validation_failed" });
        expect(
          (result as { errors: { field: string }[] }).errors.map(
            (e) => e.field,
          ),
        ).toContain(field);
      }
      const exceptionCases: [unknown, string][] = [
        [{ "2026-13-01": { kind: "leave" } }, "shiftExceptions.2026-13-01"],
        [{ [TUESDAY]: { kind: "holiday" } }, `shiftExceptions.${TUESDAY}`],
        [{ [TUESDAY]: null }, `shiftExceptions.${TUESDAY}`],
        [
          {
            [TUESDAY]: {
              kind: "changed",
              shift: { start: "09:00", end: "09:00" },
            },
          },
          `shiftExceptions.${TUESDAY}.shift.end`,
        ],
      ];
      for (const [exceptions, field] of exceptionCases) {
        const result = await saveShifts(ctx, {
          shiftExceptions: exceptions as never,
        });
        expect(
          (result as { errors: { field: string }[] }).errors.map(
            (e) => e.field,
          ),
        ).toContain(field);
      }
      for (const body of [{ shiftPattern: { 9: base } }, { extra: 1 }, "x"]) {
        const result = await updateTechnicianShifts(
          managerActor(),
          ctx.deps,
          "t1",
          body as never,
        );
        expect(result).toMatchObject({ kind: "validation_failed" });
      }
      expect(await world(ctx.repo)).toEqual(before);
    });

    it("SEC-3.AC-1: customer and staff get forbidden with no read; SEC-4.AC-3: a technician of another dealership is not_found and its shifts and flags stay", async () => {
      const ctx = await setup(wideShifts(seed(1, 1)));
      const t1 = await technician(ctx.repo);
      const mine = await book(ctx, "16:00");
      const before = await world(ctx.repo);
      for (const actor of [customerActor(), staffActor()]) {
        const { uow, calls } = spyOnStore(ctx.repo);
        expect(
          await updateTechnicianShifts(
            actor,
            { ...ctx.deps, uow },
            "t1",
            shiftsOf(t1),
          ),
        ).toEqual({ kind: "forbidden" });
        expect(calls).toEqual([]);
      }
      const request = shiftsOf(t1, {
        shiftExceptions: { [TUESDAY]: { kind: "leave" } },
      });
      expect(
        await updateTechnicianShifts(
          managerActor(["d2"]),
          ctx.deps,
          "t1",
          request,
        ),
      ).toEqual({ kind: "not_found" });
      expect(
        await updateTechnicianShifts(
          managerActor(["d1"]),
          ctx.deps,
          "t9",
          request,
        ),
      ).toEqual({ kind: "not_found" });
      expect(
        await updateTechnicianShifts(
          managerActor(["d1"]),
          ctx.deps,
          "nobody",
          request,
        ),
      ).toEqual({ kind: "not_found" });
      expect(await world(ctx.repo)).toEqual(before);
      expect(await get(ctx.repo, mine.id)).toEqual(mine);
    });

    it("D-0001-36: a preview returns the bookings that would be flagged, reads only, and writes nothing", async () => {
      const ctx = await setup();
      const late = await book(ctx, "15:00");
      const before = await world(ctx.repo);
      const t1 = await technician(ctx.repo);
      const { uow, calls } = spyOnStore(ctx.repo);
      const result = await updateTechnicianShifts(
        managerActor(),
        { ...ctx.deps, uow },
        "t1",
        shiftsOf(t1, {
          shiftExceptions: { [TUESDAY]: { kind: "changed", shift: morning } },
        }),
        { preview: true },
      );
      expect(result).toMatchObject({ kind: "ok", flagged: [{ id: late.id }] });
      expect(calls).toEqual(["read"]);
      expect(await world(ctx.repo)).toEqual(before);
    });

    it("AD-3: every manager command gives forbidden to a customer and to staff, ok to the manager of the dealership and not_found or forbidden to a manager of another", async () => {
      const ctx = await setup();
      const appt = await book(ctx, "14:00");
      const d = (await dealership(ctx.repo))!;
      const t1 = await technician(ctx.repo);
      const answers = async (actor: ReturnType<typeof managerActor>) => [
        (
          await adjustAppointment(actor, ctx.deps, appt.id, {
            start: at("15:00", TUESDAY),
          })
        ).kind,
        (await updateDealershipSettings(actor, ctx.deps, "d1", settingsOf(d)))
          .kind,
        (await updateTechnicianShifts(actor, ctx.deps, "t1", shiftsOf(t1)))
          .kind,
      ];
      expect(await answers(customerActor())).toEqual([
        "forbidden",
        "forbidden",
        "forbidden",
      ]);
      expect(await answers(staffActor())).toEqual([
        "forbidden",
        "forbidden",
        "forbidden",
      ]);
      expect(await answers(managerActor(["d2"]))).toEqual([
        "not_found",
        "forbidden",
        "not_found",
      ]);
      expect(await answers(managerActor())).toEqual(["ok", "ok", "ok"]);
    });
  });
}
