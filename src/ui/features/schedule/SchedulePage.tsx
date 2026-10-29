// The `schedule` screen for staff and managers (design.md 6, staff.md 5.1, REQ-BOOK-004). The day comes
// from one API call; this file picks the view (timeline, list, one technician), the rows (technicians or
// bays) and the state (loading, error, closed, empty, past), all kept in the address.
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { mayBookForCustomer } from "../../app/guard";
import { ProblemState } from "../../app/states";
import { Alert } from "../../components/Alert";
import { Button } from "../../components/Button";
import { DayStepper } from "../../components/DayStepper";
import { query, useMediaQuery } from "../../components/hooks";
import { SegmentedControl } from "../../components/SegmentedControl";
import { Skeleton, StateBlock } from "../../components/StateBlock";
import { call, ApiProblem } from "../../data/api-problem";
import { describeProblem } from "../../data/words";
import { formatLocalDate, localDateIn } from "../../format/format";
import { useSelectedDealership } from "../../session/dealership";
import { useSession } from "../../session/session";
import { TimesNote } from "../../session/TimesNote";
import { FlaggedStrip } from "../flagged/FlaggedStrip";
import { DetailPanel } from "./DetailPanel";
import { OneDay } from "./OneDay";
import { ScheduleList } from "./ScheduleList";
import {
  dayAxis,
  factsText,
  listItems,
  refetchEvery,
  type Rows,
  type ScheduleDay,
} from "./schedule-model";
import { Legend, Timeline } from "./Timeline";

type View = "timeline" | "list" | "technician";

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date in `?date=`: "2026-13-45" is treated like no date at all. */
function isRealDate(text: string): boolean {
  if (!LOCAL_DATE.test(text)) return false;
  const at = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(at.getTime()) && at.toISOString().startsWith(text);
}

/** The current instant, again every half minute, so the Now line and "today" keep up. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function SchedulePage() {
  const { client, me } = useSession();
  const { selected } = useSelectedDealership();
  const [params, setParams] = useSearchParams();
  const wide = useMediaQuery(query.lg, true);
  const now = useNow();

  const zone = selected?.timeZone ?? "UTC";
  const today = localDateIn(now, zone);
  const asked = params.get("date");
  const date = asked && isRealDate(asked) ? asked : today;
  const rows: Rows = params.get("rows") === "bays" ? "bays" : "technicians";
  const askedView = params.get("view");
  // From 1024 wide the timeline is the default; below it the list (design.md section 3, rule 6).
  const view: View = wide
    ? askedView === "list"
      ? "list"
      : "timeline"
    : askedView === "technician"
      ? "technician"
      : "list";

  const set = (changes: Record<string, string | null>) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      for (const [key, value] of Object.entries(changes)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      return next;
    });

  const dealershipId = selected?.id;
  const day = useQuery({
    queryKey: ["schedule-day", dealershipId, date],
    queryFn: () =>
      call(
        client.GET("/dealerships/{dealershipId}/schedule", {
          params: { path: { dealershipId: dealershipId! }, query: { date } },
        }),
      ),
    enabled: dealershipId !== undefined,
    // Today is asked for again, so gaps whose time has passed go (D-0001-21).
    refetchInterval: refetchEvery(date, today),
  });

  const staff = me?.role === "staff";
  const canBook = me ? mayBookForCustomer(me.role) : false;
  const dayText = formatLocalDate(date, Number(today.slice(0, 4)));

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl lg:text-3xl">Schedule</h1>
          <TimesNote />
        </div>
        {/* Staff only: the manager's way to book waits on D-0001-54 (the staff-booking ticket). */}
        {staff && (
          <span className={wide ? undefined : "w-full"}>
            <Button
              variant="primary"
              icon="plus"
              to="/book/for-customer"
              fullWidth={!wide}
            >
              Book for a customer
            </Button>
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <DayStepper
          date={date}
          today={today}
          onChange={(d) => set({ date: d })}
        />
        <SegmentedControl
          label="Rows"
          value={rows}
          onChange={(v) => set({ rows: v, row: null })}
          options={[
            { value: "technicians", label: "Technicians" },
            { value: "bays", label: "Bays" },
          ]}
        />
        <SegmentedControl
          label="View"
          value={view}
          onChange={(v) => set({ view: v })}
          options={
            wide
              ? [
                  { value: "timeline", label: "Timeline" },
                  { value: "list", label: "List" },
                ]
              : [
                  { value: "list", label: "List" },
                  {
                    value: "technician",
                    label: rows === "technicians" ? "Technician" : "One bay",
                  },
                ]
          }
        />
      </div>
      {me?.role === "manager" && <FlaggedStrip dealershipId={dealershipId} />}
      {day.isPending ? (
        <Loading wide={wide} view={view} />
      ) : day.isError ? (
        <LoadError
          error={day.error}
          dayText={dayText}
          retry={() => void day.refetch()}
        />
      ) : (
        <Day
          key={`${dealershipId}-${date}`}
          day={day.data}
          dealershipName={selected?.name ?? ""}
          date={date}
          today={today}
          now={now}
          dayText={dayText}
          rows={rows}
          view={view}
          rowId={params.get("row")}
          onRow={(id) => set({ row: id })}
          onDate={(d) => set({ date: d })}
          staff={staff}
          canBook={canBook}
        />
      )}
    </div>
  );
}

function Loading({ wide, view }: { wide: boolean; view: View }) {
  const timeline = wide && view === "timeline";
  return (
    <StateBlock
      kind="loading"
      loadingLabel="Loading the schedule"
      skeleton={
        <>
          <Skeleton className="w-64" />
          <div
            className={
              timeline
                ? "grid overflow-hidden rounded-card border border-border-subtle bg-surface"
                : "grid"
            }
          >
            {Array.from({ length: 6 }, (_, i) =>
              timeline ? (
                <div
                  key={i}
                  className="flex h-(--size-row) items-center gap-4 border-t border-border-subtle px-4 first:border-t-0"
                >
                  <Skeleton className="w-40" />
                  <Skeleton className="h-12 w-1/4" />
                  <Skeleton className="h-12 w-1/3" />
                </div>
              ) : (
                <div
                  key={i}
                  className="grid min-h-(--size-row) content-center gap-2 border-t border-border-subtle px-2"
                >
                  <Skeleton className="w-3/4" />
                  <Skeleton className="w-11/12" />
                </div>
              ),
            )}
          </div>
        </>
      }
    />
  );
}

function LoadError({
  error,
  dayText,
  retry,
}: {
  error: unknown;
  dayText: string;
  retry: () => void;
}) {
  const words = describeProblem(error);
  if (words.kind !== "error")
    return <ProblemState error={error} retry={retry} />;
  return (
    <StateBlock
      kind="error"
      headingLevel={2}
      title={`We could not load the schedule for ${dayText}.`}
      traceId={error instanceof ApiProblem ? error.traceId : null}
      focusTitle
      actions={
        <Button variant="primary" icon="refresh" onClick={retry}>
          Try again
        </Button>
      }
    >
      Something went wrong on our side, so no appointments are shown. Nothing
      was changed.{" "}
      {words.reference
        ? `Try again; if it keeps happening, quote reference ${words.reference}.`
        : "Check your connection and try again."}
    </StateBlock>
  );
}

function Day({
  day,
  dealershipName,
  date,
  today,
  now,
  dayText,
  rows,
  view,
  rowId,
  onRow,
  onDate,
  staff,
  canBook,
}: {
  day: ScheduleDay;
  dealershipName: string;
  date: string;
  today: string;
  now: number;
  dayText: string;
  rows: Rows;
  view: View;
  rowId: string | null;
  onRow: (id: string) => void;
  onDate: (date: string) => void;
  staff: boolean;
  canBook: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const year = Number(today.slice(0, 4));
  const past = date < today;
  const closed = day.opening === null;
  const axis = dayAxis(day);
  const count = day.appointments.length;

  if (closed && count === 0) {
    const next = day.nextOpenDate;
    return (
      <StateBlock
        kind="info"
        headingLevel={2}
        title={`${dealershipName} is closed on ${dayText}.`}
        actions={
          <>
            {next && (
              <Button variant="primary" onClick={() => onDate(next)}>
                Go to {formatLocalDate(next, year)}
              </Button>
            )}
            {date !== today && (
              <Button onClick={() => onDate(today)}>Back to today</Button>
            )}
          </>
        }
      >
        Nothing can be booked on a closed day, so there is no timeline to show.
        The garage manager sets the opening hours.
      </StateBlock>
    );
  }

  const showGaps = rows === "technicians" && !past && !closed;
  const nowOnAxis = date === today ? now : null;
  const flagged = day.appointments.find((a) => a.flags.length > 0);
  const selected = day.appointments.find((a) => a.id === selectedId) ?? null;
  const showFlagged = view === "timeline" && flagged !== undefined;

  return (
    <>
      <p className="num flex flex-wrap items-center gap-x-3 text-text-secondary">
        <span>{factsText(day, rows, past)}</span>
        {showFlagged && (
          <Button
            variant="quiet"
            onClick={() => {
              setSelectedId(flagged.id);
              document
                .querySelector<HTMLElement>(
                  `[data-appointment="${flagged.id}"]`,
                )
                ?.focus();
            }}
          >
            Show flagged
          </Button>
        )}
      </p>
      {closed && (
        <Alert
          kind="warning"
          title={`${dealershipName} is closed on ${dayText}, but ${count === 1 ? "1 booking is" : `${count} bookings are`} still on it.`}
        >
          <p>
            {count === 1 ? "It is" : "They are"} flagged. The garage manager can
            move {count === 1 ? "it" : "them"}.
          </p>
        </Alert>
      )}
      {count === 0 && !past && (
        <StateBlock
          kind="empty"
          compact
          headingLevel={2}
          title={`Nothing is booked for ${dayText} yet.`}
          actions={
            staff ? (
              <Button variant="primary" icon="plus" to="/book/for-customer">
                Book for a customer
              </Button>
            ) : undefined
          }
        >
          Every technician is free during their shift. Book the first
          appointment for a customer, or tap a dashed time.
        </StateBlock>
      )}
      {axis &&
        (view === "timeline" ? (
          <div className="grid gap-4">
            <Timeline
              day={day}
              axis={axis}
              rows={rows}
              now={nowOnAxis}
              selectedId={selectedId}
              onSelect={setSelectedId}
              canBook={canBook}
            />
            <Legend
              rows={rows}
              showNow={nowOnAxis !== null}
              showGaps={showGaps}
            />
            <DetailPanel
              day={day}
              appointment={selected}
              manager={!staff}
              now={now}
            />
          </div>
        ) : view === "technician" ? (
          <OneDay
            day={day}
            axis={axis}
            rows={rows}
            rowId={rowId ?? ""}
            onRow={onRow}
            now={nowOnAxis}
            dayText={dayText}
            canBook={canBook}
            showGaps={showGaps}
          />
        ) : (
          <ScheduleList
            day={day}
            items={listItems(day, showGaps)}
            rows={rows}
            canBook={canBook}
          />
        ))}
    </>
  );
}
