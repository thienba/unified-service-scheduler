// What the day strip and the time groups say (design.md 8.7, 8.8; REQ-BOOK-002, 007.AC-4, 011).
import { describe, expect, it } from "vitest";
import type { Dealership } from "../../data/api-problem";
import {
  closestOpenDays,
  dayNote,
  describeDay,
  groupCount,
  groupTimes,
  hoursOn,
  instantAt,
  lastDay,
  needsTimes,
  possibleStarts,
  splitSuggestions,
  weekDates,
  weekLabel,
  weekStartFor,
} from "./days";

const leeds: Dealership = {
  id: "d-leeds",
  name: "Northgate Motors",
  timeZone: "Europe/London",
  weeklyHours: {
    1: { open: "08:00", close: "18:00" },
    2: { open: "08:00", close: "18:00" },
    3: { open: "08:00", close: "18:00" },
    4: { open: "08:00", close: "18:00" },
    5: { open: "08:00", close: "18:00" },
    6: { open: "09:00", close: "16:00" },
  },
  dateOverrides: {
    "2026-10-30": "closed",
    "2026-10-31": { open: "10:00", close: "12:00" },
  },
  policies: {
    leadTimeMinutes: 120,
    horizonDays: 30,
    breakMinutes: 15,
    gridMinutes: 15,
  },
};

// Wed 28 Oct 2026, 10:40 in London (GMT).
const now = Date.parse("2026-10-28T10:40:00Z");
const slot = (start: string, end: string) => ({ start, end });

describe("hoursOn", () => {
  it("reads a date's own hours first, then the weekly hours; Sunday has none", () => {
    expect(hoursOn(leeds, "2026-10-30")).toBeNull();
    expect(hoursOn(leeds, "2026-10-31")).toEqual({
      open: "10:00",
      close: "12:00",
    });
    expect(hoursOn(leeds, "2026-11-02")).toEqual({
      open: "08:00",
      close: "18:00",
    });
    expect(hoursOn(leeds, "2026-11-01")).toBeNull();
  });
});

describe("describeDay and dayNote", () => {
  it("a day with free times says how many, and its fill is the share still free", () => {
    const day = describeDay(
      leeds,
      "2026-11-02",
      [slot("2026-11-02T08:00:00Z", "2026-11-02T11:00:00Z")],
      180,
      now,
    );
    expect(day.kind).toBe("open");
    expect(dayNote(day)).toBe("1 time");
    expect(day.fill).toBeCloseTo(1 / 29);
    expect(dayNote({ ...day, count: 18 })).toBe("18 times");
  });

  it("REQ-BOOK-007.AC-4: a closed date (override or weekly) reads Closed and needs no call", () => {
    expect(dayNote(describeDay(leeds, "2026-10-30", undefined, 180, now))).toBe(
      "Closed",
    );
    expect(dayNote(describeDay(leeds, "2026-11-01", undefined, 180, now))).toBe(
      "Closed",
    );
    expect(needsTimes(leeds, "2026-11-01", now)).toBe(false);
    expect(needsTimes(leeds, "2026-11-02", now)).toBe(true);
  });

  it("REQ-BOOK-011.AC-2: a day after today plus the horizon reads Too far ahead and needs no call", () => {
    expect(lastDay(leeds, now)).toBe("2026-11-27");
    expect(dayNote(describeDay(leeds, "2026-11-28", undefined, 60, now))).toBe(
      "Too far ahead",
    );
    expect(needsTimes(leeds, "2026-11-28", now)).toBe(false);
  });

  it("REQ-BOOK-011.AC-1: an open day with no times reads Too soon when the notice time leaves none, else Fully booked", () => {
    const late = Date.parse("2026-10-28T16:10:00Z");
    expect(dayNote(describeDay(leeds, "2026-10-28", [], 180, late))).toBe(
      "Too soon",
    );
    expect(dayNote(describeDay(leeds, "2026-10-28", [], 180, now))).toBe(
      "Fully booked",
    );
    expect(dayNote(describeDay(leeds, "2026-11-03", [], 180, now))).toBe(
      "Fully booked",
    );
    // At 23:30 the notice time ends tomorrow: today is too soon.
    const night = Date.parse("2026-10-28T23:30:00Z");
    expect(dayNote(describeDay(leeds, "2026-10-28", [], 60, night))).toBe(
      "Too soon",
    );
  });
});

describe("weeks", () => {
  it("weeks start on today in steps of seven days", () => {
    expect(weekDates("2026-10-28")).toHaveLength(7);
    expect(weekDates("2026-10-28")[6]).toBe("2026-11-03");
    expect(weekStartFor("2026-10-28", "2026-11-03")).toBe("2026-10-28");
    expect(weekStartFor("2026-10-28", "2026-11-04")).toBe("2026-11-04");
    expect(weekStartFor("2026-10-28", "2026-10-01")).toBe("2026-10-28");
    expect(weekLabel("2026-10-28", 2026)).toBe("Wed 28 Oct to Tue 3 Nov");
  });

  it("the closest days with times are the nearest first, never the day itself", () => {
    const open = (date: string) => ({
      date,
      kind: "open" as const,
      count: 3,
      fill: 0.1,
    });
    const days = [
      open("2026-10-29"),
      { date: "2026-11-01", kind: "closed" as const, count: 0, fill: 0 },
      open("2026-11-02"),
      open("2026-10-31"),
    ];
    expect(closestOpenDays(days, "2026-11-01").map((d) => d.date)).toEqual([
      "2026-10-31",
      "2026-11-02",
      "2026-10-29",
    ]);
  });
});

describe("time groups", () => {
  it("splits starts into Morning, Afternoon and Evening in the dealership's zone, and leaves empty groups out", () => {
    const groups = groupTimes(
      [
        slot("2026-10-30T13:00:00Z", "2026-10-30T16:00:00Z"),
        slot("2026-10-30T09:00:00Z", "2026-10-30T12:00:00Z"),
        slot("2026-10-30T10:00:00Z", "2026-10-30T13:00:00Z"),
      ],
      "Europe/London",
    );
    expect(groups.map((g) => g.label)).toEqual(["Morning", "Afternoon"]);
    expect(groups[0]!.times[0]!.start).toBe("2026-10-30T09:00:00Z");
    expect(groupCount(groups[0]!)).toBe("2 times");
    expect(groupCount(groups[1]!)).toBe("1 time");
    // The same instants in Ho Chi Minh City (UTC+7) are afternoon and evening.
    expect(
      groupTimes(
        [slot("2026-10-30T10:00:00Z", "2026-10-30T11:00:00Z")],
        "Asia/Ho_Chi_Minh",
      )[0]!.label,
    ).toBe("Evening");
  });

  it("a struck time does not count: Morning · none left", () => {
    expect(
      groupCount({
        label: "Morning",
        times: [{ start: "a", end: "b", unavailable: "Just taken" }],
      }),
    ).toBe("none left");
  });
});

describe("possibleStarts", () => {
  it("counts the grid steps from opening until the job still fits, in morning, afternoon and evening", () => {
    // 09:00 to 16:00 and 60 minutes: starts 09:00 to 15:00.
    expect(possibleStarts(leeds, "2026-11-07", 60)).toEqual([12, 13, 0]);
    // 08:00 to 18:00 and 60 minutes: starts 08:00 to 17:00.
    expect(possibleStarts(leeds, "2026-11-02", 60)).toEqual([16, 20, 1]);
  });

  it("is empty on a closed day", () => {
    expect(possibleStarts(leeds, "2026-11-01", 60)).toEqual([0, 0, 0]);
  });
});

describe("splitSuggestions", () => {
  it("moves the same clock time on other days to its own group, keeping the API's order", () => {
    const wanted = "2026-10-30T10:00:00Z";
    const result = splitSuggestions(
      wanted,
      [
        slot("2026-10-30T10:15:00Z", "2026-10-30T13:15:00Z"),
        slot("2026-10-31T10:00:00Z", "2026-10-31T13:00:00Z"),
        slot("2026-10-30T09:30:00Z", "2026-10-30T12:30:00Z"),
      ],
      "Europe/London",
    );
    expect(result.closest.map((s) => s.start)).toEqual([
      "2026-10-30T10:15:00Z",
      "2026-10-30T09:30:00Z",
    ]);
    expect(result.sameTime.map((s) => s.start)).toEqual([
      "2026-10-31T10:00:00Z",
    ]);
  });
});

describe("instantAt", () => {
  it("turns a local date and time into an instant, also on both sides of a clock change", () => {
    expect(instantAt("2026-10-30", "08:00", "Europe/London")).toBe(
      "2026-10-30T08:00:00Z",
    );
    expect(instantAt("2026-10-23", "08:00", "Europe/London")).toBe(
      "2026-10-23T07:00:00Z",
    );
    expect(instantAt("2026-10-30", "07:30", "Asia/Ho_Chi_Minh")).toBe(
      "2026-10-30T00:30:00Z",
    );
  });
});
