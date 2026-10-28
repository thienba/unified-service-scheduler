// AD-19, S7: over budget is a warning, not a failure.
import { describe, expect, it } from "vitest";
import { searchDay, suggest } from "./index";
import {
  MIN,
  MONDAY,
  NOW,
  appointment,
  at,
  bay,
  snapshot,
  technician,
} from "./fixtures";

function warnIfOver(label: string, budgetMs: number, run: () => void) {
  const began = performance.now();
  run();
  const took = performance.now() - began;
  process.stdout.write(
    `${label}: ${took.toFixed(1)} ms (budget ${budgetMs} ms)\n`,
  );
  if (took > budgetMs) {
    process.stderr.write(
      `WARNING: ${label} took ${took.toFixed(1)} ms, over ${budgetMs} ms\n`,
    );
  }
}

describe("timed: 10 technicians, 6 bays, 60 appointments (AD-19)", () => {
  const technicians = Array.from({ length: 10 }, (_, i) => technician(`t${i}`));
  const bays = Array.from({ length: 6 }, (_, i) => bay(`b${i}`));
  const appointments = Array.from({ length: 60 }, (_, i) => {
    const start = at("08:00") + (i % 10) * 60 * MIN;
    return appointment(
      `a${i}`,
      `t${i % 10}`,
      `b${i % 6}`,
      start,
      start + 45 * MIN,
    );
  });
  const s = snapshot({ technicians, bays, appointments });

  it("searchDay and suggest finish and report their time", () => {
    let starts: number[] = [];
    let times: number[] = [];
    warnIfOver("searchDay (one day)", 50, () => {
      starts = searchDay(s, { transport: "wait", date: MONDAY }, NOW);
    });
    warnIfOver("suggest (14 days)", 200, () => {
      times = suggest(s, { transport: "wait", start: at("10:00") }, NOW);
    });
    expect(starts.length).toBeGreaterThan(0);
    expect(times).toHaveLength(5);
  });
});
