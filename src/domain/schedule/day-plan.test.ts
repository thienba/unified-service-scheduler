import { describe, expect, it } from "vitest";
import {
  MONDAY,
  NOW,
  at,
  dealership,
  technician,
  utc,
} from "../availability/fixtures";
import { freeWindows, nextOpenDate, technicianDay } from "./day-plan";

const window = (a: string, b: string, date = MONDAY) => ({
  start: at(a, date),
  end: at(b, date),
});

describe("free windows (D-0001-21 A)", () => {
  const d = dealership();
  const withBreak = technician(
    "t1",
    {},
    {
      start: "08:00",
      end: "17:00",
      breakStart: "12:00",
      breakEnd: "12:30",
    },
  );

  it("an empty day is the shift minus its break", () => {
    expect(freeWindows(withBreak, d, MONDAY, [], NOW)).toEqual([
      window("08:00", "12:00"),
      window("12:30", "17:00"),
    ]);
  });

  it("keeps the rest between jobs empty before and after each job", () => {
    const jobs = [window("09:00", "10:00"), window("14:00", "16:00")];
    expect(freeWindows(withBreak, d, MONDAY, jobs, NOW)).toEqual([
      window("08:00", "08:45"),
      window("10:15", "12:00"),
      window("12:30", "13:45"),
      window("16:15", "17:00"),
    ]);
  });

  it("leaves out windows shorter than 30 minutes", () => {
    const jobs = [window("08:00", "09:00"), window("09:45", "11:00")];
    // 09:15 to 09:30 is 15 minutes: too short to draw.
    expect(freeWindows(withBreak, d, MONDAY, jobs, NOW)[0]).toEqual(
      window("11:15", "12:00"),
    );
  });

  it("starts no earlier than the lead time, on the grid from the opening", () => {
    const now = at("09:07");
    // Lead time 2 hours: 11:07, rounded up to the 15-minute grid: 11:15.
    expect(freeWindows(withBreak, d, MONDAY, [], now)).toEqual([
      window("11:15", "12:00"),
      window("12:30", "17:00"),
    ]);
  });

  it("is empty on a past day, a closed day and beyond the horizon", () => {
    expect(freeWindows(withBreak, d, MONDAY, [], at("18:00"))).toEqual([]);
    const sunday = "2026-11-08";
    expect(freeWindows(withBreak, d, sunday, [], NOW)).toEqual([]);
    expect(freeWindows(withBreak, d, "2026-12-15", [], NOW)).toEqual([]);
  });

  it("is cut to the opening hours", () => {
    const short = dealership({
      dateOverrides: { [MONDAY]: { open: "10:00", close: "15:00" } },
    });
    expect(freeWindows(withBreak, short, MONDAY, [], NOW)).toEqual([
      window("10:00", "12:00"),
      window("12:30", "15:00"),
    ]);
  });
});

describe("a technician's day", () => {
  const d = dealership();
  it("gives the shift and break as instants", () => {
    const t = technician(
      "t1",
      {},
      {
        start: "08:00",
        end: "16:30",
        breakStart: "12:30",
        breakEnd: "13:00",
      },
    );
    const day = technicianDay(t, d, MONDAY, [], NOW);
    expect(day.onLeave).toBe(false);
    expect(day.shift).toEqual(window("08:00", "16:30"));
    expect(day.break).toEqual(window("12:30", "13:00"));
  });

  it("says when the technician is on leave, with no shift and no free time", () => {
    const t = technician("t1", {
      shiftExceptions: { [MONDAY]: { kind: "leave" } },
    });
    expect(technicianDay(t, d, MONDAY, [], NOW)).toEqual({
      onLeave: true,
      shift: null,
      break: null,
      free: [],
    });
  });

  it("a day off by the weekly pattern is no shift, and not leave", () => {
    const t = technician("t1");
    const saturday = "2026-11-07";
    expect(technicianDay(t, d, saturday, [], NOW)).toMatchObject({
      onLeave: false,
      shift: null,
    });
  });

  it("puts a shift on a clock-change day at its real instants (Europe/London, 2026-10-25)", () => {
    const london = dealership({
      timeZone: "Europe/London",
      weeklyHours: { 7: { open: "08:00", close: "18:00" } },
    });
    const t = technician("t1", {
      shiftPattern: { 7: { start: "08:00", end: "16:00" } },
    });
    const day = technicianDay(
      t,
      london,
      "2026-10-25",
      [],
      utc("2026-10-20T00:00:00Z"),
    );
    // After the clocks go back, 08:00 in London is 08:00 UTC.
    expect(day.shift).toEqual({
      start: utc("2026-10-25T08:00:00Z"),
      end: utc("2026-10-25T16:00:00Z"),
    });
  });
});

describe("the next open date", () => {
  it("skips closed days", () => {
    // 2026-11-07 is a Saturday; the fixture is open Monday to Friday.
    expect(nextOpenDate(dealership(), "2026-11-06")).toBe("2026-11-09");
  });
  it("is null when nothing opens within a month", () => {
    expect(nextOpenDate(dealership({ weeklyHours: {} }), MONDAY)).toBeNull();
  });
});
