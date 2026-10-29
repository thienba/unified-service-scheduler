// `reschedule` (customer.md 6, customer-reschedule.html, REQ-BOOK-012.AC-2, AC-3, AC-4): the owner picks a new
// time for the same appointment. Only the time changes (D-0001-24 A). The old time stays the appointment's time
// until the API answers the move; a "just taken" answer changes nothing and offers the closest times. One
// Confirm press is one Idempotency-Key, sent again on Try again (AD-5, REQ-BOOK-009.AC-4).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { startConfirmPress } from "../../../api/client";
import { ProblemState } from "../../app/states";
import { ActionBar } from "../../components/ActionBar";
import { Alert } from "../../components/Alert";
import { BookingSummary } from "../../components/BookingSummary";
import { Button } from "../../components/Button";
import { DayStrip } from "../../components/DayStrip";
import { query, useMediaQuery } from "../../components/hooks";
import { PageBack, PhoneLink, Plate } from "../../components/Small";
import { Skeleton, StateBlock } from "../../components/StateBlock";
import {
  HintBox,
  SuggestionGroup,
  TimeChipGrid,
  type GridTime,
  type SuggestedTime,
} from "../../components/TimeChipGrid";
import { useToast } from "../../components/Toast";
import { ApiProblem, call, type Dealership } from "../../data/api-problem";
import {
  addDaysToLocalDate,
  formatDay,
  formatDuration,
  formatLocalDate,
  formatTime,
  formatTimeRange,
  formatTimesCount,
  localDateIn,
} from "../../format/format";
import { useDealerships } from "../../session/dealership";
import { useSession } from "../../session/session";
import {
  dayNote,
  describeDay,
  groupCount,
  groupTimes,
  hoursOn,
  instantAt,
  lastDay,
  needsTimes,
  splitSuggestions,
  todayIn,
  weekDates,
  weekLabel,
  weekStartFor,
  type StripDay,
  type TimeSlot,
} from "../book/days";
import { availabilityKey, useWeekAvailability } from "../book/queries";
import { CustomerNotFound } from "../appointment/CustomerAppointmentPage";
import type { CustomerAppointmentState } from "../appointment/CustomerAppointmentPage";
import {
  carWords,
  isCancelled,
  leadWords,
  mayChangeOnline,
  type Appointment,
} from "../my-appointments/customer-appointment";

const START = "new-start";
const SUGGESTED = "suggested-new-start";
const SAME = "This stays the same";

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function addMinutes(instant: string, n: number): string {
  return new Date(Date.parse(instant) + n * 60_000)
    .toISOString()
    .replace(".000Z", "Z");
}

function referenceLine(problem: ApiProblem | null, connection: string): string {
  const reference = problem?.traceId?.slice(0, 8);
  if (problem === null || problem.status === 0) return connection;
  return reference
    ? `Try again; if it keeps happening, quote reference ${reference}.`
    : "Try again.";
}

export function ReschedulePage() {
  const { appointmentId = "" } = useParams();
  const { client } = useSession();
  const dealerships = useDealerships();
  const [refused, setRefused] = useState(false);
  const appointment = useQuery({
    queryKey: ["appointment", appointmentId],
    queryFn: () =>
      call(
        client.GET("/appointments/{appointmentId}", {
          params: { path: { appointmentId } },
        }),
      ),
  });

  const back = (
    <PageBack to={`/appointments/${appointmentId}`}>
      Back to the appointment
    </PageBack>
  );
  const failure = appointment.error ?? dealerships.error;
  if (failure) {
    const problem = failure instanceof ApiProblem ? failure : null;
    if (problem?.status === 404) {
      return (
        <div className="grid gap-4">
          {back}
          <CustomerNotFound />
        </div>
      );
    }
    if (problem !== null && problem.status !== 500 && problem.status !== 0) {
      return (
        <div className="grid gap-4">
          {back}
          <ProblemState error={problem} />
        </div>
      );
    }
    return (
      <div className="grid gap-4">
        {back}
        <StateBlock
          kind="error"
          title="We could not load this appointment."
          traceId={problem?.traceId}
          focusTitle
          actions={
            <Button
              icon="refresh"
              onClick={() => {
                void appointment.refetch();
                void dealerships.refetch();
              }}
            >
              Try again
            </Button>
          }
        >
          {problem === null || problem.status === 0
            ? "We could not reach the booking service, so we cannot show the times. Your appointment has not changed. Check your connection and try again."
            : `Something went wrong on our side, so we cannot show the times. Your appointment has not changed. ${referenceLine(problem, "")}`}
        </StateBlock>
      </div>
    );
  }

  const a = appointment.data;
  const dealership = dealerships.data?.find((d) => d.id === a?.dealershipId);
  if (!a || dealerships.isPending || !dealership) {
    return (
      <div className="grid gap-4">
        {back}
        <StateBlock
          kind="loading"
          loadingLabel="Loading the days and times"
          skeleton={<StripSkeleton />}
        />
      </div>
    );
  }

  // D-0001-60 A: a cancelled appointment cannot be moved; its own page says so in one quiet line.
  if (isCancelled(a)) {
    const state: CustomerAppointmentState = { alreadyCancelled: true };
    return <Navigate to={`/appointments/${a.id}`} replace state={state} />;
  }

  if (refused || !mayChangeOnline(a, dealership, Date.now())) {
    return (
      <div className="grid gap-4">
        {back}
        <StateBlock
          kind="info"
          title="This appointment can no longer be changed online."
          focusTitle
          actions={
            <Button variant="primary" to={`/appointments/${a.id}`}>
              Back to the appointment
            </Button>
          }
        >
          It starts in less than {leadWords(dealership)}. Contact{" "}
          {dealership.name} to change it.
          {dealership.phone && (
            <>
              {" "}
              <PhoneLink phone={dealership.phone} />
            </>
          )}{" "}
          Your appointment has not changed.
        </StateBlock>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {back}
      <Rescheduling
        key={a.id}
        appointment={a}
        dealership={dealership}
        onRefused={() => setRefused(true)}
      />
    </div>
  );
}

interface Conflict {
  start: string;
  end: string;
  suggestions: TimeSlot[];
}

interface Press {
  start: string;
  key: string;
}

function Rescheduling({
  appointment: a,
  dealership,
  onRefused,
}: {
  appointment: Appointment;
  dealership: Dealership;
  onRefused: () => void;
}) {
  const { client } = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const lg = useMediaQuery(query.lg);

  const now = Date.now();
  const zone = a.timeZone;
  const minutes = Math.round(
    (Date.parse(a.end) - Date.parse(a.start)) / 60_000,
  );
  const ownDate = localDateIn(a.start, zone);
  const today = todayIn(dealership, now);
  const thisYear = Number(today.slice(0, 4));

  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [start, setStart] = useState("");
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [failure, setFailure] = useState<ApiProblem | null>(null);
  const [gone, setGone] = useState(false);
  const [message, setMessage] = useState(0);
  const autoKey = useRef<string | null>(null);
  const pending = useRef<Press | null>(null);
  const busy = useRef(false);

  const week = weekStart ?? weekStartFor(today, ownDate);
  const dates = weekDates(week);
  const fetchDates = dates.filter((d) => needsTimes(dealership, d, now));
  const results = useWeekAvailability(
    dealership.id,
    a.serviceTypeId,
    fetchDates,
    a.transport,
  );
  const byDate = new Map(fetchDates.map((d, i) => [d, results[i]!]));
  const stripLoading = fetchDates.some((d) => byDate.get(d)!.isPending);
  const stripFailure = fetchDates
    .map((d) => byDate.get(d)!)
    .find((r) => r.isError && r.data === undefined)?.error;
  const days: StripDay[] = dates.map((d) =>
    describeDay(dealership, d, byDate.get(d)?.data?.slots, minutes, now),
  );
  const selected = days.find((d) => d.date === day);

  // The appointment's own day is chosen when the strip first loads; another week starts on its first open day.
  useEffect(() => {
    if (stripLoading || stripFailure || autoKey.current === week) return;
    autoKey.current = week;
    if (day && dates.includes(day)) return;
    const own = days.find((d) => d.date === ownDate && d.kind === "open");
    setDay((own ?? days.find((d) => d.kind === "open"))?.date ?? null);
  });

  const move = useMutation({
    mutationFn: ({ start: newStart, key }: Press) =>
      call(
        client.POST("/appointments/{appointmentId}/reschedule", {
          params: {
            path: { appointmentId: a.id },
            header: { "Idempotency-Key": key },
          },
          body: { start: newStart },
        }),
      ),
  });

  function chooseDay(date: string, fromPerson = true) {
    setDay(date);
    if (fromPerson) {
      // A count can be out of date: the chosen day asks again (state `empty-day`).
      void queryClient.refetchQueries({
        queryKey: availabilityKey(
          dealership.id,
          a.serviceTypeId,
          date,
          a.transport,
        ),
      });
    }
  }

  function chooseTime(value: string) {
    setStart(value);
    const date = localDateIn(value, zone);
    if (date !== day) {
      setWeekStart(weekStartFor(today, date));
      chooseDay(date, false);
    }
  }

  function send(press: Press) {
    busy.current = true;
    setFailure(null);
    move.mutate(press, {
      onSuccess: (moved: Appointment) => {
        pending.current = null;
        queryClient.setQueryData(["appointment", moved.id], moved);
        void queryClient.invalidateQueries({ queryKey: ["my-appointments"] });
        void queryClient.invalidateQueries({ queryKey: ["availability"] });
        toast.show({
          kind: "success",
          message: `Appointment moved to ${formatDay(moved.start, zone, now)}, ${formatTime(moved.start, zone)}. The old time is free again.`,
        });
        void navigate(`/appointments/${moved.id}`);
      },
      onError: (error) => {
        busy.current = false;
        const problem =
          error instanceof ApiProblem ? error : new ApiProblem(0, null, null);
        if (problem.code === "SLOT_UNAVAILABLE") {
          pending.current = null;
          setConflict({
            start: press.start,
            end: addMinutes(press.start, minutes),
            suggestions: problem.problem?.suggestions ?? [],
          });
          setStart("");
          setMessage((n) => n + 1);
          void queryClient.invalidateQueries({ queryKey: ["availability"] });
          return;
        }
        if (problem.code === "CHANGE_WINDOW_CLOSED") {
          onRefused();
          return;
        }
        if (problem.code === "ALREADY_CANCELLED") {
          // The page reads the appointment again and goes to its cancelled state (D-0001-60 A).
          void queryClient.invalidateQueries({
            queryKey: ["appointment", a.id],
          });
          return;
        }
        if (problem.status === 404) {
          setGone(true);
          return;
        }
        // 500, no answer, or anything else: Try again sends the same key (AD-5).
        setFailure(problem);
        setMessage((n) => n + 1);
      },
    });
  }

  function confirm() {
    if (busy.current || move.isPending || !start) return;
    setConflict(null);
    if (pending.current?.start !== start) {
      pending.current = { start, key: startConfirmPress().key };
    }
    send(pending.current);
  }

  if (gone) return <CustomerNotFound />;

  const confirming = move.isPending;
  const end = start ? addMinutes(start, minutes) : "";
  const chosenTime = start
    ? `${formatDay(start, zone, now)}, ${formatTimeRange(start, end, zone)}`
    : undefined;
  const current = `${formatDay(a.start, zone, now)}, ${formatTimeRange(a.start, a.end, zone)}`;
  const v = a.display.vehicle;
  const service = lowerFirst(a.display.serviceTypeName);

  const confirmButton = (
    <Button
      variant="primary"
      fullWidth={lg}
      loading={confirming}
      loadingLabel="Confirming…"
      disabled={!start && !confirming}
      onClick={confirm}
    >
      {start || confirming ? "Confirm new time" : "Pick a new time to confirm"}
    </Button>
  );

  return (
    <>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <div className="grid min-w-0 flex-1 content-start gap-6">
          <div>
            <h1 tabIndex={-1} className="text-2xl lg:text-3xl">
              Choose a new time for your {service}
            </h1>
            <p className="mt-2 max-w-(--measure) text-text-secondary">
              Your {service} takes about {formatDuration(minutes)}. Pick a day,
              then the time you want to arrive.
            </p>
          </div>

          <Alert
            kind="info"
            title="Your current time stays until the new one is confirmed."
          >
            <p>
              Right now you are booked for{" "}
              <span className="num">{current}</span>. If the new time is taken
              before you confirm, nothing changes.
            </p>
          </Alert>

          {conflict && (
            <ConflictAlert
              key={`c${message}`}
              conflict={conflict}
              current={current}
              dealership={dealership}
              zone={zone}
              now={now}
              value={start}
              onChoose={chooseTime}
            />
          )}

          {failure && (
            <Alert
              key={`f${message}`}
              kind="danger"
              role={null}
              focusTitle
              title={
                failure.status === 0
                  ? "We could not reach the booking service."
                  : "Something went wrong on our side."
              }
              actions={
                <Button
                  icon="refresh"
                  loading={confirming}
                  loadingLabel="Confirming…"
                  onClick={() => {
                    if (pending.current && !busy.current) send(pending.current);
                  }}
                >
                  Try again
                </Button>
              }
            >
              <p>
                Your appointment has not changed.{" "}
                {referenceLine(failure, "Check your connection and try again.")}
              </p>
            </Alert>
          )}

          <section aria-labelledby="days-title" className="grid gap-3">
            <h2 id="days-title" className="text-xl">
              Pick a day
            </h2>
            {stripFailure !== undefined ? (
              <StateBlock
                kind="error"
                compact
                headingLevel={3}
                title="We could not check the days."
                traceId={
                  stripFailure instanceof ApiProblem
                    ? stripFailure.traceId
                    : null
                }
                actions={
                  <Button
                    icon="refresh"
                    onClick={() => results.forEach((r) => void r.refetch())}
                  >
                    Try again
                  </Button>
                }
              >
                {stripFailure instanceof ApiProblem && stripFailure.status !== 0
                  ? `Something went wrong on our side, so we cannot show which days have room. Your appointment has not changed. ${referenceLine(stripFailure, "")}`
                  : "We could not reach the booking service, so we cannot show which days have room. Your appointment has not changed. Check your connection and try again."}
              </StateBlock>
            ) : stripLoading ? (
              <StateBlock
                kind="loading"
                loadingLabel="Loading the days and times"
                skeleton={<StripSkeleton />}
              />
            ) : (
              <DayStrip
                days={days.map((d) => ({
                  date: d.date,
                  kind: d.kind,
                  note: dayNote(d),
                  fill: d.fill,
                }))}
                value={selected?.kind === "open" ? day : null}
                onChange={(date) => chooseDay(date)}
                weekLabel={weekLabel(week, thisYear)}
                thisYear={thisYear}
                previous={{
                  disabled: week <= today,
                  reason: "You cannot book a day that has passed",
                  onClick: () => setWeekStart(addDaysToLocalDate(week, -7)),
                }}
                next={{
                  disabled:
                    addDaysToLocalDate(week, 7) > lastDay(dealership, now),
                  reason: `Bookings open up to ${dealership.policies.horizonDays} days ahead`,
                  onClick: () => setWeekStart(addDaysToLocalDate(week, 7)),
                }}
              />
            )}
          </section>

          {stripFailure === undefined && !stripLoading && (
            <section aria-labelledby="times-title" className="grid gap-3">
              <h2 id="times-title" tabIndex={-1} className="text-xl">
                Pick a start time
              </h2>
              <Times
                appointment={a}
                day={day}
                selected={selected}
                query={day ? byDate.get(day) : undefined}
                conflict={conflict}
                dealership={dealership}
                now={now}
                thisYear={thisYear}
                value={start}
                onChoose={chooseTime}
              />
            </section>
          )}
        </div>

        <div className="min-w-0 lg:sticky lg:top-4 lg:w-(--size-side) lg:shrink-0">
          <BookingSummary
            variant="reschedule"
            rows={[
              { term: "Dealership", value: dealership.name, note: SAME },
              {
                term: "Car",
                value: (
                  <>
                    {v.make} {v.model}, <Plate>{v.registration}</Plate>
                  </>
                ),
                note: SAME,
              },
              {
                term: "Service",
                value: `${a.display.serviceTypeName}, about ${formatDuration(minutes)}`,
                note: SAME,
              },
              { term: "The car", value: carWords[a.transport], note: SAME },
              {
                term: "Current time",
                value: current,
                note: "Kept until the new time is confirmed",
              },
              { term: "New time", value: chosenTime ?? null },
            ]}
            confirm={lg ? confirmButton : undefined}
          />
        </div>
      </div>
      <p role="status" className="sr-only">
        {confirming ? "Moving your appointment" : ""}
      </p>
      <ActionBar title={chosenTime} actions={lg ? undefined : confirmButton} />
    </>
  );
}

function StripSkeleton() {
  return (
    <>
      <div className="grid auto-cols-(--size-day) grid-flow-col gap-2 overflow-hidden sm:grid-flow-row sm:grid-cols-7">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="min-h-(--size-row) rounded-card" />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton
            key={i}
            className="min-h-(--size-target) min-w-(--size-chip) rounded-pill"
          />
        ))}
      </div>
    </>
  );
}

/** The chosen day's start times, with the appointment's own start as "Your time" (P4). */
function Times({
  appointment: a,
  day,
  selected,
  query: dayQuery,
  conflict,
  dealership,
  now,
  thisYear,
  value,
  onChoose,
}: {
  appointment: Appointment;
  day: string | null;
  selected: StripDay | undefined;
  query:
    | {
        data?: { slots: TimeSlot[] } | undefined;
        isError: boolean;
        error: unknown;
        refetch: () => unknown;
      }
    | undefined;
  conflict: Conflict | null;
  dealership: Dealership;
  now: number;
  thisYear: number;
  value: string;
  onChoose: (start: string) => void;
}) {
  const zone = a.timeZone;
  const label = (instant: string) => formatTime(instant, zone);
  if (!day || !selected) {
    return <HintBox>Pick a day above to see the start times.</HintBox>;
  }
  const dayText = formatLocalDate(day, thisYear);
  if (dayQuery?.isError) {
    const problem =
      dayQuery.error instanceof ApiProblem ? dayQuery.error : null;
    return (
      <StateBlock
        kind="error"
        compact
        headingLevel={3}
        title="We could not load the times."
        traceId={problem?.traceId}
        actions={
          <Button icon="refresh" onClick={() => void dayQuery.refetch()}>
            Try again
          </Button>
        }
      >
        {problem === null || problem.status === 0
          ? `We could not reach the booking service, so we cannot show the times for ${dayText}. Your appointment has not changed. Check your connection and try again.`
          : `Something went wrong on our side, so we cannot show the times for ${dayText}. Your appointment has not changed. ${referenceLine(problem, "")}`}
      </StateBlock>
    );
  }
  const slots = dayQuery?.data?.slots;
  if (!slots) {
    return (
      <StateBlock
        kind="loading"
        loadingLabel="Loading the times"
        skeleton={<StripSkeleton />}
      />
    );
  }
  const own = localDateIn(a.start, zone) === day;
  const struck =
    conflict && localDateIn(conflict.start, zone) === day ? conflict : null;
  const free = slots.filter(
    (s) => s.start !== struck?.start && !(own && s.start === a.start),
  );
  const times: GridTime[] = [...free];
  if (own) {
    times.push({
      start: a.start,
      end: a.end,
      unavailable: "Your time",
      own: true,
    });
  }
  if (struck) {
    times.push({
      start: struck.start,
      end: struck.end,
      unavailable: "Just taken",
    });
  }
  if (free.length === 0 && !struck) {
    return (
      <EmptyDay
        appointment={a}
        day={day}
        dealership={dealership}
        now={now}
        thisYear={thisYear}
        value={value}
        onChoose={onChoose}
      />
    );
  }
  const byStart = new Map(times.map((t) => [t.start, t]));
  const groups = groupTimes(
    times.map((t) => ({
      start: t.start,
      end: t.end,
      ...(t.unavailable ? { unavailable: "Just taken" as const } : {}),
    })),
    zone,
  ).map((g) => ({
    label: g.label,
    count: groupCount(g),
    times: g.times.map((t) => byStart.get(t.start)!),
  }));
  return (
    <>
      <p role="status" className="sr-only">
        {`${formatTimesCount(free.length)} on ${dayText}${own ? ", besides your own" : ""}`}
      </p>
      <TimeChipGrid
        groups={groups}
        value={value || null}
        onChange={onChoose}
        name={START}
        label={label}
      />
      {free.length === 0 && (
        <HintBox>No other times are left on {dayText}.</HintBox>
      )}
    </>
  );
}

/** `empty-day`: the count was out of date. The closest times on other days, from one availability check. */
function EmptyDay({
  appointment: a,
  day,
  dealership,
  now,
  thisYear,
  value,
  onChoose,
}: {
  appointment: Appointment;
  day: string;
  dealership: Dealership;
  now: number;
  thisYear: number;
  value: string;
  onChoose: (start: string) => void;
}) {
  const { client } = useSession();
  const zone = a.timeZone;
  const opening = hoursOn(dealership, day)?.open ?? "08:00";
  const nearest = useQuery({
    queryKey: ["closest", dealership.id, a.serviceTypeId, day, a.transport],
    queryFn: () =>
      call(
        client.POST("/availability-checks", {
          body: {
            dealershipId: dealership.id,
            serviceTypeId: a.serviceTypeId,
            start: instantAt(day, opening, zone),
            transport: a.transport,
          },
        }),
      ),
  });
  const answer = nearest.data;
  const items: SuggestedTime[] =
    answer && !answer.available
      ? answer.suggestions
          .filter((s) => s.start !== a.start)
          .map((s) => ({
            start: s.start,
            end: s.end,
            day: formatDay(s.start, zone, now),
          }))
      : [];
  return (
    <StateBlock
      kind="info"
      compact
      headingLevel={3}
      title={`No times left on ${formatLocalDate(day, thisYear)}.`}
    >
      <p className="mb-3">
        Someone booked the last one a moment ago. These are the closest times on
        other days:
      </p>
      <SuggestionGroup
        items={items}
        value={value || null}
        onChange={onChoose}
        name={SUGGESTED}
        label={(instant) => formatTime(instant, zone)}
        note="Closest times on other days"
      />
    </StateBlock>
  );
}

/** REQ-BOOK-012.AC-3: the time was taken first; the appointment has not changed. */
function ConflictAlert({
  conflict,
  current,
  dealership,
  zone,
  now,
  value,
  onChoose,
}: {
  conflict: Conflict;
  current: string;
  dealership: Dealership;
  zone: string;
  now: number;
  value: string;
  onChoose: (start: string) => void;
}) {
  const label = (instant: string) => formatTime(instant, zone);
  const conflictDay = localDateIn(conflict.start, zone);
  const toItem = (s: TimeSlot): SuggestedTime => ({
    start: s.start,
    end: s.end,
    day:
      localDateIn(s.start, zone) === conflictDay
        ? undefined
        : formatDay(s.start, zone, now),
  });
  const { closest, sameTime } = splitSuggestions(
    conflict.start,
    conflict.suggestions,
    zone,
  );
  return (
    // Focus moves to the heading, which announces it; a live role as well would read it twice.
    <Alert
      kind="warning"
      role={null}
      focusTitle
      title={`Sorry, ${formatTime(conflict.start, zone)} on ${formatDay(conflict.start, zone, now)} was just taken.`}
    >
      <p>
        Another customer confirmed that time a moment before you. Your
        appointment has not changed: it is still on{" "}
        <span className="num">{current}</span>. Pick another time and confirm
        again.
      </p>
      {conflict.suggestions.length === 0 ? (
        <>
          <h3 className="mt-2 text-base">
            There are no other times in the next 14 days.
          </h3>
          <p>
            Try another day, or contact {dealership.name}.
            {dealership.phone && (
              <>
                {" "}
                <PhoneLink phone={dealership.phone} />
              </>
            )}
          </p>
        </>
      ) : (
        <div className="mt-2 grid gap-4">
          {closest.length > 0 && (
            <SuggestionGroup
              title="Closest to your time"
              items={closest.map(toItem)}
              value={value || null}
              onChange={onChoose}
              name={`${SUGGESTED}-closest`}
              label={label}
            />
          )}
          {sameTime.length > 0 && (
            <SuggestionGroup
              title="Same time, another day"
              items={sameTime.map(toItem)}
              value={value || null}
              onChange={onChoose}
              name={`${SUGGESTED}-same-time`}
              label={label}
            />
          )}
        </div>
      )}
    </Alert>
  );
}
