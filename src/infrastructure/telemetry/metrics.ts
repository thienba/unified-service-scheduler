// The metrics of section 7.7, counted in memory in each tab. Labels come from a fixed list too, so a
// caller cannot put a name or a phone number in a label (SEC-10).
import type {
  CounterName,
  HistogramName,
  MetricLabels,
  Metrics,
} from "../../application/ports/telemetry";

export const ALLOWED_LABELS = [
  "route",
  "method",
  "status",
  "outcome",
  "dealershipId",
  "actorRole",
  "reason",
  "kind",
  "date",
] as const;

/** A histogram keeps the newest values for its percentiles; count, sum and max cover them all. */
export const HISTOGRAM_WINDOW = 1000;

export interface CounterReading {
  name: CounterName;
  labels: MetricLabels;
  value: number;
}

export interface HistogramReading {
  name: HistogramName;
  labels: MetricLabels;
  count: number;
  sum: number;
  p50: number;
  p95: number;
  max: number;
}

export interface MetricsReader {
  counters(): CounterReading[];
  histograms(): HistogramReading[];
}

interface Series {
  labels: MetricLabels;
  count: number;
  sum: number;
  max: number;
  recent: number[];
}

function allowed(labels: MetricLabels): MetricLabels {
  return Object.fromEntries(
    ALLOWED_LABELS.filter((key) => labels[key] !== undefined).map((key) => [
      key,
      labels[key]!,
    ]),
  );
}

/** The value below which `fraction` of the sorted values fall (nearest rank). */
function percentile(sorted: number[], fraction: number): number {
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)]!;
}

export function createMetrics(): Metrics & MetricsReader {
  const counters = new Map<string, CounterReading>();
  const histograms = new Map<string, { name: HistogramName; series: Series }>();

  return {
    increment(name, labels) {
      const clean = allowed(labels);
      const key = JSON.stringify([name, clean]);
      const found = counters.get(key);
      if (found) found.value += 1;
      else counters.set(key, { name, labels: clean, value: 1 });
    },
    observe(name, value, labels) {
      const clean = allowed(labels);
      const key = JSON.stringify([name, clean]);
      let found = histograms.get(key);
      if (!found) {
        found = {
          name,
          series: { labels: clean, count: 0, sum: 0, max: value, recent: [] },
        };
        histograms.set(key, found);
      }
      const { series } = found;
      series.count += 1;
      series.sum += value;
      series.max = Math.max(series.max, value);
      series.recent.push(value);
      if (series.recent.length > HISTOGRAM_WINDOW) series.recent.shift();
    },
    counters: () => [...counters.values()].map((c) => ({ ...c })),
    histograms: () =>
      [...histograms.values()].map(({ name, series }) => {
        const sorted = [...series.recent].sort((a, b) => a - b);
        return {
          name,
          labels: series.labels,
          count: series.count,
          sum: series.sum,
          p50: percentile(sorted, 0.5),
          p95: percentile(sorted, 0.95),
          max: series.max,
        };
      }),
  };
}
