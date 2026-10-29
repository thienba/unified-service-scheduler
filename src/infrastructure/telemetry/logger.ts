// The logger of AD-12: JSON lines to the console and to a ring buffer for the dev panel. A line is built
// from a fixed list of fields, so a name, phone, email, registration or note a caller passes by mistake
// is dropped, not written.
import type {
  LogFields,
  Logger,
  StepName,
} from "../../application/ports/telemetry";

export const ALLOWED_FIELDS = [
  "traceId",
  "route",
  "method",
  "status",
  "durationMs",
  "dealershipId",
  "actorRole",
  "outcome",
  "code",
  "reasons",
  "appointmentId",
  "technicianId",
  "serviceBayId",
  "candidates",
] as const satisfies readonly (keyof LogFields)[];

export const BUFFER_SIZE = 500;

export type LogLevel = "info" | "error";
export type LogLine = { ts: string; level: LogLevel; msg: string } & LogFields;

export interface TelemetryLogger extends Logger {
  /** The newest lines, oldest first. */
  lines(): LogLine[];
}

export interface LoggerOptions {
  now: () => number;
  /** Where each finished JSON line goes. The default is the console. */
  write?: (level: LogLevel, line: string) => void;
}

const toConsole = (level: LogLevel, line: string): void => {
  if (level === "error") console.error(line);
  else console.info(line);
};

export function createLogger(options: LoggerOptions): TelemetryLogger {
  const write = options.write ?? toConsole;
  const buffer: LogLine[] = [];

  function emit(
    level: LogLevel,
    msg: string,
    fields: LogFields,
    traceId: string | undefined,
  ): void {
    const line: LogLine = {
      ts: new Date(options.now()).toISOString(),
      level,
      msg,
    };
    const given: LogFields =
      traceId === undefined ? fields : { ...fields, traceId };
    for (const key of ALLOWED_FIELDS) {
      if (given[key] !== undefined) Object.assign(line, { [key]: given[key] });
    }
    buffer.push(line);
    if (buffer.length > BUFFER_SIZE) buffer.shift();
    write(level, JSON.stringify(line));
  }

  function make(traceId: string | undefined): TelemetryLogger {
    return {
      lines: () => [...buffer],
      info: (msg, fields = {}) => emit("info", msg, fields, traceId),
      error: (msg, fields = {}) => emit("error", msg, fields, traceId),
      async step<T>(name: StepName, work: () => Promise<T>): Promise<T> {
        const began = options.now();
        try {
          return await work();
        } finally {
          emit(
            "info",
            `step.${name}`,
            { durationMs: options.now() - began },
            traceId,
          );
        }
      },
      withTrace: (id) => make(id),
    };
  }
  return make(undefined);
}
