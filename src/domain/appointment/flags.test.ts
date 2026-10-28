import { describe, expect, it } from "vitest";
import {
  MIN,
  appointment,
  at,
  dealership,
  technician,
} from "../availability/fixtures";
import { flagReason } from "./flag-reason";
import { flagKinds, withFlags } from "./flags";

const MONDAY_NIGHT = "2026-11-07";

describe("flagKinds (AD-14)", () => {
  const d = dealership();
  const t = technician("t1", {}, { start: "08:00", end: "17:00" });

  it("an appointment inside the hours and the shift has no flags", () => {
    expect(flagKinds({ start: at("09:00"), end: at("10:00") }, d, t)).toEqual(
      [],
    );
  });

  it("past closing is outside_opening_hours, and past the shift is outside_shift", () => {
    const late = { start: at("17:30"), end: at("18:30") };
    expect(flagKinds(late, d, t)).toEqual([
      "outside_opening_hours",
      "outside_shift",
    ]);
    expect(flagKinds({ start: at("16:30"), end: at("17:30") }, d, t)).toEqual([
      "outside_shift",
    ]);
  });

  it("a closed day is outside_opening_hours, and the shift is judged on its own", () => {
    const closed = dealership({ dateOverrides: { "2026-11-02": "closed" } });
    expect(
      flagKinds({ start: at("09:00"), end: at("10:00") }, closed, t),
    ).toEqual(["outside_opening_hours"]);
    // Saturday: no weekly hours and no shift.
    expect(
      flagKinds(
        { start: at("09:00", MONDAY_NIGHT), end: at("10:00", MONDAY_NIGHT) },
        d,
        t,
      ),
    ).toEqual(["outside_opening_hours", "outside_shift"]);
  });

  it("leave and a break count against the shift", () => {
    const onLeave = technician("t1", {
      shiftExceptions: { "2026-11-02": { kind: "leave" } },
    });
    expect(
      flagKinds({ start: at("09:00"), end: at("10:00") }, d, onLeave),
    ).toEqual(["outside_shift"]);
    const withBreak = technician(
      "t1",
      {},
      {
        start: "08:00",
        end: "17:00",
        breakStart: "12:00",
        breakEnd: "13:00",
      },
    );
    expect(
      flagKinds({ start: at("11:30"), end: at("12:30") }, d, withBreak),
    ).toEqual(["outside_shift"]);
  });
});

describe("an unknown technician", () => {
  it("has no shift, so the appointment gets outside_shift and nothing throws", () => {
    const a = appointment("a1", "gone", "b1", at("09:00"), at("10:00"));
    expect(flagKinds(a, dealership(), undefined)).toEqual(["outside_shift"]);
    expect(withFlags(a, dealership(), undefined, 5 * MIN).flags).toEqual([
      { kind: "outside_shift", since: 5 * MIN },
    ]);
  });
});

describe("withFlags (AD-14, D-0001-22 c)", () => {
  const d = dealership();
  const t = technician("t1");

  it("gives back the same object when the flags do not change", () => {
    const a = appointment("a1", "t1", "b1", at("09:00"), at("10:00"));
    expect(withFlags(a, d, t, 5 * MIN)).toBe(a);
  });

  it("adds a flag with the time it was raised and does not touch version, status or updatedAt", () => {
    const a = appointment("a1", "t1", "b1", at("17:30"), at("18:30"));
    const flagged = withFlags(a, d, t, 5 * MIN);
    expect(flagged).toEqual({
      ...a,
      flags: [
        { kind: "outside_opening_hours", since: 5 * MIN },
        { kind: "outside_shift", since: 5 * MIN },
      ],
    });
  });

  it("a flag that stays keeps its since, and one that no longer applies is dropped", () => {
    const a = appointment("a1", "t1", "b1", at("16:30"), at("17:30"), {
      flags: [
        { kind: "outside_opening_hours", since: 1 },
        { kind: "outside_shift", since: 2 },
      ],
    });
    expect(withFlags(a, d, t, 9 * MIN).flags).toEqual([
      { kind: "outside_shift", since: 2 },
    ]);
  });
});

describe("flagReason (D-0001-34)", () => {
  const d = dealership();
  const at1 = (hhmm: string) => at(hhmm);
  const shift = { start: "08:00", end: "13:00" };
  const t = technician("t1", { name: "Ash" }, shift);

  it("says the shift ends before the booking does", () => {
    expect(
      flagReason(
        "outside_shift",
        { start: at1("12:00"), end: at1("13:45") },
        d,
        t,
      ),
    ).toBe("Ash's shift ends at 13:00; this booking ends at 13:45.");
  });

  it("says the shift starts after the booking starts", () => {
    expect(
      flagReason(
        "outside_shift",
        { start: at1("07:30"), end: at1("08:30") },
        d,
        t,
      ),
    ).toBe("Ash's shift starts at 08:00; this booking starts at 07:30.");
  });

  it("says when the technician is not working that day, or is unknown", () => {
    const leave = technician(
      "t1",
      { name: "Ash", shiftExceptions: { "2026-11-02": { kind: "leave" } } },
      shift,
    );
    const slot = { start: at1("09:00"), end: at1("10:00") };
    expect(flagReason("outside_shift", slot, d, leave)).toBe(
      "Ash is not working on 2026-11-02.",
    );
    expect(flagReason("outside_shift", slot, d, undefined)).toBe(
      "The technician for this booking can no longer be found.",
    );
  });

  it("says the booking overlaps the technician's break", () => {
    const withBreak = technician(
      "t1",
      { name: "Ash" },
      { start: "08:00", end: "17:00", breakStart: "12:00", breakEnd: "13:00" },
    );
    expect(
      flagReason(
        "outside_shift",
        { start: at1("11:30"), end: at1("12:30") },
        d,
        withBreak,
      ),
    ).toBe("Ash is on a break during this booking.");
  });

  it("says the opening hours, or that the dealership is closed", () => {
    const late = { start: at1("17:30"), end: at1("18:30") };
    expect(flagReason("outside_opening_hours", late, d, t)).toBe(
      "The dealership is open 08:00 to 18:00 that day; this booking runs 17:30 to 18:30.",
    );
    const closed = dealership({ dateOverrides: { "2026-11-02": "closed" } });
    expect(flagReason("outside_opening_hours", late, closed, t)).toBe(
      "The dealership is closed on 2026-11-02.",
    );
  });
});
