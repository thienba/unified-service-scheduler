import { describe, expect, it } from "vitest";
import {
  validateDealershipSettings,
  validateTechnicianShifts,
} from "./manager-settings";

const good = {
  weeklyHours: { 1: { open: "08:00", close: "18:00" } },
  dateOverrides: { "2026-11-03": "closed" },
  policies: { leadTimeMinutes: 0, horizonDays: 1, breakMinutes: 0 },
};
const fields = (errors: { field: string }[]) => errors.map((e) => e.field);

describe("validateDealershipSettings", () => {
  it("accepts good settings, including a zero lead time and a zero break", () => {
    expect(validateDealershipSettings(good)).toEqual([]);
  });

  it("names the field of each refused value", () => {
    expect(
      fields(
        validateDealershipSettings({
          weeklyHours: {
            8: { open: "08:00", close: "18:00" },
            2: "x",
            3: { open: "8", close: "99:00" },
          },
          dateOverrides: { today: "closed", "2026-11-04": 5 },
          policies: {
            leadTimeMinutes: "1",
            horizonDays: 0,
            breakMinutes: -1,
            x: 1,
          },
        }),
      ),
    ).toEqual([
      "weeklyHours.2",
      "weeklyHours.3.open",
      "weeklyHours.3.close",
      "weeklyHours.8",
      "dateOverrides.today",
      "dateOverrides.2026-11-04",
      "policies.x",
      "policies.leadTimeMinutes",
      "policies.horizonDays",
      "policies.breakMinutes",
    ]);
  });

  it("asks for every part, and refuses a body that is not an object", () => {
    expect(fields(validateDealershipSettings({}))).toEqual([
      "weeklyHours",
      "dateOverrides",
      "policies",
    ]);
    expect(fields(validateDealershipSettings(null))).toEqual(["body"]);
  });
});

describe("validateTechnicianShifts", () => {
  const shift = { start: "08:00", end: "17:00" };

  it("accepts a pattern with a break and a leave and a changed shift", () => {
    expect(
      validateTechnicianShifts(
        {
          shiftPattern: {
            1: { ...shift, breakStart: "12:00", breakEnd: "13:00" },
          },
          shiftExceptions: {
            "2026-11-03": { kind: "leave" },
            "2026-11-04": { kind: "changed", shift },
          },
        },
        15,
      ),
    ).toEqual([]);
  });

  it("asks for both parts, and refuses a body that is not an object", () => {
    expect(fields(validateTechnicianShifts({}, 15))).toEqual([
      "shiftPattern",
      "shiftExceptions",
    ]);
    expect(fields(validateTechnicianShifts([], 15))).toEqual(["body"]);
  });

  it("a break before its shift, and a shift with bad times, name the field", () => {
    expect(
      fields(
        validateTechnicianShifts(
          {
            shiftPattern: {
              1: { start: "x", end: "17:00" },
              2: { ...shift, breakStart: "12:00", breakEnd: "x" },
            },
            shiftExceptions: {},
          },
          15,
        ),
      ),
    ).toEqual(["shiftPattern.1.start", "shiftPattern.2.breakEnd"]);
  });
});
