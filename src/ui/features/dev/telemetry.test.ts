import { describe, expect, it } from "vitest";
import {
  counted,
  linesToShow,
  numbersOf,
  timeOfLine,
  type LogLine,
  type Telemetry,
} from "./telemetry";

const histogram = (kind: string, count: number, p50: number, p95: number) => ({
  name: "availability_search_duration_ms",
  labels: { dealershipId: "d-leeds", kind },
  count,
  sum: count * p50,
  p50,
  p95,
  max: p95,
});

const telemetry: Telemetry = {
  logs: [],
  counters: [
    {
      name: "appointments_confirmed_total",
      labels: { dealershipId: "d-leeds", actorRole: "customer" },
      value: 4,
    },
    {
      name: "appointments_confirmed_total",
      labels: { dealershipId: "d-leeds", actorRole: "staff" },
      value: 2,
    },
    {
      name: "appointments_confirmed_total",
      labels: { dealershipId: "d-hcmc", actorRole: "manager" },
      value: 1,
    },
    {
      name: "appointment_conflicts_total",
      labels: { dealershipId: "d-leeds", reason: "TECHNICIAN_BUSY" },
      value: 2,
    },
    {
      name: "appointment_conflicts_total",
      labels: { dealershipId: "d-leeds", reason: "BAY_BUSY" },
      value: 1,
    },
    {
      name: "appointments_refused_total",
      labels: { dealershipId: "d-leeds" },
      value: 2,
    },
    {
      name: "availability_search_empty_total",
      labels: { dealershipId: "d-leeds" },
      value: 2,
    },
    {
      name: "http_requests_total",
      labels: { route: "GET /me", method: "GET", status: "200" },
      value: 9,
    },
  ],
  histograms: [
    histogram("day", 40, 6, 14),
    {
      ...histogram("day", 2, 9, 61),
      labels: { dealershipId: "d-hcmc", kind: "day" },
    },
    histogram("check", 31, 3, 9.4),
  ],
  gauges: [
    {
      name: "bay_utilisation_ratio",
      labels: { dealershipId: "d-leeds", date: "2026-10-28" },
      value: 0.5,
    },
  ],
};

describe("numbersOf (NFR-6)", () => {
  const numbers = numbersOf(telemetry);

  it("adds the bookings up, with staff and the manager counted as staff", () => {
    expect(numbers.confirmed).toEqual({
      total: 7,
      byCustomers: 4,
      byStaff: 3,
    });
  });

  it("counts the 409s by reason, in the words of design.md section 9, most first; one 409 with two reasons is one refusal", () => {
    expect(numbers.refused).toEqual({
      total: 2,
      reasons: [
        {
          words: "Every technician who can do this job is busy then",
          count: 2,
        },
        { words: "Every service bay is in use then", count: 1 },
      ],
    });
  });

  it("counts the searches with no free time", () => {
    expect(numbers.emptySearches).toBe(2);
  });

  it("gives each search kind its count, middle and slowest 5%, the highest when two dealerships answered", () => {
    expect(numbers.searches).toEqual([
      expect.objectContaining({
        kind: "day",
        count: 42,
        middle: 9,
        slowest: 61,
        targetMs: 50,
      }),
      expect.objectContaining({
        kind: "check",
        count: 31,
        middle: 3,
        slowest: 9,
        targetMs: null,
      }),
      expect.objectContaining({
        kind: "suggest",
        count: 0,
        middle: 0,
        slowest: 0,
        targetMs: 200,
      }),
    ]);
  });

  it("says one or many", () => {
    expect(counted(1, ["search", "searches"])).toBe("1 search");
    expect(counted(5, ["check", "checks"])).toBe("5 checks");
  });
});

describe("linesToShow", () => {
  const line = (n: number, status?: number, traceId?: string): LogLine => ({
    ts: `2026-10-28T09:14:0${n}.120Z`,
    level: status !== undefined && status >= 500 ? "error" : "info",
    msg: `line.${n}`,
    ...(status !== undefined ? { status } : {}),
    ...(traceId ? { traceId } : {}),
  });
  const logs = [
    line(1, 200, "aaaaaaaa11111111aaaaaaaa11111111"),
    line(2, undefined, "4bf92f3577b34da6a3ce929d0e0e4736"),
    line(3, 409, "4bf92f3577b34da6a3ce929d0e0e4736"),
    line(4, 500, "cccccccc33333333cccccccc33333333"),
  ];

  it("puts the newest first", () => {
    expect(linesToShow(logs, "all", "").map((l) => l.msg)).toEqual([
      "line.4",
      "line.3",
      "line.2",
      "line.1",
    ]);
  });

  it("Problems only keeps status 400 and up", () => {
    expect(linesToShow(logs, "problems", "").map((l) => l.msg)).toEqual([
      "line.4",
      "line.3",
    ]);
  });

  it("a reference keeps every line of that trace, steps included, whatever its case and spaces", () => {
    expect(linesToShow(logs, "all", " 4BF92F35 ").map((l) => l.msg)).toEqual([
      "line.3",
      "line.2",
    ]);
  });

  it("the time of a line is its UTC time to the second", () => {
    expect(timeOfLine(logs[0]!)).toBe("09:14:01");
  });
});
