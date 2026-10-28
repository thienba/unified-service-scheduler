// Simple fakes of the ports, for tests. The real logger and counters come with the telemetry ticket.
import type { EpochMs } from "../../domain/model";
import type { Clock, IdGenerator } from "./clock";
import type {
  CounterName,
  HistogramName,
  LogFields,
  Logger,
  MetricLabels,
  Metrics,
  StepName,
} from "./telemetry";

export interface FakeClock extends Clock {
  set(now: EpochMs): void;
}

export function createFakeClock(start: EpochMs): FakeClock {
  let current = start;
  return { now: () => current, set: (now) => (current = now) };
}

export function createFakeIds(prefix = "id"): IdGenerator {
  let count = 0;
  return { next: () => `${prefix}-${++count}` };
}

export type LogCall =
  | { kind: "info"; msg: string; fields: LogFields }
  | { kind: "step"; name: StepName };

export interface FakeLogger extends Logger {
  calls: LogCall[];
  steps(): StepName[];
}

export function createFakeLogger(): FakeLogger {
  const calls: LogCall[] = [];
  return {
    calls,
    steps: () =>
      calls.flatMap((call) => (call.kind === "step" ? [call.name] : [])),
    info: (msg, fields = {}) => {
      calls.push({ kind: "info", msg, fields });
    },
    step: async (name, work) => {
      calls.push({ kind: "step", name });
      return work();
    },
  };
}

export interface FakeMetrics extends Metrics {
  counters: { name: CounterName; labels: MetricLabels }[];
  observations: { name: HistogramName; value: number; labels: MetricLabels }[];
  count(name: CounterName): number;
}

export function createFakeMetrics(): FakeMetrics {
  const counters: FakeMetrics["counters"] = [];
  const observations: FakeMetrics["observations"] = [];
  return {
    counters,
    observations,
    count: (name) => counters.filter((c) => c.name === name).length,
    increment: (name, labels) => {
      counters.push({ name, labels });
    },
    observe: (name, value, labels) => {
      observations.push({ name, value, labels });
    },
  };
}
