import { describe, expect, expectTypeOf, it } from "vitest";
import type { Actor } from "../actor";
import * as commands from "./index";

type Exports = typeof commands;
/** For each export, the type of its first parameter (`never` for anything that is not a function). */
type FirstParam = {
  [K in keyof Exports]: Exports[K] extends (...args: infer P) => unknown
    ? P[0]
    : never;
};

describe("AD-3: every command takes an Actor first", () => {
  it("SEC-2.AC-2: the type of the first parameter of each exported command is Actor", () => {
    // Fails the build (typecheck) when a command is added whose first parameter is not an Actor.
    expectTypeOf<FirstParam[keyof FirstParam]>().toEqualTypeOf<Actor>();
    expect(Object.keys(commands).sort()).toEqual([
      "bookAppointment",
      "cancelAppointment",
      "rescheduleAppointment",
    ]);
  });
});
