import { describe, expect, it } from "vitest";
import type { Appointment, Dealership } from "../../src/domain/model";
import { buildSeedData } from "../../src/infrastructure/seed/seed-loader";
import { createMemoryRepository } from "../../src/infrastructure/storage/memory/memory-repository";
import { createFakeClock } from "../../src/application/ports/fakes";
import {
  bayUtilisation,
  utilisationRatio,
} from "../../src/application/utilisation";

// Monday 2026-11-02, 09:00 in London (GMT).
const NOW = Date.parse("2026-11-02T09:00:00Z");

describe("bay_utilisation_ratio (section 7.7)", () => {
  it("1 of 2 bays booked for 4 of 8 opening hours reads 0.25", async () => {
    const seed = buildSeedData(NOW);
    const hours = { open: "08:00", close: "16:00" };
    const london: Dealership = {
      ...seed.dealerships.find((d) => d.id === "dealership-london")!,
      weeklyHours: { 1: hours, 2: hours, 3: hours, 4: hours, 5: hours },
    };
    const booked: Appointment = {
      ...seed.appointments[0]!,
      dealershipId: london.id,
      serviceBayId: "bay-lon-1",
      start: Date.parse("2026-11-02T10:00:00Z"),
      end: Date.parse("2026-11-02T14:00:00Z"),
    };
    const repository = createMemoryRepository();
    await repository.replaceAll(
      {
        ...seed,
        dealerships: [london],
        serviceBays: seed.serviceBays.filter(
          (b) => b.dealershipId === london.id,
        ),
        appointments: [booked],
      },
      1,
    );

    const samples = await bayUtilisation({
      uow: repository,
      clock: createFakeClock(NOW),
    });

    expect(samples.find((s) => s.labels.date === "2026-11-02")).toEqual({
      name: "bay_utilisation_ratio",
      labels: { dealershipId: "dealership-london", date: "2026-11-02" },
      value: 0.25,
    });
    // Seven days from today, minus the weekend when the dealership is closed.
    expect(samples.map((s) => s.labels.date)).toEqual([
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
    ]);
    expect(samples.slice(1).every((s) => s.value === 0)).toBe(true);
  });

  it("is 0 when there is nothing on offer, and ignores time outside opening hours", () => {
    expect(utilisationRatio(0, 480, 0)).toBe(0);
    expect(utilisationRatio(2, 480, 240)).toBe(0.25);
  });
});
