import { describe, expect, it } from "vitest";
import { contains } from "../appointment/interval";
import type { Dealership, Technician } from "../model";
import { instantAt } from "../time";
import { earliestAllowedStart, lastAllowedDate } from "./lead-and-horizon";
import { openingWindow } from "./opening-window";
import { isTechnicianFree } from "./technician-free";
import { workSegments } from "./work-segments";

const London = "Europe/London";
const HoChiMinh = "Asia/Ho_Chi_Minh";
const utc = (text: string) => Date.parse(text);
const MIN = 60_000;

function dealership(overrides: Partial<Dealership> = {}): Dealership {
  return {
    id: "d1",
    name: "Test",
    timeZone: "UTC",
    weeklyHours: {
      1: { open: "08:00", close: "18:00" },
      2: { open: "08:00", close: "18:00" },
    },
    dateOverrides: {},
    policies: {
      leadTimeMinutes: 120,
      horizonDays: 30,
      breakMinutes: 15,
      gridMinutes: 15,
    },
    ...overrides,
  };
}

function technician(overrides: Partial<Technician> = {}): Technician {
  const shift = {
    start: "08:00",
    end: "17:00",
    breakStart: "12:00",
    breakEnd: "13:00",
  };
  return {
    id: "t1",
    dealershipId: "d1",
    name: "Tech",
    active: true,
    skills: ["mechanic"],
    shiftPattern: { 1: shift, 2: shift },
    shiftExceptions: {},
    ...overrides,
  };
}

// 2026-11-02 is a Monday.
const MONDAY = "2026-11-02";

describe("opening window", () => {
  it("differs by dealership for the same weekday", () => {
    const early = dealership();
    const late = dealership({
      weeklyHours: { 1: { open: "10:00", close: "20:00" } },
    });
    expect(openingWindow(early, MONDAY)).toEqual({
      start: utc("2026-11-02T08:00:00Z"),
      end: utc("2026-11-02T18:00:00Z"),
    });
    expect(openingWindow(late, MONDAY)).toEqual({
      start: utc("2026-11-02T10:00:00Z"),
      end: utc("2026-11-02T20:00:00Z"),
    });
  });

  it("with no override it is the weekly hours of that weekday", () => {
    expect(openingWindow(dealership(), "2026-11-03")?.end).toBe(
      utc("2026-11-03T18:00:00Z"),
    );
  });

  it("an override can extend or shorten the closing time", () => {
    const d = dealership({
      dateOverrides: {
        [MONDAY]: { open: "08:00", close: "20:00" },
        "2026-11-03": { open: "08:00", close: "16:00" },
      },
    });
    expect(openingWindow(d, MONDAY)?.end).toBe(utc("2026-11-02T20:00:00Z"));
    expect(openingWindow(d, "2026-11-03")?.end).toBe(
      utc("2026-11-03T16:00:00Z"),
    );
  });

  it("an override can open a day that has no weekly hours", () => {
    const d = dealership({
      dateOverrides: { "2026-11-07": { open: "09:00", close: "12:00" } },
    });
    expect(openingWindow(d, "2026-11-07")).toEqual({
      start: utc("2026-11-07T09:00:00Z"),
      end: utc("2026-11-07T12:00:00Z"),
    });
  });

  it("a closing override, or a weekday with no weekly hours, gives no window", () => {
    expect(
      openingWindow(
        dealership({ dateOverrides: { [MONDAY]: "closed" } }),
        MONDAY,
      ),
    ).toBeNull();
    expect(openingWindow(dealership(), "2026-11-08")).toBeNull();
  });

  it("follows DST: 08:00 is 08:00 GMT on the fall-back day and 08:00 BST the day before", () => {
    const d = dealership({
      timeZone: London,
      weeklyHours: {
        6: { open: "08:00", close: "17:00" },
        7: { open: "08:00", close: "17:00" },
      },
    });
    expect(openingWindow(d, "2026-10-25")?.start).toBe(
      utc("2026-10-25T08:00:00Z"),
    );
    expect(openingWindow(d, "2026-10-24")?.start).toBe(
      utc("2026-10-24T07:00:00Z"),
    );
  });

  it("gives the same local hours all year in Asia/Ho_Chi_Minh", () => {
    const d = dealership({
      timeZone: HoChiMinh,
      weeklyHours: { 1: { open: "08:00", close: "17:00" } },
    });
    expect(openingWindow(d, "2026-03-30")?.start).toBe(
      utc("2026-03-30T01:00:00Z"),
    );
    expect(openingWindow(d, "2026-10-26")?.start).toBe(
      utc("2026-10-26T01:00:00Z"),
    );
  });
});

describe("work segments", () => {
  const at = (hhmm: string) => utc(`2026-11-02T${hhmm}:00Z`);

  it("a shift 08:00 to 17:00 with a 12:00 to 13:00 break gives two segments", () => {
    expect(workSegments(technician(), dealership(), MONDAY)).toEqual([
      { start: at("08:00"), end: at("12:00") },
      { start: at("13:00"), end: at("17:00") },
    ]);
  });

  it("a shift without a break is one segment", () => {
    const t = technician({
      shiftPattern: { 1: { start: "08:00", end: "17:00" } },
    });
    expect(workSegments(t, dealership(), MONDAY)).toEqual([
      { start: at("08:00"), end: at("17:00") },
    ]);
  });

  it("the last segment ends at the shift end when the shift ends before closing", () => {
    const t = technician({
      shiftPattern: { 1: { start: "08:00", end: "15:00" } },
    });
    expect(workSegments(t, dealership(), MONDAY)).toEqual([
      { start: at("08:00"), end: at("15:00") },
    ]);
  });

  it("a shift that runs past closing is cut at closing, and one before opening is cut at opening", () => {
    const t = technician({
      shiftPattern: { 1: { start: "06:00", end: "21:00" } },
    });
    expect(workSegments(t, dealership(), MONDAY)).toEqual([
      { start: at("08:00"), end: at("18:00") },
    ]);
  });

  it("a shift wholly outside the opening window gives no segments", () => {
    const t = technician({
      shiftPattern: { 1: { start: "19:00", end: "22:00" } },
    });
    expect(workSegments(t, dealership(), MONDAY)).toEqual([]);
  });

  it("no shift on that weekday gives no segments", () => {
    expect(
      workSegments(
        technician(),
        dealership({ weeklyHours: { 3: { open: "08:00", close: "18:00" } } }),
        "2026-11-04",
      ),
    ).toEqual([]);
    expect(
      workSegments(technician({ shiftPattern: {} }), dealership(), MONDAY),
    ).toEqual([]);
  });

  it("a closed dealership gives no segments", () => {
    expect(
      workSegments(
        technician(),
        dealership({ dateOverrides: { [MONDAY]: "closed" } }),
        MONDAY,
      ),
    ).toEqual([]);
  });

  it("a leave exception removes the day", () => {
    const t = technician({ shiftExceptions: { [MONDAY]: { kind: "leave" } } });
    expect(workSegments(t, dealership(), MONDAY)).toEqual([]);
  });

  it("a changed exception gives the shift on a day with no pattern shift", () => {
    const t = technician({
      shiftPattern: {},
      shiftExceptions: {
        [MONDAY]: { kind: "changed", shift: { start: "09:00", end: "13:00" } },
      },
    });
    expect(workSegments(t, dealership(), MONDAY)).toEqual([
      { start: at("09:00"), end: at("13:00") },
    ]);
  });
});

describe("lead time and horizon", () => {
  it("with a 2-hour lead time and now 09:00, 10:00 is refused and 11:00 is allowed", () => {
    const now = utc("2026-11-03T09:00:00Z");
    const earliest = earliestAllowedStart(now, 120);
    expect(utc("2026-11-03T10:00:00Z") >= earliest).toBe(false);
    expect(utc("2026-11-03T11:00:00Z") >= earliest).toBe(true);
  });

  it("with a 30-day horizon and today 2026-11-03, 2026-12-03 is allowed and 2026-12-04 is not", () => {
    const now = utc("2026-11-03T09:00:00Z");
    const last = lastAllowedDate(now, "UTC", 30);
    expect(last).toBe("2026-12-03");
    expect("2026-12-03" <= last).toBe(true);
    expect("2026-12-04" <= last).toBe(false);
  });

  it("uses the dealership's local date, not the machine's", () => {
    // 20:00 UTC on 2026-11-03 is already 03:00 on 2026-11-04 in Ho Chi Minh City.
    const now = utc("2026-11-03T20:00:00Z");
    expect(lastAllowedDate(now, HoChiMinh, 30)).toBe("2026-12-04");
    expect(lastAllowedDate(now, "America/Los_Angeles", 30)).toBe("2026-12-03");
  });
});

describe("technician free test with a break", () => {
  const job = {
    start: utc("2026-11-02T09:00:00Z"),
    end: utc("2026-11-02T10:00:00Z"),
  };
  const candidate = (start: string, minutes = 60) => {
    const s = utc(`2026-11-02T${start}:00Z`);
    return { start: s, end: s + minutes * MIN };
  };

  it("a job ending at 10:00 blocks a start at 10:00 and 10:10, and allows 10:15", () => {
    expect(isTechnicianFree(candidate("10:00"), [job], 15)).toBe(false);
    expect(isTechnicianFree(candidate("10:10"), [job], 15)).toBe(false);
    expect(isTechnicianFree(candidate("10:15"), [job], 15)).toBe(true);
  });

  it("the break is also kept before the next job", () => {
    const next = {
      start: utc("2026-11-02T12:00:00Z"),
      end: utc("2026-11-02T13:00:00Z"),
    };
    expect(isTechnicianFree(candidate("10:45"), [next], 15)).toBe(true); // ends 11:45
    expect(isTechnicianFree(candidate("10:50"), [next], 15)).toBe(false); // ends 11:50
    expect(isTechnicianFree(candidate("11:00"), [next], 15)).toBe(false);
  });

  it("a job ending exactly at the end of the work segment is accepted; no break is needed after it", () => {
    const [, afternoon] = workSegments(technician(), dealership(), MONDAY);
    const lastJob = {
      start: utc("2026-11-02T16:00:00Z"),
      end: utc("2026-11-02T17:00:00Z"),
    };
    expect(afternoon).toBeDefined();
    expect(contains(afternoon!, lastJob)).toBe(true);
    expect(isTechnicianFree(lastJob, [job], 15)).toBe(true);
  });

  it("a changed break length gives a new answer and reads no stored appointment", () => {
    const jobs = [job];
    expect(isTechnicianFree(candidate("10:15"), jobs, 15)).toBe(true);
    expect(isTechnicianFree(candidate("10:15"), jobs, 30)).toBe(false);
    expect(jobs).toEqual([job]);
  });

  it("with no jobs the technician is free", () => {
    expect(isTechnicianFree(candidate("10:00"), [], 15)).toBe(true);
  });
});

describe("work segments across a DST day", () => {
  it("counts a 120-minute job in real minutes on the fall-back day", () => {
    const start = instantAt("2026-10-25", "01:30", London);
    expect(start).toBe(utc("2026-10-25T00:30:00Z"));
    expect(start + 120 * MIN).toBe(utc("2026-10-25T02:30:00Z"));
  });
});
