// What the dev panel shows, worked out from `GET /_demo/telemetry` (NFR-6, architecture.md section 7.7).
// Every number comes from the API's answer; the page only adds them up and puts them in words.
import type { components } from "../../../api/contract/schema";
import { referenceOf } from "../../components/StateBlock";
import { reasonInWords } from "../../data/words";

export type Telemetry = components["schemas"]["Telemetry"];
export type LogLine = components["schemas"]["LogLine"];

export type SearchKind = "day" | "check" | "suggest";

export interface SearchNumbers {
  kind: SearchKind;
  label: string;
  /** "searches" or "checks". */
  noun: [string, string];
  count: number;
  /** Middle and slowest 5%, in whole ms. */
  middle: number;
  slowest: number;
  /** The architecture's target (S7), when it sets one. */
  targetMs: number | null;
}

export interface Numbers {
  searches: SearchNumbers[];
  confirmed: { total: number; byCustomers: number; byStaff: number };
  refused: { total: number; reasons: { words: string; count: number }[] };
  emptySearches: number;
}

const kinds: {
  kind: SearchKind;
  label: string;
  noun: [string, string];
  targetMs: number | null;
}[] = [
  {
    kind: "day",
    label: "Day search",
    noun: ["search", "searches"],
    targetMs: 50,
  },
  {
    kind: "check",
    label: "Check one time",
    noun: ["check", "checks"],
    targetMs: null,
  },
  {
    kind: "suggest",
    label: "Closest times",
    noun: ["search", "searches"],
    targetMs: 200,
  },
];

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/** "1 search", "2 searches". */
export function counted(count: number, noun: [string, string]): string {
  return `${count} ${count === 1 ? noun[0] : noun[1]}`;
}

/** The first letter in capitals: a reason starts a sentence here. */
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function numbersOf(telemetry: Telemetry): Numbers {
  const counters = (name: string) =>
    telemetry.counters.filter((c) => c.name === name);

  const searches = kinds.map(({ kind, label, noun, targetMs }) => {
    const series = telemetry.histograms.filter(
      (h) =>
        h.name === "availability_search_duration_ms" && h.labels.kind === kind,
    );
    // One series per dealership. Their middles and slowest values cannot be merged exactly, so the
    // highest of each is shown: the panel never says a search was faster than it was.
    return {
      kind,
      label,
      noun,
      count: sum(series.map((s) => s.count)),
      middle: Math.round(Math.max(0, ...series.map((s) => s.p50))),
      slowest: Math.round(Math.max(0, ...series.map((s) => s.p95))),
      targetMs,
    };
  });

  const confirmed = counters("appointments_confirmed_total");
  const byCustomers = sum(
    confirmed
      .filter((c) => c.labels.actorRole === "customer")
      .map((c) => c.value),
  );
  const total = sum(confirmed.map((c) => c.value));

  const reasons = new Map<string, number>();
  for (const c of counters("appointment_conflicts_total")) {
    const words = sentence(reasonInWords(c.labels.reason ?? ""));
    reasons.set(words, (reasons.get(words) ?? 0) + c.value);
  }

  return {
    searches,
    confirmed: { total, byCustomers, byStaff: total - byCustomers },
    refused: {
      // A 409 can have several reasons, so the total is its own counter, not the sum of the reasons.
      total: sum(counters("appointments_refused_total").map((c) => c.value)),
      reasons: [...reasons.entries()]
        .map(([words, count]) => ({ words, count }))
        .sort((a, b) => b.count - a.count),
    },
    emptySearches: sum(
      counters("availability_search_empty_total").map((c) => c.value),
    ),
  };
}

export type LineFilter = "all" | "problems";

/** The 8 letters and digits a person reads out: the start of the trace id (AD-12). */
export const referenceOfLine = (line: LogLine): string | null =>
  line.traceId ? referenceOf(line.traceId) : null;

/** Newest first; "Problems only" keeps status 400 and up; a reference keeps the lines of that trace. */
export function linesToShow(
  logs: readonly LogLine[],
  filter: LineFilter,
  reference: string,
): LogLine[] {
  const wanted = reference.trim().toLowerCase();
  return [...logs]
    .reverse()
    .filter((line) => filter === "all" || (line.status ?? 0) >= 400)
    .filter((line) => wanted === "" || (line.traceId ?? "").startsWith(wanted));
}

/** "09:14:02": the time of a line, in UTC as the API wrote it. */
export const timeOfLine = (line: LogLine): string => line.ts.slice(11, 19);
