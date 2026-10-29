import { describe, expect, it } from "vitest";
import type { Appointment } from "../model";
import { isBlocking } from "./blocking";
import { contains, intersect, overlaps, subtract } from "./interval";

const at = (hhmm: string) => Date.parse(`2026-11-03T${hhmm}:00Z`);

describe("overlaps", () => {
  it("an appointment ending at 10:00 does not overlap one starting at 10:00", () => {
    expect(
      overlaps(
        { start: at("09:00"), end: at("10:00") },
        { start: at("10:00"), end: at("11:00") },
      ),
    ).toBe(false);
    expect(
      overlaps(
        { start: at("10:00"), end: at("11:00") },
        { start: at("09:00"), end: at("10:00") },
      ),
    ).toBe(false);
  });

  it("a one-millisecond overlap counts", () => {
    expect(
      overlaps(
        { start: at("09:00"), end: at("10:00") + 1 },
        { start: at("10:00"), end: at("11:00") },
      ),
    ).toBe(true);
    expect(
      overlaps(
        { start: at("10:00"), end: at("11:00") },
        { start: at("09:00"), end: at("10:00") + 1 },
      ),
    ).toBe(true);
  });
});

describe("interval helpers", () => {
  const day = { start: at("08:00"), end: at("17:00") };
  it("contains: touching the edges is inside, one millisecond out is not", () => {
    expect(contains(day, { start: at("08:00"), end: at("17:00") })).toBe(true);
    expect(contains(day, { start: at("08:00"), end: at("17:00") + 1 })).toBe(
      false,
    );
    expect(contains(day, { start: at("08:00") - 1, end: at("09:00") })).toBe(
      false,
    );
  });
  it("intersect gives the shared part or null", () => {
    expect(intersect(day, { start: at("16:00"), end: at("18:00") })).toEqual({
      start: at("16:00"),
      end: at("17:00"),
    });
    expect(intersect(day, { start: at("17:00"), end: at("18:00") })).toBeNull();
  });
  it("subtract leaves zero, one or two parts", () => {
    expect(subtract(day, { start: at("12:00"), end: at("13:00") })).toEqual([
      { start: at("08:00"), end: at("12:00") },
      { start: at("13:00"), end: at("17:00") },
    ]);
    expect(subtract(day, { start: at("07:00"), end: at("09:00") })).toEqual([
      { start: at("09:00"), end: at("17:00") },
    ]);
    expect(subtract(day, { start: at("07:00"), end: at("18:00") })).toEqual([]);
    expect(subtract(day, { start: at("12:00"), end: at("12:00") })).toEqual([
      day,
    ]);
    expect(subtract(day, { start: at("18:00"), end: at("19:00") })).toEqual([
      day,
    ]);
  });
});

describe("isBlocking", () => {
  const appointment = (
    status: Appointment["status"],
    flags: Appointment["flags"] = [],
  ) => ({ status, flags });
  it("a confirmed appointment blocks and a cancelled one does not", () => {
    expect(isBlocking(appointment("confirmed"))).toBe(true);
    expect(isBlocking(appointment("cancelled"))).toBe(false);
  });
  it("a confirmed appointment with a flag still blocks", () => {
    for (const kind of ["outside_opening_hours", "outside_shift"] as const) {
      expect(isBlocking(appointment("confirmed", [{ kind, since: 0 }]))).toBe(
        true,
      );
    }
  });
});
