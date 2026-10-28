// "Recent requests": the newest log lines, each a `details` element that opens to its JSON (manager.md 4.6, 5.6).
// Every value is shown as text (SEC-11); the lines hold ids, routes and outcomes only (SEC-10, AD-12).
import { useEffect, useRef, useState } from "react";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { TextField } from "../../components/Fields";
import { SegmentedControl } from "../../components/SegmentedControl";
import {
  linesToShow,
  referenceOfLine,
  timeOfLine,
  type LineFilter,
  type LogLine,
} from "./telemetry";

const filters = [
  { value: "all", label: "All lines" },
  { value: "problems", label: "Problems only" },
] as const;

function CopyReference({ reference }: { reference: string }) {
  const [said, setSaid] = useState("");
  return (
    <>
      <Button
        variant="quiet"
        icon="copy"
        aria-label={`Copy reference ${reference}`}
        onClick={() => {
          const failed = () =>
            setSaid(`Could not copy. The reference is ${reference}.`);
          const clipboard = navigator.clipboard as Clipboard | undefined;
          if (!clipboard) {
            failed();
            return;
          }
          clipboard
            .writeText(reference)
            .then(() => setSaid(`Reference ${reference} copied`), failed);
        }}
      >
        Copy reference {reference}
      </Button>
      <span role="status" className="sr-only">
        {said}
      </span>
    </>
  );
}

/** A 4xx line is logged as "info" (the contract has info and error only), so its status carries the problem mark. */
function StatusAndTime({ line }: { line: LogLine }) {
  const ms =
    line.durationMs !== undefined
      ? `${Math.round(line.durationMs)}\u00a0ms`
      : undefined;
  if (line.status === undefined)
    return ms === undefined ? null : <span className="num">{ms}</span>;
  const text = `${line.status}${ms === undefined ? "" : ` · ${ms}`}`;
  if (line.status >= 400 && line.status < 500 && line.level !== "error")
    return (
      <span className="num">
        <Badge variant="flag" icon="alert" small>
          {text}
        </Badge>
      </span>
    );
  return <span className="num">{text}</span>;
}

function Line({
  line,
  onShowTrace,
}: {
  line: LogLine;
  onShowTrace: (reference: string) => void;
}) {
  const reference = referenceOfLine(line);
  const details = [
    line.route,
    line.outcome,
    line.reasons && line.reasons.length > 0
      ? line.reasons.join(", ")
      : undefined,
  ].filter((part): part is string => part !== undefined);
  const error = line.level === "error";
  return (
    <li className="border-t border-border-subtle">
      <details>
        <summary className="grid min-h-(--size-target) cursor-pointer list-none gap-1 px-1 py-3 hover:bg-surface-page focus-visible:-outline-offset-2 [&::-webkit-details-marker]:hidden">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="num">
              <b>{timeOfLine(line)}</b> UTC
            </span>
            <Badge
              variant={error ? "danger" : "plain"}
              icon={error ? "alert" : "info"}
              small
            >
              {line.level}
            </Badge>
            <b className="wrap-anywhere">{line.msg}</b>
            <StatusAndTime line={line} />
          </span>
          <span className="text-sm text-text-secondary wrap-anywhere">
            {[
              ...details,
              ...(reference ? [`reference ${reference}`] : []),
            ].join(" · ")}
          </span>
        </summary>
        <div className="grid gap-3 px-1 pb-4">
          <pre
            dir="ltr"
            tabIndex={0}
            role="region"
            aria-label={`Log line as JSON${reference ? `, reference ${reference}` : ""}`}
            className="m-0 rounded-control border border-border-subtle bg-surface-page p-3 font-mono text-sm leading-snug whitespace-pre-wrap wrap-anywhere"
          >
            {JSON.stringify(line, null, 2)}
          </pre>
          {reference && (
            <div className="flex flex-wrap gap-2">
              <CopyReference reference={reference} />
              <Button onClick={() => onShowTrace(reference)}>
                Show only this trace
              </Button>
            </div>
          )}
        </div>
      </details>
    </li>
  );
}

/** Lines have no id of their own: time, trace, message and how many came before with the same three. */
function keyed(lines: readonly LogLine[]): { key: string; line: LogLine }[] {
  const seen = new Map<string, number>();
  return lines.map((line) => {
    const base = `${line.ts}|${line.traceId ?? ""}|${line.msg}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { key: `${base}|${n}`, line };
  });
}

export function LogsPanel({ logs }: { logs: readonly LogLine[] }) {
  const [filter, setFilter] = useState<LineFilter>("all");
  const [reference, setReference] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const shown = linesToShow(logs, filter, reference);
  const count = `${shown.length} of ${logs.length} lines`;
  // Said once the person stops typing or changes the filter, not on each key or each refetch.
  const [announced, setAnnounced] = useState("");
  const latest = useRef(count);
  useEffect(() => {
    latest.current = count;
  });
  const asked = `${filter}|${reference}`;
  const lastAsked = useRef(asked);
  useEffect(() => {
    if (lastAsked.current === asked) return;
    const timer = setTimeout(() => {
      lastAsked.current = asked;
      setAnnounced(`Showing ${latest.current}`);
    }, 500);
    return () => clearTimeout(timer);
  }, [asked]);

  return (
    <section
      aria-labelledby="dev-logs"
      className="grid min-w-0 content-start gap-4 rounded-card border border-border-subtle bg-surface p-5"
    >
      <h2 id="dev-logs" className="text-xl">
        Recent requests
      </h2>
      <p className="text-sm text-text-secondary">
        The last 500 lines, newest first. Logs hold ids, routes and outcomes
        only. No names, phone numbers, emails or registrations are ever logged.
      </p>
      <div className="grid gap-4">
        <TextField
          ref={search}
          label="Find a reference"
          helper="Paste the 8 letters and digits from an error message, for example 4bf92f35."
          type="search"
          autoComplete="off"
          spellCheck={false}
          className="num"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
        <div>
          <SegmentedControl
            label="Show lines"
            options={filters}
            value={filter}
            onChange={(v) => setFilter(v as LineFilter)}
          />
        </div>
      </div>
      <p className="text-sm text-text-secondary">{count}</p>
      <p role="status" className="sr-only">
        {announced}
      </p>
      <ul aria-label="Log lines" className="m-0 list-none p-0">
        {keyed(shown).map(({ key, line }) => (
          <Line
            key={key}
            line={line}
            onShowTrace={(ref) => {
              setFilter("all");
              setReference(ref);
              search.current?.focus();
            }}
          />
        ))}
      </ul>
    </section>
  );
}
