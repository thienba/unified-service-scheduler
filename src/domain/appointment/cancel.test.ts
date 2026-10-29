import { describe, expect, it } from "vitest";
import { customerMayChange } from "../policies/change-cutoff";
import { appointment, MIN } from "../availability/fixtures";
import { cancelled } from "./cancel";

describe("cancelled", () => {
  it("sets the status, cancelledAt and updatedAt, and raises version by 1, without touching the original", () => {
    const original = appointment("a1", "t1", "b1", 10 * MIN, 70 * MIN);
    const result = cancelled(original, 5 * MIN);
    expect(result).toEqual({
      ...original,
      status: "cancelled",
      cancelledAt: 5 * MIN,
      updatedAt: 5 * MIN,
      version: original.version + 1,
    });
    expect(original.status).toBe("confirmed");
  });
});

describe("customerMayChange (Q-0001-20 A, D-0001-22 a)", () => {
  const start = 14 * 60 * MIN;
  it("allows up to and including start - lead time, and not a millisecond later", () => {
    expect(customerMayChange(start, start - 120 * MIN, 120)).toBe(true);
    expect(customerMayChange(start, start - 120 * MIN + 1, 120)).toBe(false);
  });
});
