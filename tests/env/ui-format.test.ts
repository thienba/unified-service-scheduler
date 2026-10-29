// The format helpers (AD-9, S4). `npm run test:tz` runs this file under UTC and Pacific/Kiritimati: the answers
// must not change with the machine's zone.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  addDaysToLocalDate,
  formatDay,
  formatDuration,
  formatDurationShort,
  formatLocalDate,
  formatTime,
  formatTimeRange,
  formatTimesCount,
  localDateIn,
  placeOfZone,
  zoneNote,
} from "../../src/ui/format/format";

const London = "Europe/London";
const now = Date.parse("2026-10-28T12:00:00Z");

describe("dates and times, in the dealership's zone", () => {
  it("2026-10-30T10:00 in London is 'Fri 30 Oct' and '10:00'", () => {
    expect(formatDay("2026-10-30T10:00:00Z", London, now)).toBe("Fri 30 Oct");
    expect(formatTime("2026-10-30T10:00:00Z", London)).toBe("10:00");
  });
  it("shows the dealership's day, not the viewer's, near midnight", () => {
    expect(formatDay("2026-10-30T23:30:00Z", "Asia/Ho_Chi_Minh", now)).toBe(
      "Sat 31 Oct",
    );
    expect(formatTime("2026-10-30T23:30:00Z", "Asia/Ho_Chi_Minh")).toBe(
      "06:30",
    );
  });
  it("adds the year when it is not this year", () => {
    expect(formatDay("2027-01-05T09:00:00Z", London, now)).toBe(
      "Tue 5 Jan 2027",
    );
    expect(formatLocalDate("2026-10-30", 2026)).toBe("Fri 30 Oct");
    expect(formatLocalDate("2027-01-05", 2026)).toBe("Tue 5 Jan 2027");
  });
  it("writes a range with 'to' on a 24-hour clock", () => {
    expect(
      formatTimeRange("2026-10-30T10:00:00Z", "2026-10-30T13:00:00Z", London),
    ).toBe("10:00 to 13:00");
    expect(formatTime("2026-10-30T00:05:00Z", London)).toBe("00:05");
  });
  it("moves local dates by calendar days", () => {
    expect(addDaysToLocalDate("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysToLocalDate("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("clock-change days in Europe/London", () => {
  const hoursOn = (date: string, from: string) => {
    let count = 0;
    for (
      let t = Date.parse(from);
      t < Date.parse(from) + 26 * 3_600_000;
      t += 3_600_000
    ) {
      if (localDateIn(t, London) === date) count += 1;
    }
    return count;
  };
  it("2026-03-29 has 23 hours and the clock jumps from 00:59 to 02:00", () => {
    expect(hoursOn("2026-03-29", "2026-03-28T23:30:00Z")).toBe(23);
    expect(formatTime("2026-03-29T00:59:00Z", London)).toBe("00:59");
    expect(formatTime("2026-03-29T01:00:00Z", London)).toBe("02:00");
  });
  it("2026-10-25 has 25 hours and 01:30 happens twice", () => {
    expect(hoursOn("2026-10-25", "2026-10-24T22:30:00Z")).toBe(25);
    expect(formatTime("2026-10-25T00:30:00Z", London)).toBe("01:30");
    expect(formatTime("2026-10-25T01:30:00Z", London)).toBe("01:30");
  });
});

describe("durations and counts", () => {
  it("a 3-hour job: '3 hours' in a sentence and '3h' in a tight spot", () => {
    expect(formatDuration(180)).toBe("3 hours");
    expect(formatDurationShort(180)).toBe("3h");
  });
  it("90 minutes is '1h 30m' (and '1 hour 30 minutes' in a sentence)", () => {
    expect(formatDurationShort(90)).toBe("1h 30m");
    expect(formatDuration(90)).toBe("1 hour 30 minutes");
    expect(formatDuration(45)).toBe("45 minutes");
    expect(formatDurationShort(45)).toBe("45m");
  });
  it("18 slots are '18 times'", () => {
    expect(formatTimesCount(18)).toBe("18 times");
    expect(formatTimesCount(1)).toBe("1 time");
  });
});

describe("the zone note", () => {
  it("names the dealership's place when the viewer's zone differs, and says nothing when it is the same", () => {
    expect(placeOfZone("Asia/Ho_Chi_Minh")).toBe("Ho Chi Minh");
    expect(zoneNote(London, "Asia/Ho_Chi_Minh")).toBe("(London time)");
    expect(zoneNote(London, "Asia/Ho_Chi_Minh", "sentence")).toBe(
      "Times are in London time.",
    );
    expect(zoneNote(London, London)).toBeNull();
  });
});

describe("no local-time calls in src/ui (AD-9)", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name))
        files.push(full);
    }
  };
  walk(path.resolve(import.meta.dirname, "../../src/ui"));
  it("nothing calls getHours, toLocale…String or getTimezoneOffset", () => {
    const bad = files.filter((f) =>
      /\.(getHours|getMinutes|getDate|getDay|getMonth|getFullYear|getTimezoneOffset|toLocaleString|toLocaleDateString|toLocaleTimeString)\(/.test(
        readFileSync(f, "utf8"),
      ),
    );
    expect(bad).toEqual([]);
  });
  it("only format.ts reads the browser's zone", () => {
    const readers = files.filter((f) =>
      readFileSync(f, "utf8").includes("resolvedOptions"),
    );
    expect(readers.map((f) => path.basename(f))).toEqual(["format.ts"]);
  });
});
