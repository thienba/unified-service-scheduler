import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import Dexie from "dexie";
import {
  createDexieRepository,
  type DexieRepository,
} from "./dexie-repository";
import { describeBookContract } from "../commands/book.contract";
import { describeChangeContract } from "../commands/change.contract";
import { describeManagerContract } from "../commands/manager.contract";
import { describeOutboxContract } from "../commands/outbox.contract";
import { describeRaceContract, raceOnce } from "../commands/race.contract";
import { appointmentsOf } from "../commands/fixtures";

vi.mock("../../../domain/availability", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../../domain/availability")>();
  return { ...original, checkStart: vi.fn(original.checkStart) };
});

let counter = 0;
const opened: { repo: DexieRepository; name: string }[] = [];
const freshName = () => `commands-test-${counter++}`;
function connect(name: string): DexieRepository {
  const repo = createDexieRepository(name);
  opened.push({ repo, name });
  return repo;
}

afterEach(async () => {
  for (const { repo, name } of opened.splice(0)) {
    repo.close();
    await Dexie.delete(name);
  }
});

const open = async () => connect(freshName());

describeBookContract("Dexie", open);
describeChangeContract("Dexie", open);
describeManagerContract("Dexie", open);
describeOutboxContract("Dexie", open);
describeRaceContract("Dexie", open);

describe("Dexie store, two connections", () => {
  it("REQ-BOOK-009.AC-1: two separate connections over fake-indexeddb store exactly one appointment", async () => {
    const name = freshName();
    const first = connect(name);
    const second = connect(name);
    const { results, stored } = await raceOnce(
      async () => first,
      async () => second,
    );
    expect(stored).toBe(1);
    expect(results.map((r) => r.kind).sort()).toEqual([
      "ok",
      "slot_unavailable",
    ]);
    expect(await appointmentsOf(second)).toHaveLength(1);
  });
});
