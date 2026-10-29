// The customer's `book` screen (customer.md section 4, design.md 6 and 8.7 to 8.9, 8.18). Dealership and
// service live in the address (`/book?dealership&service`, a dealer's website links here); the car, the
// time and the car choice live in the form. Everything read from the address is looked up in what the API
// returned and never shown as typed (SEC-12).
// The same screen is the staff version (staff.md 5.4) when staff or the manager book for a customer: the
// "Booking for" panel takes the car's place, the words are the staff's, and a tapped free gap fixes the
// technician (D-0001-20 B, D-0001-31 A). One strip, one chip grid, one summary for both.
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
import { ForCustomerPanel } from "../../components/ForCustomer";
import { InlineNote, PageBack, PhoneLink, Plate } from "../../components/Small";
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
import { TimesNote } from "../../session/TimesNote";
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
import { phoneEnding, useStaffMemory } from "./staff-memory";
import { useGapFromAddress, type Gap } from "./staff-queries";
import { useEarlyCheck, useFocusKept, type CheckRequest } from "./early-check";
import { useStaffWho, whoBody, type StaffWho } from "./staff-who";
import { searchAddress } from "./staff-words";
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

const schemaFor = (staff: boolean) =>
  z.object({
    vehicleId: z.string().min(1, carMissing),
    start: z.string().min(1, "Pick a start time."),
    transport: z
      .string()
      .refine(
        (v) => ["wait", "drop_off", "courtesy_car"].includes(v),
        staff
          ? "Choose what the customer will do with the car."
          : choiceMissing,
      ),
  });
type BookForm = z.infer<ReturnType<typeof schemaFor>>;

/** What the summary Alert says for each field (customer.md section 4, "Validation"; staff.md 5.4). */
const summaryWords: Record<string, string> = {
  vehicleId: "Car: choose which car is coming in.",
  transport: "What you will do with the car: choose one.",
  start: "Time: pick a start time.",
};
const staffSummaryWords: Record<string, string> = {
  ...summaryWords,
  transport: "Car choice: choose what the customer will do with the car.",
};

/** One list of car choices (REQ-BOOK-010.AC-1), still with no default. */
const transportChoices: Choice[] = [
  { value: "wait", label: "Wait on site", icon: "hourglass" },
  { value: "drop_off", label: "Drop it off", icon: "login" },
  { value: "courtesy_car", label: "Borrow a courtesy car", icon: "key" },
];
/** The same choices in the staff's third person (design.md 8.9). */
const staffTransportChoices: Choice[] = [
  { value: "wait", label: "Waits on site", icon: "hourglass" },
  { value: "drop_off", label: "Drops the car off", icon: "login" },
  { value: "courtesy_car", label: "Borrows a courtesy car", icon: "key" },
];
/** The courtesy car greyed out with its reason in words, never colour alone (design.md 8.6, Q-0001-18). */
const withCourtesyOff = (choices: readonly Choice[], off: boolean) =>
  choices.map((c) =>
    c.value === "courtesy_car" && off
      ? { ...c, disabled: true, disabledReason: "Not available at this time" }
      : c,
  );

/** Who the booking is for: the customer themselves, or the customer staff chose. */
type Who = { kind: "customer"; customerId: string | null } | StaffWho;

const START = "start";
const SUGGESTED = "suggested-start";

interface Conflict {
  /** `courtesy`: the time is still free, but the last courtesy car went first (409 COURTESY_CAR_BUSY). */
  kind: "taken" | "too-soon" | "too-far" | "courtesy";
  start: string;
  end: string;
  suggestions: TimeSlot[];
  /** Found by the early check before Confirm (D-0001-107 C): focus stays put and a polite live region speaks. */
  early: boolean;
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
/** "a full service", "an oil and filter change". */
const aService = (name: string) =>
  `${/^[aeiou]/i.test(name) ? "an" : "a"} ${lowerFirst(name)}`;
const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function BookPage() {
  const { me } = useSession();
  const [params] = useSearchParams();
  if (me === null) return null;
  if (me.role !== "customer") {
    if (mayBookForCustomer(me.role)) return <StaffBook role={me.role} />;
    return <NoPermission denied="schedule" role={me.role} />;
  }
  // A staff booking link (a fixed technician) is not for customers (REQ-BOOK-014.AC-5).
  if (params.has("technicianId"))
    return <NoPermission denied="book-for-customer" role={me.role} />;
  const asked = params.get("customerId");
  if (asked !== null && asked !== me.customerId) return <ForOtherCustomer />;
  return <Booking who={{ kind: "customer", customerId: me.customerId }} />;
}

/** The staff version: only once a customer and a vehicle are chosen, in the address or in screen memory. */
function StaffBook({ role }: { role: "staff" | "manager" | "customer" }) {
  const answer = useStaffWho();
  if (answer.state === "loading")
    return <StateBlock kind="loading" loadingLabel="Loading the customer" />;
  if (answer.state === "failed")
    return <LoadFailure error={answer.error} retry={answer.retry} />;
  if (answer.state === "none")
    return <NoPermission denied="book-for-customer" role={role} />;
  return <Booking who={answer.who} />;
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

function Booking({ who }: { who: Who }) {
  const staff = who.kind === "staff" ? who : null;
  const customerId = who.kind === "customer" ? who.customerId : null;
  const { client } = useSession();
  const [, , forgetStaffMemory] = useStaffMemory();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const lg = useMediaQuery(query.lg);
  const [params, setParams] = useSearchParams();
  const dealerships = useSelectedDealership();
  const services = useServiceTypes();
  const vehicles = useVehicles(customerId);
  const fromGap = useGapFromAddress(staff ? dealerships.selected : undefined);
  // The technician is fixed while the gap stands; "Any technician" takes it out of the address.
  const gap: Gap | null = staff ? fromGap.gap : null;
  const technicianId = gap?.technicianId;
  // While the tapped gap's technician is looked up, or when that look-up failed, nothing is shown or sent
  // without them: the times wait and Confirm stays disabled (D-0001-20 B, Q-0001-247).
  const gapLoading = staff !== null && fromGap.loading;
  const gapFailure =
    staff !== null && gap === null && fromGap.failure ? fromGap.failure : null;
  const gapBlocked = gapLoading || gapFailure !== null;

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
    resolver: zodResolver(schemaFor(staff !== null)),
    // Staff chose the vehicle on the search page (a new vehicle has no id until it is saved).
    defaultValues: {
      vehicleId: staff ? (staff.vehicleId ?? "new") : "",
      start: "",
      transport: "",
    },
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
  const [rejected, setRejected] = useState<string[] | null>(null);
  const [message, setMessage] = useState(0);
  // The start at which a chosen courtesy car was cleared because none is free then (`courtesy-cleared`).
  const [clearedAt, setClearedAt] = useState<string | null>(null);
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
  // With the courtesy car chosen, only starts with a free car are listed and counted; wait and drop-off
  // need the same resources, so they share one search.
  const queryTransport: Transport =
    transport === "courtesy_car" ? "courtesy_car" : "wait";
  const fetchDates =
    dealership && service && !gapBlocked
      ? dates.filter((d) => needsTimes(dealership, d, now))
      : [];
  const results = useWeekAvailability(
    dealership?.id,
    service?.id,
    fetchDates,
    queryTransport,
    technicianId,
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

  // From a tapped gap: does the chosen service fit at the gap's start with its technician (D-0001-20 B)?
  const fit = useQuery({
    queryKey: [
      "gap-fit",
      dealership?.id,
      service?.id,
      gap?.start,
      technicianId,
    ],
    queryFn: () =>
      call(
        client.POST("/availability-checks", {
          body: {
            dealershipId: dealership!.id,
            serviceTypeId: service!.id,
            start: gap!.start,
            transport: "wait",
            technicianId: gap!.technicianId,
          },
        }),
      ),
    enabled: Boolean(gap && dealership && service),
  });
  const fitKey = `${service?.id}|${gap?.start}|${technicianId}`;
  const fitDone = useRef<string | null>(null);
  const gapShort =
    gap && fit.data && !fit.data.available ? fit.data.suggestions : null;
  useEffect(() => {
    if (!gap || !fit.data || !today || fitDone.current === fitKey) return;
    fitDone.current = fitKey;
    if (!fit.data.available) return;
    // It fits: the gap's day and start are chosen (state `from-gap-fits`).
    const date = localDateIn(gap.start, zone);
    setWeekStart(weekStartFor(today, date));
    setDay(date);
    setValue("start", gap.start);
  });

  // The first day with times is chosen when the strip first loads (design.md 8.7), or the linked day.
  const stripKey = `${dealership?.id}|${service?.id}|${week}|${technicianId}`;
  useEffect(() => {
    if (
      !ready ||
      gapBlocked ||
      stripLoading ||
      stripFailure ||
      autoKey.current === stripKey
    )
      return;
    // A gap waits for its own answer: it chooses the gap's day, or no day when the job does not fit.
    if (gap && fit.isPending) return;
    autoKey.current = stripKey;
    if (day && dates.includes(day)) return;
    if (notice || gapShort || (gap && fit.data?.available)) return;
    const linked = linkDay?.kind === "open" ? linkDay : undefined;
    const first = linked ?? days.find((d) => d.kind === "open");
    setDay(first?.date ?? null);
  });

  const selected = dayOf(day);
  const selectedQuery = day ? byDate.get(day) : undefined;
  const timeLabel = (instant: string) => formatTime(instant, zone);
  const dayWords = (date: string) => formatLocalDate(date, thisYear);

  // Is a courtesy car free for the whole job at the chosen start (REQ-BOOK-010.AC-3, Q-0001-18)? The
  // answer also names the closest start that has one.
  const courtesy = useQuery({
    queryKey: [
      "courtesy-check",
      dealership?.id,
      service?.id,
      start,
      technicianId,
    ],
    queryFn: () =>
      call(
        client.POST("/availability-checks", {
          body: {
            dealershipId: dealership!.id,
            serviceTypeId: service!.id,
            start,
            transport: "courtesy_car",
            ...(technicianId ? { technicianId } : {}),
          },
        }),
      ),
    enabled: Boolean(start && dealership && service && !gapBlocked),
  });
  const carBusy =
    Boolean(start) &&
    courtesy.data !== undefined &&
    !courtesy.data.available &&
    courtesy.data.reasons.includes("COURTESY_CAR_BUSY");
  const carGone = conflict?.kind === "courtesy" && conflict.start === start;
  const courtesyOff = carBusy || carGone;
  // A chosen courtesy car with none free at the new start is cleared, and the page says so (`courtesy-cleared`).
  useEffect(() => {
    if (transport !== "courtesy_car" || !carBusy) return;
    setValue("transport", "");
    setClearedAt(start);
  }, [transport, carBusy, start, setValue]);

  function resetChoice() {
    setValue("start", "");
    setClearedAt(null);
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
          technicianId,
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

  /** A time that is not free any more: from a 409 at Confirm, or from the early check before it. */
  function showConflict(
    at: string,
    reasons: readonly string[],
    suggestions: TimeSlot[],
    early: boolean,
  ) {
    if (reasons.length > 0 && reasons.every((r) => r === "COURTESY_CAR_BUSY")) {
      // The time is still free to wait or drop off: it stays chosen, the car choice is cleared, and
      // the closest times with a courtesy car are offered (`conflict-courtesy`, REQ-BOOK-009.AC-2).
      setConflict({
        kind: "courtesy",
        start: at,
        end: addMinutes(at, minutes),
        suggestions: suggestions.slice(0, 5),
        early,
      });
      setValue("transport", "");
      setMessage((n) => n + 1);
      void queryClient.invalidateQueries({ queryKey: ["availability"] });
      void queryClient.invalidateQueries({
        queryKey: ["courtesy-check"],
      });
      return;
    }
    const kind = reasons.includes("TOO_SOON")
      ? "too-soon"
      : reasons.includes("BEYOND_HORIZON")
        ? "too-far"
        : "taken";
    setConflict({
      kind,
      start: at,
      end: addMinutes(at, minutes),
      // Up to five closest times (REQ-BOOK-009.AC-2); the API sends five at most today.
      suggestions: suggestions.slice(0, 5),
      early,
    });
    setValue("start", "");
    setMessage((n) => n + 1);
    void queryClient.invalidateQueries({ queryKey: ["availability"] });
    if (kind === "too-far")
      void queryClient.invalidateQueries({ queryKey: ["dealerships"] });
  }

  const keepFocus = useFocusKept("times-title");
  // Warn early (D-0001-107 C): the chosen time is checked again now and every 30 seconds while it stays chosen.
  const earlyRequest: CheckRequest | null =
    start && dealership && service && !gapBlocked
      ? {
          dealershipId: dealership.id,
          serviceTypeId: service.id,
          start,
          transport: queryTransport,
          ...(technicianId ? { technicianId } : {}),
        }
      : null;
  useEarlyCheck(earlyRequest, (answer, asked) => {
    // While Confirm is on its way its own answer decides (it may be our own booking that took the time).
    if (answer.available || busy.current) return;
    const carOnly = answer.reasons.every((r) => r === "COURTESY_CAR_BUSY");
    // A courtesy car that was not free when it was chosen is the `courtesy-cleared` note's job (D-0001-104 3);
    // the early check speaks only when the car was free then and has gone since.
    if (
      carOnly &&
      (asked.transport !== "courtesy_car" || courtesy.data?.available !== true)
    )
      return;
    keepFocus();
    showConflict(asked.start, answer.reasons, answer.suggestions, true);
  });

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
        if (staff) {
          // The new customer is stored now: the search finds them, and the memory is done with.
          void queryClient.invalidateQueries({ queryKey: ["customer-search"] });
          void queryClient.invalidateQueries({ queryKey: ["schedule"] });
          // The Schedule screen's cached days are dropped, not only marked old: going back must not show
          // the tapped gap as still free while the new day loads.
          queryClient.removeQueries({ queryKey: ["schedule-day"] });
          void navigate(`/book/confirmed/${appointment.id}`, {
            state: { newCustomer: staff.newCustomer !== null },
          });
          forgetStaffMemory();
          return;
        }
        void navigate(`/book/confirmed/${appointment.id}`);
      },
      onError: (error) => {
        busy.current = false;
        const problem =
          error instanceof ApiProblem ? error : new ApiProblem(0, null, null);
        if (problem.code === "SLOT_UNAVAILABLE") {
          pending.current = null;
          showConflict(
            press.body.start!,
            problem.problem?.reasons ?? [],
            problem.problem?.suggestions ?? [],
            false,
          );
          return;
        }
        if (problem.status === 403) {
          pending.current = null;
          setForbidden(true);
          return;
        }
        if (problem.status === 422 && problem.problem?.errors?.length) {
          pending.current = null;
          const details = problem.problem.errors.filter((e) =>
            /^new(Customer|Vehicle)\./.test(e.field),
          );
          if (staff && details.length > 0) {
            // The customer's or the vehicle's details were refused: they are fixed on the search page.
            setRejected(details.map((e) => e.message));
            setMessage((n) => n + 1);
            return;
          }
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
    if (busy.current || booking.isPending || gapBlocked) return;
    busy.current = true;
    setConflict(null);
    setRejected(null);
    void handleSubmit(
      (values) => {
        const body: BookingRequest = staff
          ? {
              dealershipId: dealership!.id,
              serviceTypeId: service!.id,
              ...whoBody(staff),
              start: values.start,
              transport: values.transport as Transport,
              ...(technicianId ? { technicianId } : {}),
            }
          : {
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

  if (forbidden && !staff) return <ForOtherCustomer />;

  const noVehicle =
    !staff &&
    (customerId === null ||
      (vehicles.data !== undefined && vehicles.data.length === 0));
  const vehicle = vehicles.data?.find((v) => v.id === vehicleId);
  const loadFailure = services.error ?? vehicles.error;
  const confirming = booking.isPending;
  const needNewTime = conflict !== null && !start;
  const words = staff ? staffSummaryWords : summaryWords;
  const problems = (Object.keys(words) as (keyof BookForm)[])
    .filter((name) => errors[name])
    .map((name) => ({ name, words: words[name]! }));

  const confirmButton = (
    <Button
      variant="primary"
      fullWidth={lg}
      loading={confirming}
      loadingLabel="Confirming…"
      disabled={(!start && !confirming) || gapBlocked}
      onClick={confirm}
    >
      {start || confirming
        ? "Confirm booking"
        : staff && !service
          ? "Choose a service to confirm"
          : needNewTime
            ? "Pick a new time to confirm"
            : "Pick a time to confirm"}
    </Button>
  );

  const chosenTime =
    start && dealership
      ? `${formatDay(start, zone, now)}, ${formatTimeRange(start, addMinutes(start, minutes), zone)}`
      : undefined;

  // With a fixed technician and no other time near the taken one (state `conflict-empty`).
  const noneWithTechnician =
    gap !== null && conflict !== null && conflict.suggestions.length === 0;
  const title = staff
    ? !service
      ? "Choose a service and a time"
      : gapShort || noneWithTechnician
        ? "Choose a time"
        : `Choose a time for ${aService(service.name)}`
    : service
      ? `Choose a time for your ${lowerFirst(service.name)}`
      : "Book a service";
  const lede = service
    ? `Your ${lowerFirst(service.name)} takes about ${formatDuration(service.durationMinutes)}. Pick a day, then the time you want to arrive.`
    : "Tell us which car and which service. Then pick a day and a time.";

  function anyTechnician() {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.delete("technicianId");
      return next;
    });
  }
  const staffVehicle = staff
    ? `${staff.vehicle.make} ${staff.vehicle.model}, ${staff.vehicle.registration}`
    : "";
  const ownNames = dealerships.options.map((d) => d.name).join(" and ");

  return (
    <>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <div className="grid min-w-0 flex-1 content-start gap-6">
          <div>
            {staff && (
              <div className="mb-2">
                <PageBack to={searchAddress(params)}>Back to customer</PageBack>
              </div>
            )}
            <h1 tabIndex={-1} className="text-2xl lg:text-3xl">
              {title}
            </h1>
            {!staff && (
              <p className="mt-2 max-w-(--measure) text-text-secondary">
                {lede}
              </p>
            )}
            <TimesNote className="mt-2" />
          </div>

          {staff && (
            <ForCustomerPanel
              name={staff.name}
              line={`${phoneEnding(staff.phone)} · ${staffVehicle}`}
              isNew={staff.newCustomer !== null}
              action={
                staff.newCustomer
                  ? { label: "Edit details", to: searchAddress(params) }
                  : { label: "Change customer", to: searchAddress(params) }
              }
            />
          )}

          {gapLoading && (
            <StateBlock
              kind="loading"
              compact
              loadingLabel="Loading the gap you tapped"
            />
          )}
          {gapFailure !== null && (
            <StateBlock
              kind="error"
              compact
              headingLevel={2}
              title="We could not check the gap you tapped."
              traceId={traceOf(gapFailure)}
              actions={
                <Button icon="refresh" onClick={fromGap.retry}>
                  Try again
                </Button>
              }
            >
              {failureLine(
                gapFailure,
                "so we cannot show the technician or their times",
              )}
            </StateBlock>
          )}

          {forbidden && staff && (
            <Alert
              key={`x${message}`}
              kind="danger"
              role={null}
              focusTitle
              title="You cannot book at that dealership."
              actions={<Button to="/schedule">Back to schedule</Button>}
            >
              <p>
                Your account is linked to {ownNames} only. Nothing was booked.
                Go back to the schedule and carry on from there.
              </p>
            </Alert>
          )}

          {rejected && (
            <Alert
              key={`r${message}`}
              kind="danger"
              role={null}
              focusTitle
              title={`${rejected.length === 1 ? "1 thing needs" : `${rejected.length} things need`} fixing before we can book this.`}
              actions={<Button to={searchAddress(params)}>Edit details</Button>}
            >
              <ul className="m-0 list-disc ps-5">
                {rejected.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </Alert>
          )}

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
              staff={
                staff
                  ? {
                      technicianName: gap?.technicianName ?? null,
                      newCustomerName: staff.newCustomer ? staff.name : null,
                      onAnyTechnician: anyTechnician,
                      onPickDay: focusDayStrip,
                    }
                  : undefined
              }
            />
          )}

          {gap && !conflict && !gapShort && service === undefined && (
            <GapAlert gap={gap} zone={zone} onAnyTechnician={anyTechnician}>
              {gap.end
                ? `You tapped a free gap, ${formatTimeRange(gap.start, gap.end, zone)}. We keep this time and this technician while you choose the service, then check that the job fits.`
                : `You tapped a free gap from ${formatTime(gap.start, zone)}. We keep this time and this technician while you choose the service, then check that the job fits.`}
            </GapAlert>
          )}
          {gap && !conflict && !gapShort && service !== undefined && (
            <GapAlert gap={gap} zone={zone} onAnyTechnician={anyTechnician}>
              {`We only show times with ${gap.technicianName}. Choose another technician by pressing Any technician.`}
            </GapAlert>
          )}
          {gap && gapShort && service && (
            <Alert
              key={`s${fitKey}`}
              kind="warning"
              role={null}
              focusTitle
              title={`${upperFirst(aService(service.name))} does not fit at ${formatTime(gap.start, zone)} with ${gap.technicianName}.`}
              actions={<Button onClick={anyTechnician}>Any technician</Button>}
            >
              <p>
                {gap.end
                  ? `${gap.technicianName} is free for ${formatDuration(Math.round((Date.parse(gap.end) - Date.parse(gap.start)) / 60_000))} from ${formatTime(gap.start, zone)}, and ${aService(service.name)} takes about ${formatDuration(service.durationMinutes)}. `
                  : ""}
                Pick another service, one of the times below, or any technician.
              </p>
            </Alert>
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
                {staff
                  ? `Nothing was booked. ${
                      failure.status !== 0 && failure.traceId
                        ? `Try again; if it keeps happening, quote reference ${failure.traceId.slice(0, 8)}.`
                        : "Try again."
                    } We use the same request, so it cannot book twice.`
                  : failure.status === 0
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

          {fromWebsite && !staff && (
            <p className="text-sm text-text-secondary">
              The dealership and the service were filled in from the dealer's
              website. Change them if you need to.
            </p>
          )}

          <section
            aria-label="What are we booking?"
            className="grid gap-4 sm:grid-cols-2"
          >
            {!staff && (
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
            )}
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
                {!staff && (
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
                )}
                <div className={staff ? "sm:col-span-2" : undefined}>
                  <SelectField
                    label="Service"
                    required
                    name="serviceTypeId"
                    placeholder="Choose a service"
                    value={service?.id ?? ""}
                    options={(services.data ?? []).map((s) => ({
                      value: s.id,
                      label: staff
                        ? `${s.name} (about ${formatDuration(s.durationMinutes)})`
                        : `${s.name}, about ${formatDuration(s.durationMinutes)}`,
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
                </div>
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

          {staff && !service && (
            <StateBlock
              kind="info"
              compact
              headingLevel={2}
              title="Choose a service to see times."
            >
              The times depend on how long the job takes and who can do it.
            </StateBlock>
          )}

          {!staff && (!ready || noVehicle) && (
            <HintBox>
              Pick a dealership, a car and a service above. Then we show which
              days have room.
            </HintBox>
          )}

          {ready && !noVehicle && !gapBlocked && dealership && service && (
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
                      // With a fixed technician a day with none reads "No times" (design.md 8.7, P7).
                      note: gap && d.kind === "full" ? "No times" : dayNote(d),
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
                  {gap && gapShort && !day ? (
                    <SuggestionGroup
                      title={`Closest times with ${gap.technicianName}`}
                      items={gapShort.map((s) => ({
                        start: s.start,
                        end: s.end,
                        day: formatDay(s.start, zone, now),
                      }))}
                      value={start || null}
                      onChange={chooseTime}
                      name={SUGGESTED}
                      label={timeLabel}
                    />
                  ) : (
                    <Times
                      technicianId={technicianId}
                      staff={staff !== null}
                      serviceName={service.name}
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
                  )}
                </section>
              )}
            </>
          )}
        </div>

        <div className="min-w-0 lg:sticky lg:top-4 lg:w-(--size-side) lg:shrink-0">
          <BookingSummary
            variant={staff ? "staff" : "customer"}
            customerName={staff?.name}
            rows={
              staff
                ? [
                    { term: "Dealership", value: dealership?.name ?? null },
                    {
                      term: "Vehicle",
                      value: (
                        <>
                          {staff.vehicle.make} {staff.vehicle.model},{" "}
                          <Plate>{staff.vehicle.registration}</Plate>
                        </>
                      ),
                    },
                    {
                      term: "Service",
                      value: service
                        ? `${service.name}, about ${formatDuration(service.durationMinutes)}`
                        : null,
                    },
                    { term: "Time", value: chosenTime ?? null },
                    {
                      term: "Technician",
                      value: gap ? (
                        <>
                          {gap.technicianName}
                          <span className="block text-sm font-normal text-text-secondary">
                            From the gap you tapped.
                          </span>
                          <Button
                            variant="quiet"
                            className="-ms-5"
                            onClick={anyTechnician}
                          >
                            Any technician
                          </Button>
                        </>
                      ) : gapBlocked ? null : (
                        "Picked for you"
                      ),
                    },
                  ]
                : [
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
                  ]
            }
            transportChoices={withCourtesyOff(
              staff ? staffTransportChoices : transportChoices,
              courtesyOff,
            )}
            transport={transport}
            onTransportChange={(value) =>
              setValue("transport", value, {
                shouldValidate: form.formState.isSubmitted,
              })
            }
            transportError={errors.transport?.message}
            transportNote={
              start && clearedAt === start && !transport ? (
                <InlineNote>
                  A courtesy car is not free from{" "}
                  {formatTimeRange(start, addMinutes(start, minutes), zone)}, so
                  we cleared that choice. Please choose again.
                </InlineNote>
              ) : carBusy && !carGone && courtesy.data ? (
                <p className="text-sm text-text-secondary">
                  {noCarLine(
                    start,
                    addMinutes(start, minutes),
                    courtesy.data.available
                      ? undefined
                      : courtesy.data.suggestions[0],
                    zone,
                    now,
                    staff !== null,
                  )}
                </p>
              ) : null
            }
            confirm={lg ? confirmButton : undefined}
          />
        </div>
      </div>
      <p role="status" className="sr-only">
        {confirming
          ? "Confirming your booking"
          : conflict?.early
            ? conflictTitle(conflict, zone, now)
            : ""}
      </p>
      {staff ? (
        <ActionBar
          title={
            start
              ? `${formatDay(start, zone, now)}, ${formatTime(start, zone)}`
              : needNewTime
                ? "Pick a new time"
                : "Pick a time"
          }
          status={
            start
              ? `Ends ${formatTime(addMinutes(start, minutes), zone)}`
              : undefined
          }
          actions={lg ? undefined : confirmButton}
        />
      ) : (
        <ActionBar
          title={chosenTime}
          actions={lg ? undefined : confirmButton}
        />
      )}
    </>
  );
}

/** The blue note of a tapped free gap, with "Any technician" (states `from-gap`, `from-gap-fits`). */
function GapAlert({
  gap,
  zone,
  onAnyTechnician,
  children,
}: {
  gap: Gap;
  zone: string;
  onAnyTechnician: () => void;
  children: string;
}) {
  return (
    <Alert
      kind="info"
      title={`Booking ${gap.technicianName} on ${formatDay(gap.start, zone, Date.now())}, from ${formatTime(gap.start, zone)}.`}
      actions={<Button onClick={onAnyTechnician}>Any technician</Button>}
    >
      <p>{children}</p>
    </Alert>
  );
}

/** "Pick another day": focus goes to the day strip, on the chosen day or the first that can be chosen. */
function focusDayStrip() {
  const days = document.querySelectorAll<HTMLInputElement>(
    'input[name="day"]:not(:disabled)',
  );
  const chosen = [...days].find((d) => d.checked) ?? days[0];
  chosen?.focus();
}

/** `no-courtesy-car`: "No courtesy car is free from 10:00 to 13:00. You can still wait or drop the car off. A
 * courtesy car is free if you start at 10:45." The start comes from the API's closest time with a car. */
function noCarLine(
  start: string,
  end: string,
  next: TimeSlot | undefined,
  zone: string,
  now: number,
  staff: boolean,
): string {
  const range = formatTimeRange(start, end, zone);
  const at = next
    ? localDateIn(next.start, zone) === localDateIn(start, zone)
      ? formatTime(next.start, zone)
      : `${formatTime(next.start, zone)} on ${formatDay(next.start, zone, now)}`
    : null;
  return staff
    ? `No courtesy car is free from ${range}. The customer can still wait or drop the car off.${at ? ` A courtesy car is free if they start at ${at}.` : ""}`
    : `No courtesy car is free from ${range}. You can still wait or drop the car off.${at ? ` A courtesy car is free if you start at ${at}.` : ""}`;
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
  technicianId,
  staff,
  serviceName,
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
  technicianId: string | undefined;
  staff: boolean;
  serviceName: string;
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
    conflict.kind !== "courtesy" &&
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
        technicianId={technicianId}
        staff={staff}
        serviceName={serviceName}
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
  technicianId,
  staff,
  serviceName,
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
  technicianId: string | undefined;
  staff: boolean;
  serviceName: string;
}) {
  const { client } = useSession();
  const opening = hoursOn(dealership, day)?.open ?? "08:00";
  const nearest = useQuery({
    queryKey: [
      "closest",
      dealership.id,
      serviceTypeId,
      day,
      transport,
      technicianId,
    ],
    queryFn: () =>
      call(
        client.POST("/availability-checks", {
          body: {
            dealershipId: dealership.id,
            serviceTypeId,
            start: instantAt(day, opening, zone),
            transport,
            ...(technicianId ? { technicianId } : {}),
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
  if (staff) {
    return (
      <StateBlock
        kind="info"
        compact
        headingLevel={3}
        title={`No times left on ${formatLocalDate(day, thisYear)} for ${aService(serviceName)}.`}
      >
        <p className="mb-3">
          Try one of the closest times, or pick another day.
        </p>
        <SuggestionGroup
          title="Closest times"
          titleLevel={4}
          items={items}
          value={value || null}
          onChange={onChoose}
          name={SUGGESTED}
          label={label}
        />
      </StateBlock>
    );
  }
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
  staff,
}: {
  conflict: Conflict;
  dealership: Dealership;
  now: number;
  thisYear: number;
  value: string;
  onChoose: (start: string) => void;
  /** The staff's words (staff.md 5.4): "Someone else", a fixed technician, a new customer not saved yet. */
  staff?:
    | {
        technicianName: string | null;
        newCustomerName: string | null;
        onAnyTechnician: () => void;
        onPickDay: () => void;
      }
    | undefined;
}) {
  const zone = dealership.timeZone;
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
  const kept = staff
    ? "Nothing was booked. We kept the vehicle, the service and the car choice, so you only need a new"
    : "Nothing was booked for you. We kept your car, service and choice, so you only need a new";
  const notSaved = staff?.newCustomerName
    ? ` ${staff.newCustomerName} is not saved yet. We kept the details you entered. They are saved when you confirm a time.`
    : "";
  if (conflict.kind === "courtesy") {
    const time = formatTime(conflict.start, zone);
    return (
      <Alert
        kind="warning"
        role={null}
        focusTitle={!conflict.early}
        title={conflictTitle(conflict, zone, now)}
      >
        <p>
          {staff
            ? `Someone else took the last one a moment before you. Nothing was booked. You can still book ${time} and the customer can wait or drop the car off, or pick a time when a courtesy car is free.`
            : `Another customer took the last one a moment before you. Nothing was booked for you. You can still book ${time} and wait or drop the car off, or pick a time when a courtesy car is free.`}
          {notSaved}
        </p>
        {conflict.suggestions.length === 0 ? (
          <h3 className="mt-2 text-base">
            There are no other times with a courtesy car in the next 14 days.
          </h3>
        ) : (
          <div className="mt-2">
            <SuggestionGroup
              title="Closest times with a courtesy car"
              items={conflict.suggestions.map(toItem)}
              value={value || null}
              onChange={onChoose}
              name={`${SUGGESTED}-courtesy`}
              label={label}
            />
          </div>
        )}
      </Alert>
    );
  }
  const body =
    conflict.kind === "too-soon"
      ? `Bookings need at least ${lead}' notice, and that time is now less than ${lead} away. ${kept} time.`
      : conflict.kind === "too-far"
        ? `Bookings now open up to ${dealership.policies.horizonDays} days ahead, which is ${formatLocalDate(lastDay(dealership, now), thisYear)}. ${kept} day.`
        : staff
          ? `Someone else confirmed that time a moment before you did. ${kept} time.`
          : `Another customer confirmed that time a moment before you. ${kept} time.`;
  return (
    // After Confirm, focus moves to the heading, which announces it; a live role as well would read it twice.
    // Found early, focus stays where the customer is and the page's polite live region says the title.
    <Alert
      kind="warning"
      role={null}
      focusTitle={!conflict.early}
      title={conflictTitle(conflict, zone, now)}
    >
      <p>
        {body}
        {notSaved}
      </p>
      {conflict.suggestions.length === 0 && staff?.technicianName ? (
        <>
          <p>
            There are no other times with {staff.technicianName} in the next 14
            days. Try any technician, or pick another day.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={staff.onAnyTechnician}>Try any technician</Button>
            <Button variant="quiet" onClick={staff.onPickDay}>
              Pick another day
            </Button>
          </div>
        </>
      ) : conflict.suggestions.length === 0 && staff ? (
        <>
          <h3 className="mt-2 text-base">
            There are no other times in the next 14 days.
          </h3>
          <p>Try another day, or call {dealership.name}.</p>
        </>
      ) : conflict.suggestions.length === 0 ? (
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

/** The apology's title, also said by the live region when the early check finds the time gone. */
function conflictTitle(conflict: Conflict, zone: string, now: number): string {
  const at = `${formatTime(conflict.start, zone)} on ${formatDay(conflict.start, zone, now)}`;
  switch (conflict.kind) {
    case "courtesy":
      return `Sorry, no courtesy car is free from ${formatTimeRange(conflict.start, conflict.end, zone)} any more.`;
    case "too-soon":
      return `Sorry, ${at} is too soon to book.`;
    case "too-far":
      return `Sorry, ${formatDay(conflict.start, zone, now)} is further ahead than we can book.`;
    case "taken":
      return `Sorry, ${at} was just taken.`;
  }
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
