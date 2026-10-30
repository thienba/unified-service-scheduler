import { describe, expect, it } from "vitest";
import {
  bookedIntervals,
  checkStart,
  pickResources,
  searchDay,
  suggest,
  type CheckResult,
} from "./index";
import {
  MIN,
  MONDAY,
  NOW,
  appointment as appt,
  at,
  bay,
  day,
  dealership,
  snapshot,
  technician,
  utc,
} from "./fixtures";

const wait = { transport: "wait" } as const;
const check = (
  s: ReturnType<typeof snapshot>,
  start: number,
  extra: object = {},
  now = NOW,
) => checkStart(s, { ...wait, start, ...extra }, now);
const reasons = (r: CheckResult) => (r.available ? [] : r.reasons);

describe("checkStart: bay and technician", () => {
  it("a free bay and a qualified technician: available with exactly one of each (REQ-BOOK-002.AC-1)", () => {
    const r = check(snapshot(), at("10:00"));
    expect(r).toEqual({
      available: true,
      technicianId: "t1",
      serviceBayId: "b1",
      courtesyCarId: null,
    });
  });

  it("every qualified technician booked in part of the interval: TECHNICIAN_BUSY although a bay is free (AC-2)", () => {
    const s = snapshot({
      appointments: [
        appt("a1", "t1", "b1", at("10:30"), at("11:30")),
        appt("a2", "t2", "b2", at("09:30"), at("10:15")),
      ],
      bays: [bay("b1"), bay("b2"), bay("b3")],
    });
    expect(reasons(check(s, at("10:00")))).toEqual(["TECHNICIAN_BUSY"]);
  });

  it("every bay occupied in part of the interval: BAY_BUSY although a technician is free (AC-3, REQ-BOOK-003.AC-3)", () => {
    const s = snapshot({
      appointments: [
        appt("a1", "t3", "b1", at("10:30"), at("11:30")),
        appt("a2", "t3", "b2", at("09:30"), at("10:15")),
      ],
    });
    expect(reasons(check(s, at("10:00")))).toEqual(["BAY_BUSY"]);
  });

  it("a stored appointment makes its technician and bay busy (REQ-BOOK-003.AC-3)", () => {
    const s = snapshot({
      technicians: [technician("t1")],
      bays: [bay("b1")],
      appointments: [appt("a1", "t1", "b1", at("10:00"), at("11:00"))],
    });
    expect(reasons(check(s, at("10:30")))).toEqual([
      "TECHNICIAN_BUSY",
      "BAY_BUSY",
    ]);
  });

  it("a technician without the skill is never chosen (AC-4)", () => {
    const s = snapshot({
      technicians: [
        technician("a", { skills: ["electrician"] }),
        technician("t1"),
      ],
    });
    expect(check(s, at("10:00"))).toMatchObject({ technicianId: "t1" });
    const none = snapshot({
      technicians: [technician("a", { skills: ["electrician"] })],
    });
    expect(reasons(check(none, at("10:00")))).toEqual([
      "NO_QUALIFIED_TECHNICIAN_ON_SHIFT",
    ]);
  });

  it("an inactive technician or bay is never chosen", () => {
    const s = snapshot({
      technicians: [technician("a", { active: false })],
      bays: [bay("b1", { active: false })],
    });
    expect(reasons(check(s, at("10:00")))).toEqual([
      "NO_QUALIFIED_TECHNICIAN_ON_SHIFT",
      "BAY_BUSY",
    ]);
  });

  it("an appointment ending exactly at the start does not overlap, for bay, technician with a 0-minute break, and car (AC-5)", () => {
    const s = snapshot({
      dealership: dealership({
        policies: {
          leadTimeMinutes: 120,
          horizonDays: 30,
          breakMinutes: 0,
          gridMinutes: 15,
        },
      }),
      technicians: [technician("t1")],
      bays: [bay("b1")],
      appointments: [
        appt("a1", "t1", "b1", at("09:00"), at("10:00"), {
          courtesyCarId: "c1",
          transport: "courtesy_car",
        }),
      ],
    });
    expect(
      checkStart(s, { transport: "courtesy_car", start: at("10:00") }, NOW),
    ).toEqual({
      available: true,
      technicianId: "t1",
      serviceBayId: "b1",
      courtesyCarId: "c1",
    });
  });

  it("a bay or technician of another dealership is never chosen (AC-6)", () => {
    const s = snapshot({
      technicians: [technician("t1", { dealershipId: "d2" })],
      bays: [bay("b1", { dealershipId: "d2" })],
    });
    expect(reasons(check(s, at("10:00")))).toEqual([
      "NO_QUALIFIED_TECHNICIAN_ON_SHIFT",
      "BAY_BUSY",
    ]);
  });

  it("another dealership's appointments do not matter and a cancelled one holds nothing", () => {
    const s = snapshot({
      technicians: [technician("t1")],
      bays: [bay("b1")],
      appointments: [
        appt("a1", "t1", "b1", at("10:00"), at("11:00"), {
          status: "cancelled",
        }),
      ],
    });
    expect(check(s, at("10:00")).available).toBe(true);
  });
});

describe("checkStart: shifts", () => {
  it("a shift covering the whole interval with no overlap: can be chosen (REQ-BOOK-006.AC-1)", () => {
    const s = snapshot({ technicians: [technician("t1")] });
    expect(check(s, at("16:00"))).toMatchObject({ technicianId: "t1" });
  });

  it("a shift that ends before the job ends, or no shift that day: not chosen (AC-2, AC-3)", () => {
    const s = snapshot({ technicians: [technician("t1")] });
    expect(reasons(check(s, at("16:15")))).toEqual([
      "NO_QUALIFIED_TECHNICIAN_ON_SHIFT",
    ]);
    const noShift = snapshot({
      technicians: [technician("t1", { shiftPattern: {} })],
    });
    expect(reasons(check(noShift, at("10:00")))).toEqual([
      "NO_QUALIFIED_TECHNICIAN_ON_SHIFT",
    ]);
  });

  it("another technician on shift is chosen instead", () => {
    const s = snapshot({
      technicians: [technician("t1", { shiftPattern: {} }), technician("t2")],
    });
    expect(check(s, at("10:00"))).toMatchObject({ technicianId: "t2" });
  });

  it("an exception adds a shift on a day with none, and a leave exception removes it (REQ-BOOK-008.AC-1, AC-2)", () => {
    const added = snapshot({
      technicians: [
        technician("t1", {
          shiftPattern: {},
          shiftExceptions: {
            [MONDAY]: {
              kind: "changed",
              shift: { start: "09:00", end: "13:00" },
            },
          },
        }),
      ],
    });
    expect(check(added, at("10:00"))).toMatchObject({ technicianId: "t1" });
    const leave = snapshot({
      technicians: [
        technician("t1", { shiftExceptions: { [MONDAY]: { kind: "leave" } } }),
      ],
    });
    expect(reasons(check(leave, at("10:00")))).toEqual([
      "NO_QUALIFIED_TECHNICIAN_ON_SHIFT",
    ]);
  });

  it("the shift's own break splits the day: a job cannot cross it", () => {
    const s = snapshot({
      technicians: [
        technician(
          "t1",
          {},
          {
            start: "08:00",
            end: "17:00",
            breakStart: "12:00",
            breakEnd: "13:00",
          },
        ),
      ],
    });
    expect(reasons(check(s, at("11:30")))).toEqual([
      "NO_QUALIFIED_TECHNICIAN_ON_SHIFT",
    ]);
    expect(check(s, at("13:00")).available).toBe(true);
    expect(check(s, at("11:00")).available).toBe(true);
  });
});

describe("checkStart: opening hours", () => {
  it("each dealership's own hours decide (REQ-BOOK-007.AC-1)", () => {
    const early = snapshot();
    const late = snapshot({
      dealership: dealership({ weeklyHours: { 1: day("10:00", "20:00") } }),
    });
    expect(check(early, at("08:30")).available).toBe(true);
    expect(reasons(check(late, at("08:30")))).toEqual([
      "OUTSIDE_OPENING_HOURS",
    ]);
  });

  it("an override that extends the closing time lets a later job in (AC-2)", () => {
    const base = snapshot({
      technicians: [technician("t1", {}, { start: "08:00", end: "20:00" })],
    });
    expect(reasons(check(base, at("17:30")))).toEqual([
      "OUTSIDE_OPENING_HOURS",
    ]);
    const extended = {
      ...base,
      dealership: dealership({
        dateOverrides: { [MONDAY]: day("08:00", "20:00") },
      }),
    };
    expect(check(extended, at("17:30")).available).toBe(true);
  });

  it("an override that shortens the hours refuses a late job and suggest offers other times (AC-3)", () => {
    const s = snapshot({
      dealership: dealership({
        dateOverrides: { [MONDAY]: day("08:00", "16:00") },
      }),
    });
    expect(reasons(check(s, at("15:30")))).toEqual(["OUTSIDE_OPENING_HOURS"]);
    const times = suggest(s, { ...wait, start: at("15:30") }, NOW);
    expect(times.length).toBeGreaterThan(0);
    expect(times).toContain(at("15:00"));
  });

  it("an override that closes the date refuses every time with DEALERSHIP_CLOSED and no suggestion lies on it (AC-4)", () => {
    const s = snapshot({
      dealership: dealership({ dateOverrides: { [MONDAY]: "closed" } }),
    });
    expect(reasons(check(s, at("10:00")))).toEqual(["DEALERSHIP_CLOSED"]);
    expect(reasons(check(s, at("03:00")))).toEqual(["DEALERSHIP_CLOSED"]);
    const times = suggest(s, { ...wait, start: at("10:00") }, NOW);
    expect(times.length).toBe(5);
    for (const t of times) expect(t >= at("00:00", "2026-11-03")).toBe(true);
  });

  it("with no override the weekly hours of that weekday decide (AC-5)", () => {
    const s = snapshot();
    expect(reasons(check(s, at("10:00", "2026-11-07")))).toEqual([
      "DEALERSHIP_CLOSED",
    ]);
    expect(check(s, at("10:00", "2026-11-03")).available).toBe(true);
  });
});

describe("checkStart: courtesy car", () => {
  const withCar = (booked: boolean) =>
    snapshot({
      appointments: booked
        ? [
            appt("a1", "t1", "b1", at("09:30"), at("10:30"), {
              courtesyCarId: "c1",
              transport: "courtesy_car",
            }),
          ]
        : [],
    });
  it("needs a free car and returns its id (REQ-BOOK-010.AC-3)", () => {
    expect(
      checkStart(
        withCar(false),
        { transport: "courtesy_car", start: at("10:00") },
        NOW,
      ),
    ).toMatchObject({ available: true, courtesyCarId: "c1" });
  });
  it("with no car free: COURTESY_CAR_BUSY, and wait or drop_off still work (Q-0001-18 A)", () => {
    const s = withCar(true);
    expect(
      reasons(
        checkStart(s, { transport: "courtesy_car", start: at("10:00") }, NOW),
      ),
    ).toEqual(["COURTESY_CAR_BUSY"]);
    for (const transport of ["wait", "drop_off"] as const) {
      expect(
        checkStart(s, { transport, start: at("10:00") }, NOW),
      ).toMatchObject({ available: true, courtesyCarId: null });
    }
  });
});

describe("checkStart: lead time, horizon, break", () => {
  it("a 2-hour lead time and now 09:00: 10:00 is TOO_SOON, exactly 11:00 is allowed, 10:59 is not (REQ-BOOK-011.AC-1)", () => {
    const s = snapshot();
    const now = at("09:00");
    expect(reasons(check(s, at("10:00"), {}, now))).toEqual(["TOO_SOON"]);
    expect(reasons(check(s, at("10:59"), {}, now))).toEqual(["TOO_SOON"]);
    expect(check(s, at("11:00"), {}, now).available).toBe(true);
    const times = suggest(s, { ...wait, start: at("10:00") }, now);
    expect(times.length).toBeGreaterThan(0);
    for (const t of times) expect(t >= at("11:00")).toBe(true);
  });

  it("a 30-day horizon: the last date is allowed, the next is BEYOND_HORIZON and no suggestion lies past it (AC-2)", () => {
    const s = snapshot({
      dealership: dealership({
        weeklyHours: {
          1: day(),
          2: day(),
          3: day(),
          4: day(),
          5: day(),
          6: day(),
          7: day(),
        },
      }),
      technicians: [
        technician("t1", {
          shiftPattern: Object.fromEntries(
            [1, 2, 3, 4, 5, 6, 7].map((d) => [
              d,
              { start: "08:00", end: "17:00" },
            ]),
          ),
        }),
      ],
    });
    // Today is 2026-11-02, so the last date is 2026-12-02.
    expect(check(s, at("10:00", "2026-12-02")).available).toBe(true);
    expect(reasons(check(s, at("10:00", "2026-12-03")))).toEqual([
      "BEYOND_HORIZON",
    ]);
    const times = suggest(
      s,
      { ...wait, start: at("10:00", "2026-12-03") },
      NOW,
    );
    expect(times.length).toBeGreaterThan(0);
    for (const t of times) expect(t < at("00:00", "2026-12-03")).toBe(true);
  });

  it("a 15-minute break: a job ending at 10:00 blocks 10:00, 10:15 is free (AC-3)", () => {
    const s = snapshot({
      technicians: [technician("t1")],
      appointments: [appt("a1", "t1", "b2", at("09:00"), at("10:00"))],
    });
    expect(reasons(check(s, at("10:00")))).toEqual(["TECHNICIAN_BUSY"]);
    expect(check(s, at("10:15")).available).toBe(true);
  });

  it("a job ending exactly at the shift end needs no break after it, even with a job just before it (AC-4)", () => {
    const s = snapshot({
      technicians: [technician("t1")],
      appointments: [appt("a1", "t1", "b2", at("14:00"), at("15:00"))],
    });
    expect(check(s, at("16:00")).available).toBe(true);
    expect(reasons(check(s, at("16:15")))).toEqual([
      "NO_QUALIFIED_TECHNICIAN_ON_SHIFT",
    ]);
    const tooClose = snapshot({
      technicians: [technician("t1")],
      appointments: [appt("a1", "t1", "b2", at("14:00"), at("15:50"))],
    });
    expect(reasons(check(tooClose, at("16:00")))).toEqual(["TECHNICIAN_BUSY"]);
  });

  it("a job ending exactly at the end of a work segment, after a break between segments, is accepted", () => {
    const s = snapshot({
      technicians: [
        technician(
          "t1",
          {},
          {
            start: "08:00",
            end: "17:00",
            breakStart: "12:00",
            breakEnd: "13:00",
          },
        ),
      ],
      appointments: [appt("a1", "t1", "b2", at("09:00"), at("10:45"))],
    });
    expect(check(s, at("11:00")).available).toBe(true);
  });
});

describe("checkStart: pins and excluded appointment", () => {
  const s = snapshot({
    appointments: [appt("a1", "t1", "b1", at("10:00"), at("11:00"))],
  });
  it("a pinned technician who is busy, off shift or not qualified gives a reason although another is free", () => {
    expect(reasons(check(s, at("10:00"), { technicianId: "t1" }))).toEqual([
      "TECHNICIAN_BUSY",
    ]);
    expect(check(s, at("10:00"), { technicianId: "t2" })).toMatchObject({
      technicianId: "t2",
    });
    const off = snapshot({
      technicians: [technician("t1", { shiftPattern: {} }), technician("t2")],
    });
    expect(reasons(check(off, at("10:00"), { technicianId: "t1" }))).toEqual([
      "NO_QUALIFIED_TECHNICIAN_ON_SHIFT",
    ]);
    const unskilled = snapshot({
      technicians: [technician("t1", { skills: [] }), technician("t2")],
    });
    expect(
      reasons(check(unskilled, at("10:00"), { technicianId: "t1" })),
    ).toEqual(["NO_QUALIFIED_TECHNICIAN_ON_SHIFT"]);
  });

  it("a pinned bay that is busy gives BAY_BUSY; a free pinned bay is used", () => {
    expect(reasons(check(s, at("10:00"), { serviceBayId: "b1" }))).toEqual([
      "BAY_BUSY",
    ]);
    expect(check(s, at("10:00"), { serviceBayId: "b2" })).toMatchObject({
      serviceBayId: "b2",
    });
  });

  it("the appointment to leave out does not count as busy (Q-0001-7 A, REQ-BOOK-005)", () => {
    const own = check(s, at("10:00"), {
      technicianId: "t1",
      serviceBayId: "b1",
      excludeAppointmentId: "a1",
    });
    expect(own).toMatchObject({ technicianId: "t1", serviceBayId: "b1" });
    expect(
      reasons(
        check(s, at("10:00"), {
          technicianId: "t1",
          serviceBayId: "b1",
          excludeAppointmentId: "other",
        }),
      ),
    ).toEqual(["TECHNICIAN_BUSY", "BAY_BUSY"]);
  });
});

describe("pickResources", () => {
  const t = (id: string, name: string) => technician(id, { name });
  it("picks the technician with fewer appointments that date, then the first name; the first bay by name (D-0001-15)", () => {
    const free = {
      technicians: [t("x", "Zed"), t("y", "Amy"), t("z", "Bob")],
      bays: [bay("b2", { name: "Bay 2" }), bay("b1", { name: "Bay 1" })],
      courtesyCars: [],
    };
    expect(pickResources(free, new Map())).toEqual({
      technicianId: "y",
      serviceBayId: "b1",
      courtesyCarId: null,
    });
    expect(
      pickResources(
        free,
        new Map([
          ["y", 2],
          ["z", 1],
          ["x", 1],
        ]),
      ),
    ).toMatchObject({ technicianId: "z" });
  });

  it("the same name keeps the given order", () => {
    const free = {
      technicians: [t("x", "Amy"), t("y", "Amy")],
      bays: [bay("b2", { name: "Bay" }), bay("b1", { name: "Bay" })],
      courtesyCars: [],
    };
    expect(pickResources(free, new Map())).toMatchObject({
      technicianId: "x",
      serviceBayId: "b2",
    });
  });

  it("through checkStart: the technician with fewer appointments that day is chosen", () => {
    const s = snapshot({
      technicians: [t("t1", "Amy"), t("t2", "Bob")],
      appointments: [
        appt("a1", "t1", "b1", at("08:00"), at("09:00")),
        appt("a2", "t2", "b1", at("15:00"), at("16:00"), {
          status: "cancelled",
        }),
        appt(
          "a3",
          "t1",
          "b2",
          at("12:00", "2026-11-03"),
          at("13:00", "2026-11-03"),
        ),
      ],
    });
    expect(check(s, at("11:00"))).toMatchObject({ technicianId: "t2" });
  });

  it("two checks in a row, the first added to the snapshot, choose different technicians and bays (REQ-BOOK-009.AC-5)", () => {
    const s = snapshot();
    const first = check(s, at("10:00"));
    if (!first.available) throw new Error("expected available");
    const added = {
      ...s,
      appointments: [
        appt(
          "n1",
          first.technicianId,
          first.serviceBayId,
          at("10:00"),
          at("11:00"),
        ),
      ],
    };
    const second = check(added, at("10:00"));
    if (!second.available) throw new Error("expected available");
    expect(second.technicianId).not.toBe(first.technicianId);
    expect(second.serviceBayId).not.toBe(first.serviceBayId);
    const third = check(
      {
        ...added,
        appointments: [
          ...added.appointments,
          appt(
            "n2",
            second.technicianId,
            second.serviceBayId,
            at("10:00"),
            at("11:00"),
          ),
        ],
      },
      at("10:00"),
    );
    expect(reasons(third)).toEqual(["TECHNICIAN_BUSY", "BAY_BUSY"]);
  });
});

describe("bookedIntervals", () => {
  it("returns exactly the technician's blocking intervals for the date, earliest first, without cancelled ones (REQ-BOOK-006.AC-4)", () => {
    const list = [
      appt("a2", "t1", "b1", at("13:00"), at("14:00")),
      appt("a1", "t1", "b1", at("09:00"), at("10:00")),
      appt("a3", "t1", "b1", at("11:00"), at("12:00"), { status: "cancelled" }),
      appt("a4", "t2", "b1", at("11:00"), at("12:00")),
      appt(
        "a5",
        "t1",
        "b1",
        at("09:00", "2026-11-03"),
        at("10:00", "2026-11-03"),
      ),
    ];
    expect(bookedIntervals(list, "t1", MONDAY, "UTC")).toEqual([
      { start: at("09:00"), end: at("10:00") },
      { start: at("13:00"), end: at("14:00") },
    ]);
  });
});

describe("suggest", () => {
  it("shows other times, all inside a qualified technician's shift, when everyone is booked at the wanted time (REQ-BOOK-006.AC-5)", () => {
    const s = snapshot({
      technicians: [technician("t1", {}, { start: "09:00", end: "12:00" })],
      appointments: [appt("a1", "t1", "b1", at("10:00"), at("11:00"))],
    });
    const times = suggest(s, { ...wait, start: at("10:00") }, NOW);
    expect(times.length).toBeGreaterThan(0);
    expect(times).not.toContain(at("10:00"));
    for (const t of times) {
      const hour = new Date(t).getUTCHours();
      expect(
        hour >= 9 &&
          t + 60 * MIN <= at("12:00", new Date(t).toISOString().slice(0, 10)),
      ).toBe(true);
    }
  });

  it("returns at most 5, nearest first, the later one first on a tie, within 14 days (D-0001-16)", () => {
    const s = snapshot();
    const wanted = at("12:00");
    const times = suggest(s, { ...wait, start: wanted }, NOW);
    expect(times).toEqual([
      at("12:00"),
      at("12:15"),
      at("11:45"),
      at("12:30"),
      at("11:30"),
    ]);
    const far = suggest(s, { ...wait, start: wanted }, NOW, {
      count: 500,
      windowDays: 14,
    });
    for (const t of far)
      expect(Math.abs(t - wanted) <= 14 * 24 * 60 * MIN).toBe(true);
    const small = suggest(s, { ...wait, start: wanted }, NOW, { count: 2 });
    expect(small).toEqual([at("12:00"), at("12:15")]);
  });

  it("gives an empty list when nothing is free in the window, and checkStart still gives the reasons (D-0001-2)", () => {
    const s = snapshot({ technicians: [] });
    expect(suggest(s, { ...wait, start: at("10:00") }, NOW)).toEqual([]);
    expect(reasons(check(s, at("10:00")))).toEqual([
      "NO_QUALIFIED_TECHNICIAN_ON_SHIFT",
    ]);
  });

  it("never offers a time before the lead time, even when the wanted time is earlier", () => {
    const s = snapshot();
    const times = suggest(s, { ...wait, start: at("03:00") }, NOW);
    for (const t of times) expect(t >= at("02:00")).toBe(true);
  });
});

const london = (date: string, open: string, close: string, hour = 7) =>
  snapshot({
    dealership: dealership({
      timeZone: "Europe/London",
      weeklyHours: { [hour]: { open, close } },
    }),
    technicians: [
      technician("t1", {
        shiftPattern: { [hour]: { start: "00:00", end: "23:00" } },
      }),
    ],
    serviceType: {
      id: "s1",
      name: "S",
      durationMinutes: 60,
      requiredSkill: "mechanic",
    },
  });

describe("searchDay across DST in Europe/London (AD-9, S4)", () => {
  it("spring forward: grid starts are real 15-minute steps from the opening instant, and the first and last fit the window", () => {
    // 2026-03-29: clocks jump 01:00 to 02:00. Open 00:30 to 03:30 is two real hours.
    const s = london("2026-03-29", "00:30", "03:30");
    const now = utc("2026-03-01T00:00:00Z");
    const starts = searchDay(s, { ...wait, date: "2026-03-29" }, now);
    expect(starts[0]).toBe(utc("2026-03-29T00:30:00Z"));
    expect(starts.at(-1)).toBe(utc("2026-03-29T01:30:00Z"));
    expect(starts).toHaveLength(5);
    starts.forEach((t, i) => expect(t).toBe(starts[0]! + i * 15 * MIN));
  });

  it("fall back: the repeated hour counts twice", () => {
    // 2026-10-25: clocks go back 02:00 to 01:00. Open 00:30 to 03:30 is four real hours.
    const s = london("2026-10-25", "00:30", "03:30");
    const now = utc("2026-10-01T00:00:00Z");
    const starts = searchDay(s, { ...wait, date: "2026-10-25" }, now);
    expect(starts[0]).toBe(utc("2026-10-24T23:30:00Z"));
    expect(starts.at(-1)).toBe(utc("2026-10-25T02:30:00Z"));
    expect(starts).toHaveLength(13);
    starts.forEach((t, i) => expect(t).toBe(starts[0]! + i * 15 * MIN));
  });
});

describe("checkStart: the grid (D-0001-147)", () => {
  it("a start off the grid, with minutes or seconds, is NOT_ON_GRID", () => {
    const s = snapshot();
    expect(check(s, at("10:07"))).toEqual({
      available: false,
      reasons: ["NOT_ON_GRID"],
    });
    expect(check(s, at("14:07") + 33_000)).toEqual({
      available: false,
      reasons: ["NOT_ON_GRID"],
    });
    expect(check(s, at("10:15")).available).toBe(true);
  });

  it("the grid counts real time from the opening instant, also across a clock change", () => {
    // 2026-03-29 London: open 00:10, clocks jump at 01:00 UTC. Grid is 00:10Z + 15 minutes.
    const s = london("2026-03-29", "00:10", "04:00");
    const now = utc("2026-03-01T00:00:00Z");
    const ask = (iso: string) =>
      checkStart(s, { ...wait, start: utc(iso) }, now);
    expect(ask("2026-03-29T00:25:00Z").available).toBe(true);
    expect(ask("2026-03-29T01:25:00Z").available).toBe(true);
    expect(ask("2026-03-29T00:15:00Z")).toEqual({
      available: false,
      reasons: ["NOT_ON_GRID"],
    });
    expect(ask("2026-03-29T01:30:00Z")).toEqual({
      available: false,
      reasons: ["NOT_ON_GRID"],
    });
  });
});

describe("searchDay", () => {
  it("is empty for a closed day, a day beyond the horizon, and returns grid starts otherwise", () => {
    const s = snapshot();
    expect(searchDay(s, { ...wait, date: "2026-11-07" }, NOW)).toEqual([]);
    expect(searchDay(s, { ...wait, date: "2027-03-01" }, NOW)).toEqual([]);
    const starts = searchDay(s, { ...wait, date: MONDAY }, NOW);
    expect(starts[0]).toBe(at("08:00"));
    expect(starts.at(-1)).toBe(at("16:00"));
  });
});

describe("a fixed technician in the day search and the suggestions (D-0001-31 A)", () => {
  // t1 is busy 10:00 to 11:00; t2 is free all day.
  const s = snapshot({
    appointments: [appt("a1", "t1", "b1", at("10:00"), at("11:00"))],
  });

  it("searchDay lists only starts where the fixed technician is free", () => {
    const any = searchDay(s, { ...wait, date: MONDAY }, NOW);
    const fixed = searchDay(
      s,
      { ...wait, date: MONDAY, technicianId: "t1" },
      NOW,
    );
    expect(any).toContain(at("10:00"));
    expect(fixed).not.toContain(at("10:00"));
    expect(fixed).not.toContain(at("10:45"));
    expect(fixed).toContain(at("11:15"));
    for (const start of fixed) {
      expect(check(s, start, { technicianId: "t1" }).available).toBe(true);
    }
  });

  it("suggest keeps to the fixed technician, so every suggestion passes the check with that technician", () => {
    const times = suggest(
      s,
      { ...wait, start: at("10:00"), technicianId: "t1" },
      NOW,
    );
    expect(times.length).toBeGreaterThan(0);
    for (const start of times) {
      expect(check(s, start, { technicianId: "t1" }).available).toBe(true);
    }
    expect(times).not.toContain(at("10:00"));
    // Without the fixing, t2 is free at once, so the wanted time itself is offered.
    expect(suggest(s, { ...wait, start: at("10:00") }, NOW)).toContain(
      at("10:00"),
    );
  });
});

describe("checkStart: one car, one appointment at a time (D-0001-146)", () => {
  const busyCar = (over: object = {}, start = "10:00", end = "11:00") =>
    appt("car1", "t9", "b9", at(start), at(end), {
      dealershipId: "d2",
      vehicleId: "v1",
      ...over,
    });
  const withCar = (list: ReturnType<typeof busyCar>[]) =>
    snapshot({ vehicleAppointments: list });
  const carCheck = (s: ReturnType<typeof snapshot>, start: number, x = {}) =>
    check(s, start, { vehicleId: "v1", ...x });

  it("an overlapping blocking appointment of the same car at another dealership: VEHICLE_BUSY", () => {
    const s = withCar([busyCar()]);
    expect(reasons(carCheck(s, at("10:30")))).toEqual(["VEHICLE_BUSY"]);
    expect(reasons(carCheck(s, at("09:30")))).toEqual(["VEHICLE_BUSY"]);
  });

  it("the same appointments do not block a request with no car, or another car", () => {
    const s = withCar([busyCar()]);
    expect(check(s, at("10:30")).available).toBe(true);
    expect(carCheck(s, at("10:30"), { vehicleId: "v2" }).available).toBe(true);
  });

  it("touching times do not clash and no rest break applies to a car", () => {
    const s = withCar([busyCar()]);
    expect(carCheck(s, at("11:00")).available).toBe(true);
    expect(carCheck(s, at("09:00")).available).toBe(true);
  });

  it("a cancelled appointment does not block", () => {
    const s = withCar([busyCar({ status: "cancelled", cancelledAt: 1 })]);
    expect(carCheck(s, at("10:30")).available).toBe(true);
  });

  it("the appointment being moved does not block itself", () => {
    const s = withCar([busyCar()]);
    expect(
      carCheck(s, at("10:30"), { excludeAppointmentId: "car1" }).available,
    ).toBe(true);
  });

  it("searchDay and suggest leave out the times the car is busy", () => {
    const s = withCar([busyCar()]);
    const request = { transport: "wait", vehicleId: "v1" } as const;
    const starts = searchDay(s, { ...request, date: MONDAY }, NOW);
    expect(starts).not.toContain(at("09:15"));
    expect(starts).not.toContain(at("10:45"));
    expect(starts).toContain(at("09:00"));
    expect(starts).toContain(at("11:00"));
    const near = suggest(s, { ...request, start: at("10:00") }, NOW);
    expect(near.length).toBeGreaterThan(0);
    for (const start of near) {
      expect(carCheck(s, start).available).toBe(true);
    }
  });
});
