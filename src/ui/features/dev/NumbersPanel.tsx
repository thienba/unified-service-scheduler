// "Numbers": the four numbers of NFR-6 as calm lists (manager.md 4.6, 5.6). No gauge, sparkline or hero number.
import type { ReactNode } from "react";
import { Badge } from "../../components/Badge";
import { formatTime } from "../../format/format";
import { counted, type Numbers, type SearchNumbers } from "./telemetry";

function Verdict({ search }: { search: SearchNumbers }) {
  if (search.targetMs === null) return <>No target set.</>;
  const target = `Target: under ${search.targetMs}\u00a0ms`;
  if (search.count === 0) return <>{target}</>;
  return (
    <>
      {target}{" "}
      {search.slowest < search.targetMs ? (
        <Badge variant="confirmed" icon="check" small>
          Within target
        </Badge>
      ) : (
        <Badge variant="danger" icon="alert" small>
          Over target
        </Badge>
      )}
    </>
  );
}

function SearchRow({ search }: { search: SearchNumbers }) {
  return (
    <div className="grid gap-1 border-dashed border-border-subtle py-2 not-first:border-t">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <b>{search.label}</b>
        <span className="num">
          {search.count === 0
            ? `No ${search.noun[1]} yet`
            : `${counted(search.count, search.noun)} · middle ${search.middle}\u00a0ms · slowest 5% from ${search.slowest}\u00a0ms`}
        </span>
      </p>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-secondary">
        <Verdict search={search} />
      </p>
    </div>
  );
}

function Metric({
  title,
  value,
  children,
}: {
  title: string;
  value?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="grid gap-1 border-border-subtle py-4 not-first:border-t">
      <h3 className="text-base">{title}</h3>
      {value !== undefined && <p className="text-lg">{value}</p>}
      {children}
    </div>
  );
}

export function NumbersPanel({
  numbers,
  since,
}: {
  numbers: Numbers;
  /** When this tab started counting. */
  since: number;
}) {
  const { confirmed, refused } = numbers;
  return (
    <section
      aria-labelledby="dev-numbers"
      className="grid min-w-0 content-start gap-4 rounded-card border border-border-subtle bg-surface p-5"
    >
      <h2 id="dev-numbers" className="text-xl">
        Numbers
      </h2>
      <p className="text-sm text-text-secondary">
        Counted in this browser tab since{" "}
        <span className="num">{formatTime(since, "UTC")}</span> UTC. Reloading
        the page clears them.
      </p>
      <div>
        <Metric title="Time to find free times">
          <div>
            {numbers.searches.map((search) => (
              <SearchRow key={search.kind} search={search} />
            ))}
          </div>
        </Metric>
        <Metric
          title="Bookings confirmed"
          value={
            <>
              <b className="num font-heading">{confirmed.total}</b>{" "}
              {confirmed.total === 1 ? "booking" : "bookings"}
            </>
          }
        >
          <p className="num text-sm text-text-secondary">
            {confirmed.byCustomers} by customers, {confirmed.byStaff} by staff.
          </p>
        </Metric>
        <Metric
          title="Times refused because they were just taken"
          value={
            <>
              <b className="num font-heading">{refused.total}</b> refused (409)
            </>
          }
        >
          {refused.reasons.length > 0 && (
            <p className="text-sm text-text-secondary">
              {refused.reasons.map((r) => `${r.words}: ${r.count}.`).join(" ")}
            </p>
          )}
        </Metric>
        <Metric
          title="Searches that found no free time"
          value={
            <>
              <b className="num font-heading">{numbers.emptySearches}</b>{" "}
              {numbers.emptySearches === 1 ? "search" : "searches"}
            </>
          }
        >
          <p className="text-sm text-text-secondary">
            A day with no free start time shows the closest times on other days.
          </p>
        </Metric>
      </div>
    </section>
  );
}
