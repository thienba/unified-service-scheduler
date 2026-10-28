import { describe, expect, it } from "vitest";
import {
  addDays,
  dayBounds,
  instantAt,
  localDateOf,
  localTimeOf,
  weekdayOf,
} from ".";

const London = "Europe/London";
const HoChiMinh = "Asia/Ho_Chi_Minh";
const iso = (ms: number) => new Date(ms).toISOString();
const HOUR = 3_600_000;

describe("DST in Europe/London", () => {
  it("spring forward: a time in the gap moves to the first real instant after it", () => {
    // Clocks go from 01:00 GMT straight to 02:00 BST, so 01:30 does not exist.
    expect(iso(instantAt("2026-03-29", "01:30", London))).toBe(
      "2026-03-29T01:00:00.000Z",
    );
    // The first minute of the gap and the first real minute give the same instant.
    expect(instantAt("2026-03-29", "01:00", London)).toBe(
      instantAt("2026-03-29", "02:00", London),
    );
  });

  it("fall back: a time that happens twice uses the earlier one", () => {
    // 01:30 happens at 00:30 UTC (BST) and again at 01:30 UTC (GMT).
    expect(iso(instantAt("2026-10-25", "01:30", London))).toBe(
      "2026-10-25T00:30:00.000Z",
    );
  });

  it("a time on an ordinary day is the plain conversion", () => {
    expect(iso(instantAt("2026-07-01", "09:00", London))).toBe(
      "2026-07-01T08:00:00.000Z",
    );
    expect(iso(instantAt("2026-01-15", "09:00", London))).toBe(
      "2026-01-15T09:00:00.000Z",
    );
  });

  it("the spring-forward day is 23 hours and the fall-back day is 25 hours", () => {
    const spring = dayBounds("2026-03-29", London);
    const fall = dayBounds("2026-10-25", London);
    expect((spring.end - spring.start) / HOUR).toBe(23);
    expect((fall.end - fall.start) / HOUR).toBe(25);
  });

  it("an 08:00 opening starts at 08:00 GMT on the fall-back day and 08:00 BST the day before", () => {
    expect(iso(instantAt("2026-10-25", "08:00", London))).toBe(
      "2026-10-25T08:00:00.000Z",
    );
    expect(iso(instantAt("2026-10-24", "08:00", London))).toBe(
      "2026-10-24T07:00:00.000Z",
    );
  });

  it("a job is counted in real minutes across the change", () => {
    const start = instantAt("2026-10-25", "01:30", London); // 01:30 BST
    const end = start + 120 * 60_000;
    expect(iso(end)).toBe("2026-10-25T02:30:00.000Z");
    // 02:30 UTC is 02:30 on the GMT clock, so the job reads 01:30 to 02:30 but lasts two hours.
    expect(instantAt("2026-10-25", "02:30", London)).toBe(end);
  });

  it("localDateOf follows the zone, not the machine", () => {
    const instant = Date.parse("2026-07-01T23:30:00Z");
    expect(localDateOf(instant, London)).toBe("2026-07-02");
    expect(localDateOf(instant, "UTC")).toBe("2026-07-01");
  });
});

describe("Asia/Ho_Chi_Minh has no DST", () => {
  it("gives the same local times all year", () => {
    for (const date of [
      "2026-03-29",
      "2026-10-25",
      "2026-07-01",
      "2026-12-31",
    ]) {
      expect(iso(instantAt(date, "08:00", HoChiMinh))).toBe(
        `${date}T01:00:00.000Z`,
      );
      const bounds = dayBounds(date, HoChiMinh);
      expect((bounds.end - bounds.start) / HOUR).toBe(24);
    }
  });
});

describe("dates", () => {
  it("weekdayOf gives 1 for Monday and 7 for Sunday", () => {
    expect(weekdayOf("2026-11-02")).toBe(1);
    expect(weekdayOf("2026-11-08")).toBe(7);
  });

  it("addDays crosses month ends and goes backwards", () => {
    expect(addDays("2026-11-03", 30)).toBe("2026-12-03");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("localTimeOf", () => {
  it("gives the clock time in the zone, summer and winter", () => {
    const summer = Date.parse("2026-07-01T12:30:00Z");
    expect(localTimeOf(summer, "Europe/London")).toBe("13:30");
    expect(localTimeOf(summer, "Asia/Ho_Chi_Minh")).toBe("19:30");
    expect(
      localTimeOf(Date.parse("2026-01-01T09:05:00Z"), "Europe/London"),
    ).toBe("09:05");
  });
});
