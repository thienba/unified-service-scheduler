// The race of REQ-BOOK-009: two confirms for the last free technician and bay, started together.
import { describe, expect, it } from "vitest";
import { bookAppointment } from "../../../application/commands";
import type { CommandDeps } from "../../../application/deps";
import type { Repository } from "../../../application/ports";
import {
  KEY,
  OTHER_KEY,
  appointmentsOf,
  bookRequest,
  customerActor,
  makeDeps,
  seed,
  seededRepo,
} from "./fixtures";

/** Two confirms together on one repository; one free technician and one free bay. */
export async function raceOnce(
  open: () => Promise<Repository>,
  second?: () => Promise<Repository>,
) {
  const first = await seededRepo(open, seed(1, 1));
  const other = second ? await second() : first;
  const one = makeDeps(first);
  // Both sides share one id generator, as two requests of one app would.
  const deps2: CommandDeps = { ...makeDeps(other).deps, ids: one.deps.ids };
  const results = await Promise.all([
    bookAppointment(customerActor("c1"), one.deps, bookRequest(), KEY),
    bookAppointment(
      customerActor("c2"),
      deps2,
      bookRequest({ vehicleId: "v2" }),
      OTHER_KEY,
    ),
  ]);
  return {
    results,
    winners: results.filter((r) => r.kind === "ok").length,
    stored: (await appointmentsOf(first)).length,
  };
}

export function describeRaceContract(
  storeName: string,
  open: () => Promise<Repository>,
): void {
  describe(`booking race over the ${storeName} store`, () => {
    it("REQ-BOOK-009.AC-1: two confirms together for the last technician and bay give one ok, one slot_unavailable with reasons and suggestions, and one appointment", async () => {
      const { results, stored } = await raceOnce(open);
      expect(stored).toBe(1);
      expect(results.map((r) => r.kind).sort()).toEqual([
        "ok",
        "slot_unavailable",
      ]);
      const loser = results.find((r) => r.kind === "slot_unavailable");
      expect(loser).toMatchObject({
        reasons: expect.any(Array),
        suggestions: expect.any(Array),
      });
      expect((loser as { reasons: unknown[] }).reasons.length).toBeGreaterThan(
        0,
      );
    });
  });
}
