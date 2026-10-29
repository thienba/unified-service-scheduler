import { describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "../memory/memory-repository";
import { describeBookContract } from "./book.contract";
import { describeChangeContract } from "./change.contract";
import { describeRaceContract, raceOnce } from "./race.contract";

// The check is a spy that still runs the real one (REQ-BOOK-001.AC-2).
vi.mock("../../../domain/availability", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../../domain/availability")>();
  return { ...original, checkStart: vi.fn(original.checkStart) };
});

const open = async () => createMemoryRepository();

describeBookContract("in-memory", open);
describeChangeContract("in-memory", open);
describeRaceContract("in-memory", open);

describe("in-memory store, repeated race", () => {
  it("REQ-BOOK-009.AC-1: 100 races with fresh data give 0 double bookings", async () => {
    for (let run = 0; run < 100; run++) {
      const { winners, stored } = await raceOnce(open);
      expect(winners).toBe(1);
      expect(stored).toBe(1);
    }
  });
});
