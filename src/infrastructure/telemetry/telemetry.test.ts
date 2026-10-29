import { afterEach, describe, expect, it, vi } from "vitest";
import type { LogFields } from "../../application/ports/telemetry";
import {
  BUFFER_SIZE,
  createLogger,
  type LogLevel,
  type TelemetryLogger,
} from "./logger";
import { HISTOGRAM_WINDOW, createMetrics } from "./metrics";
import { ALLOWED_FIELDS, ALLOWED_LABELS, createTelemetry } from "./index";

const TRACE = "4bf92f3577b34da6a3ce929d0e0e4736";

function setup() {
  const written: { level: LogLevel; line: string }[] = [];
  let clock = Date.parse("2026-11-03T09:14:02.120Z");
  const logger = createLogger({
    now: () => clock,
    write: (level, line) => written.push({ level, line }),
  });
  return { logger, written, tick: (ms: number) => (clock += ms) };
}

describe("the logger (NFR-6, AD-12)", () => {
  it("writes only the allowed fields: a name, phone, email, registration and note are dropped", () => {
    const { logger, written } = setup();
    const record = {
      traceId: TRACE,
      outcome: "ok",
      name: "Zz Canary Name",
      phone: "+0 000 0000",
      email: "canary@example.invalid",
      registration: "ZZ00 CNR",
      note: "free text",
    } as LogFields;
    logger.info("test", record);

    const line = JSON.parse(written[0]!.line) as Record<string, unknown>;
    expect(Object.keys(line).sort()).toEqual(
      ["level", "msg", "outcome", "traceId", "ts"].sort(),
    );
    expect(written[0]!.line).not.toMatch(/Canary|canary|000 0000|ZZ00|free/);
    expect(logger.lines()).toEqual([line]);
  });

  it("can write every allowed field, in a fixed order after ts, level and msg", () => {
    const { logger } = setup();
    logger.info("x", {
      candidates: 3,
      serviceBayId: "b",
      technicianId: "t",
      appointmentId: "a",
      reasons: ["BAY_BUSY"],
      code: "c",
      outcome: "o",
      actorRole: "staff",
      dealershipId: "d",
      durationMs: 5,
      status: 409,
      method: "POST",
      route: "POST /appointments",
      traceId: TRACE,
    });
    expect(Object.keys(logger.lines()[0]!)).toEqual([
      "ts",
      "level",
      "msg",
      ...ALLOWED_FIELDS,
    ]);
  });

  it("writes ts as a UTC instant and level error for error()", () => {
    const { logger, written } = setup();
    logger.error("bad");
    expect(JSON.parse(written[0]!.line)).toEqual({
      ts: "2026-11-03T09:14:02.120Z",
      level: "error",
      msg: "bad",
    });
    expect(written[0]!.level).toBe("error");
  });

  it("keeps the newest 500 lines: after 501 the first is gone and the 501st is present", () => {
    const { logger } = setup();
    for (let i = 1; i <= BUFFER_SIZE + 1; i++) logger.info(`line ${i}`);
    const lines = logger.lines();
    expect(lines).toHaveLength(500);
    expect(lines[0]!.msg).toBe("line 2");
    expect(lines.at(-1)!.msg).toBe("line 501");
  });

  it("withTrace puts the trace id on every line and shares the buffer", () => {
    const { logger } = setup();
    const traced = logger.withTrace(TRACE);
    traced.info("a");
    traced.error("b");
    logger.info("c");
    expect(logger.lines().map((l) => l.traceId)).toEqual([
      TRACE,
      TRACE,
      undefined,
    ]);
    expect((traced as TelemetryLogger).lines()).toEqual(logger.lines());
  });

  it("step logs a child line with the same trace id and its own duration, and returns the result", async () => {
    const { logger, tick } = setup();
    const result = await logger.withTrace(TRACE).step("load", async () => {
      tick(7);
      return 42;
    });
    expect(result).toBe(42);
    expect(logger.lines()).toEqual([
      expect.objectContaining({
        msg: "step.load",
        traceId: TRACE,
        durationMs: 7,
      }),
    ]);
  });

  it("step logs the line and passes the error on when the work fails", async () => {
    const { logger } = setup();
    await expect(
      logger.step("write", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(logger.lines()[0]).toMatchObject({ msg: "step.write" });
  });
});

describe("the console sink", () => {
  afterEach(() => vi.restoreAllMocks());

  it("writes one JSON line to console.info, and errors to console.error", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { logger } = createTelemetry({ now: () => 0 });
    logger.info("hello", { traceId: TRACE });
    logger.error("oops");
    expect(JSON.parse(info.mock.calls[0]![0] as string)).toMatchObject({
      msg: "hello",
      traceId: TRACE,
    });
    expect(JSON.parse(error.mock.calls[0]![0] as string)).toMatchObject({
      level: "error",
    });
  });
});

describe("the metrics (section 7.7)", () => {
  it("counts by name and labels", () => {
    const metrics = createMetrics();
    metrics.increment("appointments_confirmed_total", {
      dealershipId: "d",
      actorRole: "customer",
    });
    metrics.increment("appointments_confirmed_total", {
      actorRole: "customer",
      dealershipId: "d",
    });
    metrics.increment("appointments_confirmed_total", {
      dealershipId: "e",
      actorRole: "customer",
    });
    expect(metrics.counters()).toEqual([
      {
        name: "appointments_confirmed_total",
        labels: { dealershipId: "d", actorRole: "customer" },
        value: 2,
      },
      {
        name: "appointments_confirmed_total",
        labels: { dealershipId: "e", actorRole: "customer" },
        value: 1,
      },
    ]);
  });

  it("drops a label that is not on the list", () => {
    const metrics = createMetrics();
    metrics.increment("idempotent_replays_total", {
      route: "POST /appointments",
      phone: "+0 000 0000",
    });
    expect(metrics.counters()[0]!.labels).toEqual({
      route: "POST /appointments",
    });
    expect(ALLOWED_LABELS).not.toContain("phone");
  });

  it("a histogram reports count, sum, p50, p95 and max", () => {
    const metrics = createMetrics();
    const labels = { dealershipId: "d", kind: "day" };
    for (let v = 1; v <= 100; v++) {
      metrics.observe("availability_search_duration_ms", v, labels);
    }
    metrics.observe("availability_search_duration_ms", 5, {
      dealershipId: "d",
      kind: "check",
    });
    expect(metrics.histograms()).toEqual([
      {
        name: "availability_search_duration_ms",
        labels,
        count: 100,
        sum: 5050,
        p50: 50,
        p95: 95,
        max: 100,
      },
      {
        name: "availability_search_duration_ms",
        labels: { dealershipId: "d", kind: "check" },
        count: 1,
        sum: 5,
        p50: 5,
        p95: 5,
        max: 5,
      },
    ]);
  });

  it("keeps count, sum and max for every value but percentiles for the newest window", () => {
    const metrics = createMetrics();
    const labels = { route: "r", method: "GET", outcome: "ok" };
    metrics.observe("http_request_duration_ms", 9999, labels);
    for (let i = 0; i < HISTOGRAM_WINDOW; i++) {
      metrics.observe("http_request_duration_ms", 1, labels);
    }
    expect(metrics.histograms()[0]).toMatchObject({
      count: HISTOGRAM_WINDOW + 1,
      sum: 9999 + HISTOGRAM_WINDOW,
      max: 9999,
      p50: 1,
      p95: 1,
    });
  });
});
