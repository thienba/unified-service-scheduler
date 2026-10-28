// What the commands tell the outside world (architecture.md section 7.7, AD-12). The fields are an
// allow-list: a command cannot pass a name, phone, email or registration, because there is no field for one.
import type { Role } from "../../domain/model";

export interface LogFields {
  traceId?: string;
  route?: string;
  method?: string;
  status?: number;
  durationMs?: number;
  dealershipId?: string;
  actorRole?: Role;
  outcome?: string;
  code?: string;
  reasons?: string[];
  appointmentId?: string;
  technicianId?: string;
  serviceBayId?: string;
  candidates?: number;
}

/** The steps of a command, timed one by one (section 7.7). */
export type StepName = "load" | "check" | "write" | "suggest";

export interface Logger {
  info(msg: string, fields?: LogFields): void;
  /** Runs `work`, times it and logs it as a child step of the current trace. Returns what `work` returns. */
  step<T>(name: StepName, work: () => Promise<T>): Promise<T>;
}

export type CounterName =
  | "availability_search_empty_total"
  | "appointments_confirmed_total"
  | "appointment_conflicts_total"
  | "appointments_cancelled_total"
  | "idempotent_replays_total";

export type HistogramName = "availability_search_duration_ms";

export type MetricLabels = Record<string, string>;

export interface Metrics {
  increment(name: CounterName, labels: MetricLabels): void;
  observe(name: HistogramName, value: number, labels: MetricLabels): void;
}
