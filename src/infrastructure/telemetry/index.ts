// The telemetry of AD-12 in one place: a logger, the metrics, and what the dev panel reads.
import type { Logger, Metrics } from "../../application/ports/telemetry";
import { createLogger, type LogLine, type LoggerOptions } from "./logger";
import {
  createMetrics,
  type CounterReading,
  type HistogramReading,
} from "./metrics";

export { ALLOWED_FIELDS, BUFFER_SIZE, type LogLine } from "./logger";
export {
  ALLOWED_LABELS,
  type CounterReading,
  type HistogramReading,
} from "./metrics";

/** What `GET /_demo/telemetry` reads. */
export interface TelemetryReader {
  lines(): LogLine[];
  counters(): CounterReading[];
  histograms(): HistogramReading[];
}

export interface Telemetry {
  logger: Logger;
  metrics: Metrics;
  reader: TelemetryReader;
}

export function createTelemetry(options: LoggerOptions): Telemetry {
  const logger = createLogger(options);
  const metrics = createMetrics();
  return {
    logger,
    metrics,
    reader: {
      lines: logger.lines,
      counters: metrics.counters,
      histograms: metrics.histograms,
    },
  };
}
