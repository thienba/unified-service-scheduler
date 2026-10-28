import { expect, it } from "vitest";

// `npm run test:tz` runs the Node projects under two zones. This test shows each run
// saw its own zone. Minutes are what getTimezoneOffset returns: UTC is 0, Kiritimati is UTC+14.
// A date in 2025 is used because Kiritimati was at UTC-10:40 in 1970, so new Date(0) would give 640.
const offsetByZone: Record<string, number> = {
  UTC: 0,
  "Pacific/Kiritimati": -840,
};

it("sees the time zone that the run was started with", () => {
  const zone = process.env["TZ"];
  const offset = new Date(Date.UTC(2025, 0, 1)).getTimezoneOffset();
  if (zone === undefined) {
    expect(typeof offset).toBe("number");
    return;
  }
  expect(offsetByZone[zone]).toBeDefined();
  expect(offset).toBe(offsetByZone[zone]);
});
