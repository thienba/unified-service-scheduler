import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import Dexie from "dexie";
import {
  describeStoreContract,
  appointment,
  bookOnce,
  fixtureSeed,
} from "../store-contract";
import {
  createDexieRepository,
  type DexieRepository,
} from "./dexie-repository";

let counter = 0;
const opened: { repo: DexieRepository; name: string }[] = [];
const freshName = () => `scheduler-test-${counter++}`;

function open(name: string): DexieRepository {
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

describeStoreContract("Dexie", async () => open(freshName()));

describe("Dexie store, over fake-indexeddb", () => {
  it("guarantee 1: two separate connections to one database never both commit an overlapping appointment", async () => {
    const name = freshName();
    const first = open(name);
    const second = open(name);
    await first.replaceAll(fixtureSeed(), 1);
    const results = await Promise.all([
      bookOnce(first, "a1"),
      bookOnce(second, "a2"),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([
      { ok: false, error: "SLOT_UNAVAILABLE" },
    ]);
    const all = await first.read((s) =>
      s.appointments.listByDealershipDay("d1", 0, Number.MAX_SAFE_INTEGER),
    );
    expect(all).toHaveLength(1);
  });

  it("an appointment is still there with all its fields after the database is closed and opened again", async () => {
    const name = freshName();
    const before = open(name);
    await before.replaceAll(fixtureSeed(), 1);
    const saved = appointment({
      flags: [{ kind: "outside_shift", since: 5 }],
      courtesyCarId: "car1",
      transport: "courtesy_car",
    });
    await before.write(async (s) => {
      await s.appointments.insert(saved);
      return { ok: true, value: null };
    });
    before.close();
    const after = open(name);
    expect(await after.read((s) => s.appointments.get("appt-1"))).toEqual(
      saved,
    );
    expect(await after.getSeedVersion()).toBe(1);
  });
});
