// The customer's `book` screen (customer.md section 4, design.md 6 and 8.7 to 8.9, 8.18). Dealership and
// service live in the address (`/book?dealership&service`, a dealer's website links here); the car, the
// time and the car choice live in the form. Everything read from the address is looked up in what the API
// returned and never shown as typed (SEC-12).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useNavigate, useSearchParams } from "react-router";
import { z } from "zod";
import { startConfirmPress } from "../../../api/client";
import { mayBookForCustomer } from "../../app/guard";
import { NoPermission } from "../../app/states";
import { ActionBar } from "../../components/ActionBar";
import { Alert } from "../../components/Alert";
import { BookingSummary } from "../../components/BookingSummary";
import { Button } from "../../components/Button";
import { DayStrip } from "../../components/DayStrip";
import { focusField, SelectField, type Choice } from "../../components/Fields";
import { query, useMediaQuery } from "../../components/hooks";
import { PhoneLink, Plate } from "../../components/Small";
import { Skeleton, StateBlock } from "../../components/StateBlock";
import {
  HintBox,
  SuggestionGroup,
  TimeChipGrid,
  type SuggestedTime,
} from "../../components/TimeChipGrid";
import { ApiProblem, call, type Dealership } from "../../data/api-problem";
import { describeProblem } from "../../data/words";
import { zodResolver } from "../../forms/resolver";
import {
  addDaysToLocalDate,
  formatDay,
  formatDuration,
  formatLocalDate,
  formatTime,
  formatTimeRange,
  formatTimesCount,
  localDateIn,
  placeOfZone,
} from "../../format/format";
import { useSelectedDealership } from "../../session/dealership";
import { useSession } from "../../session/session";
import {
  closestOpenDays,
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
  type ChipTime,
  type StripDay,
  type TimeSlot,
} from "./days";
import {
  availabilityKey,
  useServiceTypes,
  useVehicles,
  useWeekAvailability,
  type Appointment,
  type BookingRequest,
  type Transport,
} from "./queries";

const carMissing = "Car is missing. Choose which car is coming in.";
const choiceMissing = "Choose what you will do with the car.";

const schema = z.object({
  vehicleId: z.string().min(1, carMissing),
  start: z.string().min(1, "Pick a start time."),
  transport: z
    .string()
    .refine((v) => ["wait", "drop_off"].includes(v), choiceMissing),
});
type BookForm = z.infer<typeof schema>;

/** What the summary Alert says for each field (customer.md section 4, "Validation"). */
const summaryWords: Record<string, string> = {
  vehicleId: "Car: choose which car is coming in.",
  transport: "What you will do with the car: choose one.",
  start: "Time: pick a start time.",
};

/** One list of car choices: the courtesy-car ticket adds the third (D-0000-9). */
const transportChoices: Choice[] = [
  { value: "wait", label: "Wait on site", icon: "hourglass" },
  { value: "drop_off", label: "Drop it off", icon: "login" },
];

const START = "start";
const SUGGESTED = "suggested-start";

interface Conflict {
  kind: "taken" | "too-soon" | "too-far";
  start: string;
  end: string;
  suggestions: TimeSlot[];
}

interface Pending {
  body: BookingRequest;
  key: string;
}

const isDate = (value: string | null): value is string =>
  value !== null &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function BookPage() {
  const { me } = useSession();
  const [params] = useSearchParams();
  if (me === null) return null;
  if (me.role !== "customer") {
    // The staff version of this page is its own screen (staff.md, `book`); until a customer is chosen
    // there is nothing to book here.
    return (
      <NoPermission
        denied={mayBookForCustomer(me.role) ? "book-for-customer" : "schedule"}
        role={me.role}
      />
    );
  }
  const asked = params.get("customerId");
  if (asked !== null && asked !== me.customerId) return <ForOtherCustomer />;
  return <CustomerBooking customerId={me.customerId} />;
}

/** SEC-6.AC-1: a booking link for another customer. */
function ForOtherCustomer() {
  const { focusSwitcher } = useSession();
  return (
    <StateBlock
      kind="no-permission"
      title="You cannot do that as Customer."
      focusTitle
      actions={
        <>
          <Button variant="primary" to="/book">
            Book for myself
          </Button>
          <Button onClick={focusSwitcher}>Switch role</Button>
        </>
      }
    >
      Customers can only book for themselves, and this link is for a different
      customer. Garage staff book for customers from their own page. Switch
      role, or start a booking for yourself.
    </StateBlock>
  );
}

function CustomerBooking({ customerId }: { customerId: string | null }) {
  const { client } = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const lg = useMediaQuery(query.lg);
  const [params, setParams] = useSearchParams();
  const dealerships = useSelectedDealership();
  const services = useServiceTypes();
  const vehicles = useVehicles(customerId);

  const dealership = dealerships.selected;
  const service = services.data?.find((s) => s.id === params.get("service"));
  const ready = Boolean(dealership && service);

  // The dealer's website filled in both fields (state `deep-link`), as long as they stay as they came.
  const firstParams = useRef({
    dealership: params.get("dealership"),
    service: params.get("service"),
  });
  const fromWebsite =
    ready &&
    firstParams.current.dealership === dealership?.id &&
    firstParams.current.service === service?.id;

  const form = useForm<BookForm>({
    resolver: zodResolver(schema),
    defaultValues: { vehicleId: "", start: "", transport: "" },
    shouldFocusError: false,
  });
  const { register, setValue, setError, handleSubmit } = form;
  const errors = form.formState.errors;
  register("start");
  register("transport");
  const [vehicleId, start, transport] = useWatch({
    control: form.control,
    name: ["vehicleId", "start", "transport"],
  });

  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [linkDismissed, setLinkDismissed] = useState(false);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [failure, setFailure] = useState<ApiProblem | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [message, setMessage] = useState(0);
  const autoKey = useRef<string | null>(null);
  const pending = useRef<Pending | null>(null);
  const busy = useRef(false);

  const now = Date.now();
  const zone = dealership?.timeZone ?? "UTC";
  const today = dealership ? todayIn(dealership, now) : "";
  const thisYear = Number(today.slice(0, 4));
  const linkParam = params.get("date");
  const linkDate =
    dealership && isDate(linkParam) && linkParam >= today
      ? linkParam
      : undefined;
  const week =
    weekStart ?? (today ? weekStartFor(today, linkDate ?? today) : "");
  const dates = week ? weekDates(week) : [];
  const minutes = service?.durationMinutes ?? 0;
  const queryTransport: Transport = "wait";
  const fetchDates =
    dealership && service
      ? dates.filter((d) => needsTimes(dealership, d, now))
      : [];
  const results = useWeekAvailability(
    dealership?.id,
    service?.id,
    fetchDates,
    queryTransport,
  );
  const byDate = new Map(fetchDates.map((d, i) => [d, results[i]!]));
  const stripLoading = fetchDates.some((d) => byDate.get(d)!.isPending);
  const stripFailure = fetchDates
    .map((d) => byDate.get(d)!)
    .find((r) => r.isError && r.data === undefined)?.error;
  const days: StripDay[] = dealership
    ? dates.map((d) =>
        describeDay(dealership, d, byDate.get(d)?.data?.slots, minutes, now),
      )
    : [];
  const dayOf = (date: string | null) => days.find((d) => d.date === date);
  const linkDay = linkDate ? dayOf(linkDate) : undefined;
  const notice =
    !linkDismissed &&
    !stripLoading &&
    linkDay &&
    (linkDay.kind === "closed" ||
      linkDay.kind === "too-soon" ||
      linkDay.kind === "too-far")
      ? linkDay
      : undefined;

  // The first day with times is chosen when the strip first loads (design.md 8.7), or the linked day.
  const stripKey = `${dealership?.id}|${service?.id}|${week}`;
  useEffect(() => {
    if (!ready || stripLoading || stripFailure || autoKey.current === stripKey)
      return;
    autoKey.current = stripKey;
    if (day && dates.includes(day)) return;
    if (notice) return;
    const linked = linkDay?.kind === "open" ? linkDay : undefined;
    const first = linked ?? days.find((d) => d.kind === "open");
    setDay(first?.date ?? null);
  });

  const selected = dayOf(day);
  const selectedQuery = day ? byDate.get(day) : undefined;
  const timeLabel = (instant: string) => formatTime(instant, zone);
  const dayWords = (date: string) => formatLocalDate(date, thisYear);

  function resetChoice() {
    setValue("start", "");
    setConflict(null);
    setFailure(null);
    setDay(null);
    setWeekStart(null);
    setLinkDismissed(false);
    autoKey.current = null;
    pending.current = null;
  }

  function chooseDay(date: string, fromPerson = true) {
    setDay(date);
    setLinkDismissed(true);
    if (fromPerson && dealership && service) {
      // A count can be out of date: the chosen day asks again (state `empty-day`).
      void queryClient.refetchQueries({
        queryKey: availabilityKey(
          dealership.id,
          service.id,
          date,
          queryTransport,
        ),
      });
    }
  }

  function chooseTime(value: string) {
    setValue("start", value, { shouldValidate: form.formState.isSubmitted });
    const date = localDateIn(value, zone);
    if (date !== day && today) {
      setWeekStart(weekStartFor(today, date));
      chooseDay(date, false);
    }
  }

  const booking = useMutation({
    mutationFn: ({ body, key }: Pending) =>
      call(
        client.POST("/appointments", {
          params: { header: { "Idempotency-Key": key } },
          body,
        }),
      ),
  });

  function send(press: Pending) {
    busy.current = true;
    setFailure(null);
    booking.mutate(press, {
      onSuccess: (appointment: Appointment) => {
        pending.current = null;
        queryClient.setQueryData(["appointment", appointment.id], appointment);
        void queryClient.invalidateQueries({ queryKey: ["availability"] });
        void navigate(`/book/confirmed/${appointment.id}`);
      },
      onError: (error) => {
        busy.current = false;
        const problem =
          error instanceof ApiProblem ? error : new ApiProblem(0, null, null);
        if (problem.code === "SLOT_UNAVAILABLE") {
          pending.current = null;
          const reasons = problem.problem?.reasons ?? [];
          const kind = reasons.includes("TOO_SOON")
            ? "too-soon"
            : reasons.includes("BEYOND_HORIZON")
              ? "too-far"
              : "taken";
          setConflict({
            kind,
            start: press.body.start!,
            end: addMinutes(press.body.start!, minutes),
            suggestions: problem.problem?.suggestions ?? [],
          });
          setValue("start", "");
          setMessage((n) => n + 1);
          void queryClient.invalidateQueries({ queryKey: ["availability"] });
          if (kind === "too-far")
            void queryClient.invalidateQueries({ queryKey: ["dealerships"] });
          return;
        }
        if (problem.status === 403) {
          pending.current = null;
          setForbidden(true);
          return;
        }
        if (problem.status === 422 && problem.problem?.errors?.length) {
          pending.current = null;
          for (const e of problem.problem.errors) {
            setError(e.field as keyof BookForm, { message: e.message });
          }
          setMessage((n) => n + 1);
          return;
        }
        // 500, no answer, or anything else: Try again sends the same key (AD-5).
        setFailure(problem);
        setMessage((n) => n + 1);
      },
    });
  }

  function confirm() {
    if (busy.current || booking.isPending) return;
    busy.current = true;
    setConflict(null);
    void handleSubmit(
      (values) => {
        const body: BookingRequest = {
          dealershipId: dealership!.id,
          serviceTypeId: service!.id,
          vehicleId: values.vehicleId,
          start: values.start,
          transport: values.transport as Transport,
        };
        const same =
          pending.current &&
          JSON.stringify(pending.current.body) === JSON.stringify(body);
        if (!same) pending.current = { body, key: startConfirmPress().key };
        send(pending.current!);
      },
      () => {
        busy.current = false;
        setMessage((n) => n + 1);
      },
    )();
  }

  if (forbidden) return <ForOtherCustomer />;

  const noVehicle =
    customerId === null ||
    (vehicles.data !== undefined && vehicles.data.length === 0);
  const vehicle = vehicles.data?.find((v) => v.id === vehicleId);
  const loadFailure = services.error ?? vehicles.error;
  const confirming = booking.isPending;
  const needNewTime = conflict !== null && !start;
  const problems = (Object.keys(summaryWords) as (keyof BookForm)[])
    .filter((name) => errors[name])
    .map((name) => ({ name, words: summaryWords[name]! }));

  const confirmButton = (
    <Button
      variant="primary"
      fullWidth={lg}
      loading={confirming}
      loadingLabel="Confirming…"
      disabled={!start && !confirming}
      onClick={confirm}
    >
      {start || confirming
        ? "Confirm booking"
        : needNewTime
          ? "Pick a new time to confirm"
          : "Pick a time to confirm"}
    </Button>
  );

  const chosenTime =
    start && dealership
      ? `${formatDay(start, zone, now)}, ${formatTimeRange(start, addMinutes(start, minutes), zone)}`
      : undefined;

  const title = service
    ? `Choose a time for your ${lowerFirst(service.name)}`
    : "Book a service";
  const lede = service
    ? `Your ${lowerFirst(service.name)} takes about ${formatDuration(service.durationMinutes)}. Pick a day, then the time you want to arrive.`
    : "Tell us which car and which service. Then pick a day and a time.";

  return (
    <>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <div className="grid min-w-0 flex-1 content-start gap-6">
          <div>
            <h1 tabIndex={-1} className="text-2xl lg:text-3xl">
              {title}
            </h1>
            <p className="mt-2 max-w-(--measure) text-text-secondary">{lede}</p>
          </div>

          {problems.length > 0 && (
            <Alert
              key={`v${message}`}
              kind="danger"
              role={null}
              focusTitle
              title={`${problems.length === 1 ? "1 thing needs" : `${problems.length} things need`} fixing before we can book this.`}
            >
              <ul className="m-0 list-disc ps-5">
                {problems.map((p) => (
                  <li key={p.name}>
                    <a
                      href={`#field-${p.name}`}
                      onClick={(event) => {
                        event.preventDefault();
                        focusField(
                          p.name === "start"
                            ? "times-title"
                            : `field-${p.name}`,
                        );
                      }}
                    >
                      {p.words}
                    </a>
                  </li>
                ))}
              </ul>
            </Alert>
          )}

          {conflict && dealership && (
            <ConflictAlert
              key={`c${message}`}
              conflict={conflict}
              dealership={dealership}
              now={now}
              thisYear={thisYear}
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
                {failure.status === 0
                  ? "Nothing was booked. Check your connection and try again. Your choices are still here."
                  : `Nothing was booked. Your choices are still here. ${
                      failure.traceId
                        ? `Try again; if it keeps happening, quote reference ${failure.traceId.slice(0, 8)}.`
                        : "Try again."
                    }`}
              </p>
            </Alert>
          )}

          {notice && dealership && (
            <LinkDayNotice
              day={notice}
              days={days}
              dealership={dealership}
              now={now}
              thisYear={thisYear}
              onChoose={(date) => chooseDay(date)}
            />
          )}

          {fromWebsite && (
            <p className="text-sm text-text-secondary">
              The dealership and the service were filled in from the dealer's
              website. Change them if you need to.
            </p>
          )}

          <section
            aria-label="What are we booking?"
            className="grid gap-4 sm:grid-cols-2"
          >
            <div className="sm:col-span-2">
              <SelectField
                label="Dealership"
                required
                name="dealershipId"
                placeholder="Choose a dealership"
                value={dealership?.id ?? ""}
                options={dealerships.options.map((d) => ({
                  value: d.id,
                  label: d.name,
                }))}
                onChange={(e) => {
                  resetChoice();
                  dealerships.select(e.target.value);
                }}
              />
            </div>
            {noVehicle ? (
              <div className="grid gap-1 sm:col-span-2">
                <span className="font-medium">Car (required)</span>
                <Alert kind="info" title="There is no car on your account yet.">
                  <p>
                    We can only book a car that is already on your account. Ask{" "}
                    {dealership?.name ?? "the dealership"} to add yours, then
                    come back.
                  </p>
                  {dealership?.phone && <PhoneLink phone={dealership.phone} />}
                </Alert>
              </div>
            ) : (
              <>
                <SelectField
                  label="Car"
                  required
                  placeholder="Choose a car"
                  options={(vehicles.data ?? []).map((v) => ({
                    value: v.id,
                    label: `${v.make} ${v.model}, ${v.registration}`,
                  }))}
                  error={errors.vehicleId?.message}
                  {...register("vehicleId")}
                />
                <SelectField
                  label="Service"
                  required
                  name="serviceTypeId"
                  placeholder="Choose a service"
                  value={service?.id ?? ""}
                  options={(services.data ?? []).map((s) => ({
                    value: s.id,
                    label: `${s.name}, about ${formatDuration(s.durationMinutes)}`,
                  }))}
                  onChange={(e) => {
                    resetChoice();
                    setParams((previous) => {
                      const next = new URLSearchParams(previous);
                      next.set("service", e.target.value);
                      next.delete("date");
                      return next;
                    });
                  }}
                />
              </>
            )}
          </section>

          {loadFailure !== null && (
            <LoadFailure
              error={loadFailure}
              retry={() => {
                void services.refetch();
                void vehicles.refetch();
              }}
            />
          )}

          {(!ready || noVehicle) && (
            <HintBox>
              Pick a dealership, a car and a service above. Then we show which
              days have room.
            </HintBox>
          )}

          {ready && !noVehicle && dealership && service && (
            <>
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
                    traceId={traceOf(stripFailure)}
                    actions={
                      <Button
                        icon="refresh"
                        onClick={() => results.forEach((r) => void r.refetch())}
                      >
                        Try again
                      </Button>
                    }
                  >
                    {failureLine(
                      stripFailure,
                      "so we cannot show which days have room",
                    )}
                  </StateBlock>
                ) : stripLoading ? (
                  <StateBlock
                    kind="loading"
                    loadingLabel="Loading the days and times"
                    skeleton={<StripSkeleton />}
                  />
                ) : (
                  <DayStrip
                    key={`${dealership.id}|${service.id}`}
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
                  <p role="status" className="sr-only">
                    {selected?.kind === "open" && day
                      ? `${formatTimesCount(selected.count)} on ${dayWords(day)}`
                      : ""}
                  </p>
                  <Times
                    day={day}
                    selected={selected}
                    query={selectedQuery}
                    conflict={conflict}
                    dealership={dealership}
                    serviceTypeId={service.id}
                    transport={queryTransport}
                    zone={zone}
                    now={now}
                    thisYear={thisYear}
                    value={start}
                    onChoose={chooseTime}
                    label={timeLabel}
                  />
                </section>
              )}
            </>
          )}
        </div>

        <div className="min-w-0 lg:sticky lg:top-4 lg:w-(--size-side) lg:shrink-0">
          <BookingSummary
            rows={[
              { term: "Dealership", value: dealership?.name ?? null },
              {
                term: "Car",
                value: vehicle ? (
                  <>
                    {vehicle.make} {vehicle.model},{" "}
                    <Plate>{vehicle.registration}</Plate>
                  </>
                ) : null,
              },
              {
                term: "Service",
                value: service
                  ? `${service.name}, about ${formatDuration(service.durationMinutes)}`
                  : null,
              },
              { term: "Time", value: chosenTime ?? null },
            ]}
            transportChoices={transportChoices}
            transport={transport}
            onTransportChange={(value) =>
              setValue("transport", value, {
                shouldValidate: form.formState.isSubmitted,
              })
            }
            transportError={errors.transport?.message}
            confirm={lg ? confirmButton : undefined}
          />
        </div>
      </div>
      <p role="status" className="sr-only">
        {confirming ? "Confirming your booking" : ""}
      </p>
      <ActionBar title={chosenTime} actions={lg ? undefined : confirmButton} />
    </>
  );
}

function addMinutes(instant: string, n: number): string {
  return new Date(Date.parse(instant) + n * 60_000)
    .toISOString()
    .replace(".000Z", "Z");
}

function traceOf(error: unknown): string | null {
  return error instanceof ApiProblem ? error.traceId : null;
}

/** "Something went wrong on our side, so we cannot show …. Nothing was changed. Try again; …" */
function failureLine(error: unknown, what: string): string {
  const problem = error instanceof ApiProblem ? error : null;
  if (!problem || problem.status === 0) {
    return `We could not reach the booking service, ${what}. Nothing was changed. Check your connection and try again.`;
  }
  const reference = problem.traceId?.slice(0, 8);
  return `Something went wrong on our side, ${what}. Nothing was changed. ${
    reference
      ? `Try again; if it keeps happening, quote reference ${reference}.`
      : "Try again."
  }`;
}

function LoadFailure({ error, retry }: { error: unknown; retry: () => void }) {
  const words = describeProblem(error);
  return (
    <StateBlock
      kind="error"
      compact
      headingLevel={2}
      title={words.title}
      traceId={traceOf(error)}
      actions={
        <Button icon="refresh" onClick={retry}>
          Try again
        </Button>
      }
    >
      {words.body}
    </StateBlock>
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

/** The start times of the chosen day, or what stands in for them. */
function Times({
  day,
  selected,
  query: dayQuery,
  conflict,
  dealership,
  serviceTypeId,
  transport,
  zone,
  now,
  thisYear,
  value,
  onChoose,
  label,
}: {
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
  serviceTypeId: string;
  transport: Transport;
  zone: string;
  now: number;
  thisYear: number;
  value: string;
  onChoose: (start: string) => void;
  label: (instant: string) => string;
}) {
  if (!day || !selected) {
    return <HintBox>Pick a day above to see the start times.</HintBox>;
  }
  const dayText = formatLocalDate(day, thisYear);
  if (selected.kind === "too-far") {
    return (
      <HintBox>
        These days are further ahead than we can book. Choose one of the closest
        times above, or go back a week.
      </HintBox>
    );
  }
  if (dayQuery?.isError) {
    return (
      <StateBlock
        kind="error"
        compact
        headingLevel={3}
        title="We could not load the times."
        traceId={traceOf(dayQuery.error)}
        actions={
          <Button icon="refresh" onClick={() => void dayQuery.refetch()}>
            Try again
          </Button>
        }
      >
        {failureLine(
          dayQuery.error,
          `so we cannot show the times for ${dayText}`,
        )}
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
  const struck =
    conflict &&
    conflict.kind !== "too-far" &&
    localDateIn(conflict.start, zone) === day
      ? conflict
      : null;
  const times: ChipTime[] = slots.filter((s) => s.start !== struck?.start);
  if (struck) {
    times.push({
      start: struck.start,
      end: struck.end,
      unavailable: struck.kind === "too-soon" ? "Too soon" : "Just taken",
    });
  }
  if (times.length === 0) {
    return (
      <EmptyDay
        day={day}
        dealership={dealership}
        serviceTypeId={serviceTypeId}
        transport={transport}
        zone={zone}
        now={now}
        thisYear={thisYear}
        value={value}
        onChoose={onChoose}
        label={label}
      />
    );
  }
  const groups = groupTimes(times, zone).map((g) => ({
    label: g.label,
    count: groupCount(g),
    times: g.times,
  }));
  return (
    <>
      <TimeChipGrid
        groups={groups}
        value={value || null}
        onChange={onChoose}
        name={START}
        label={label}
      />
      {slots.filter((s) => s.start !== struck?.start).length === 0 && (
        <HintBox>No other times are left on {dayText}.</HintBox>
      )}
    </>
  );
}

/** `empty-day`: the count was out of date. The closest times on other days, from one availability check. */
function EmptyDay({
  day,
  dealership,
  serviceTypeId,
  transport,
  zone,
  now,
  thisYear,
  value,
  onChoose,
  label,
}: {
  day: string;
  dealership: Dealership;
  serviceTypeId: string;
  transport: Transport;
  zone: string;
  now: number;
  thisYear: number;
  value: string;
  onChoose: (start: string) => void;
  label: (instant: string) => string;
}) {
  const { client } = useSession();
  const opening = hoursOn(dealership, day)?.open ?? "08:00";
  const nearest = useQuery({
    queryKey: ["closest", dealership.id, serviceTypeId, day, transport],
    queryFn: () =>
      call(
        client.POST("/availability-checks", {
          body: {
            dealershipId: dealership.id,
            serviceTypeId,
            start: instantAt(day, opening, zone),
            transport,
          },
        }),
      ),
  });
  const answer = nearest.data;
  const items: SuggestedTime[] =
    answer && !answer.available
      ? answer.suggestions.map((s) => ({
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
        label={label}
        note="Closest times on other days"
      />
    </StateBlock>
  );
}

/** The 409 answers (REQ-BOOK-009.AC-2, REQ-BOOK-011): sorry, nothing was booked, the closest times. */
function ConflictAlert({
  conflict,
  dealership,
  now,
  thisYear,
  value,
  onChoose,
}: {
  conflict: Conflict;
  dealership: Dealership;
  now: number;
  thisYear: number;
  value: string;
  onChoose: (start: string) => void;
}) {
  const zone = dealership.timeZone;
  const at = `${formatTime(conflict.start, zone)} on ${formatDay(conflict.start, zone, now)}`;
  const conflictDay = localDateIn(conflict.start, zone);
  const label = (instant: string) => formatTime(instant, zone);
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
  const lead = formatDuration(dealership.policies.leadTimeMinutes);
  const kept =
    "Nothing was booked for you. We kept your car, service and choice, so you only need a new";
  const title =
    conflict.kind === "too-soon"
      ? `Sorry, ${at} is too soon to book.`
      : conflict.kind === "too-far"
        ? `Sorry, ${formatDay(conflict.start, zone, now)} is further ahead than we can book.`
        : `Sorry, ${at} was just taken.`;
  const body =
    conflict.kind === "too-soon"
      ? `Bookings need at least ${lead}' notice, and that time is now less than ${lead} away. ${kept} time.`
      : conflict.kind === "too-far"
        ? `Bookings now open up to ${dealership.policies.horizonDays} days ahead, which is ${formatLocalDate(lastDay(dealership, now), thisYear)}. ${kept} day.`
        : `Another customer confirmed that time a moment before you. ${kept} time.`;
  return (
    // Focus moves to the heading, which announces it; a live role as well would read it twice.
    <Alert kind="warning" role={null} focusTitle title={title}>
      <p>{body}</p>
      {conflict.suggestions.length === 0 ? (
        <>
          <h3 className="mt-2 text-base">
            There are no other times in the next 14 days.
          </h3>
          <p>Try another day, or contact {dealership.name}.</p>
          {dealership.phone && <PhoneLink phone={dealership.phone} />}
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

/** A link pointed at a day that cannot be booked (`closed-day`, `day-too-soon`, `day-too-far`). */
function LinkDayNotice({
  day,
  days,
  dealership,
  now,
  thisYear,
  onChoose,
}: {
  day: StripDay;
  days: readonly StripDay[];
  dealership: Dealership;
  now: number;
  thisYear: number;
  onChoose: (date: string) => void;
}) {
  const text = formatLocalDate(day.date, thisYear);
  const near = closestOpenDays(days, day.date);
  let title: string;
  let body: string;
  let offer: StripDay[];
  if (day.kind === "closed") {
    title = `${dealership.name} is closed on ${text}.`;
    body =
      "The link you followed points at a day when the dealership is closed. These are the closest days with times:";
    offer = near.slice(0, 2);
  } else if (day.kind === "too-soon") {
    const after = near.filter((d) => d.date > day.date);
    offer = after.slice(0, 1);
    const isToday = day.date === todayIn(dealership, now);
    title = `${text} is too soon to book.`;
    body = `It is ${formatTime(now, dealership.timeZone)} in ${placeOfZone(dealership.timeZone)} and bookings need at least ${formatDuration(dealership.policies.leadTimeMinutes)}' notice, so there is no time left ${isToday ? "today" : `on ${text}`}.${
      offer[0]
        ? ` The next day with times is ${formatLocalDate(offer[0].date, thisYear)}.`
        : ""
    }`;
  } else {
    offer = near.filter((d) => d.date < day.date).slice(0, 1);
    title = `${text} is too far ahead.`;
    body = `Bookings open up to ${dealership.policies.horizonDays} days ahead, so the last day you can pick is ${formatLocalDate(lastDay(dealership, now), thisYear)}.`;
  }
  return (
    <Alert
      kind="info"
      title={title}
      actions={
        offer.length > 0
          ? offer.map((d) => (
              <Button key={d.date} onClick={() => onChoose(d.date)}>
                {formatLocalDate(d.date, thisYear)} · {dayNote(d)}
              </Button>
            ))
          : undefined
      }
    >
      <p>{body}</p>
    </Alert>
  );
}
