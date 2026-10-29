// `adjust` (manager.md 4.1, 5.1; REQ-BOOK-005): the manager moves an appointment, or changes its technician or
// bay. The check runs on Save (one PATCH); a clash keeps every entry and offers the closest free times, which fill
// the form and save nothing. Only the manager reaches this screen: the route guard shows `no-permission` to
// everyone else before anything loads (D-0001-19).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useParams } from "react-router";
import { z } from "zod";
import { ActionBar } from "../../components/ActionBar";
import { Alert } from "../../components/Alert";
import {
  Badge,
  StatusBadge,
  TransportBadge,
  type Transport,
} from "../../components/Badge";
import { Button } from "../../components/Button";
import { ChangeSummary } from "../../components/ChangeSummary";
import {
  DateField,
  SelectField,
  TimeField,
  focusField,
} from "../../components/Fields";
import { PageBack, Plate } from "../../components/Small";
import { Skeleton, StateBlock } from "../../components/StateBlock";
import { SuggestionFillGroup } from "../../components/SuggestionFillGroup";
import { useToast } from "../../components/Toast";
import { useTaskMode } from "../../components/shell-context";
import { ProblemState } from "../../app/states";
import { ApiProblem, call, type Dealership } from "../../data/api-problem";
import { describeProblem } from "../../data/words";
import { formatTime, localDateIn } from "../../format/format";
import { FormSummary, type FormProblem } from "../../forms/FormSummary";
import { zodResolver } from "../../forms/resolver";
import { useDealerships } from "../../session/dealership";
import { useSession } from "../../session/session";
import { ZoneTimesNote } from "../../session/TimesNote";
import { instantAt } from "../book/days";
import { isCancelled } from "../appointment/AppointmentReadSide";
import { vehicleText } from "../schedule/schedule-model";
import {
  changeOf,
  clashText,
  dayAndTime,
  editRows,
  endsText,
  fieldProblems,
  flagBadgeWords,
  flagSentences,
  flaggedStatus,
  moved,
  sameValues,
  savedRows,
  savedText,
  technicianOption,
  valuesOf,
  type AdjustValues,
  type Appointment,
  type TimeSlot,
} from "./adjust-model";
import { CancelDialog, changedQueries } from "./CancelDialog";

const SAME_NOTE =
  "The customer is sent a message about the new time. Their reminders move with it.";
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

export function AdjustPage() {
  const { appointmentId = "" } = useParams();
  const { client } = useSession();
  const dealerships = useDealerships();
  // A task screen: the tab bar steps aside below 1024 (manager.md 7).
  useTaskMode("lg");
  const appointment = useQuery({
    queryKey: ["appointment", appointmentId],
    queryFn: () =>
      call(
        client.GET("/appointments/{appointmentId}", {
          params: { path: { appointmentId } },
        }),
      ),
  });
  const [cancelledHere, setCancelledHere] = useState(false);

  if (appointment.isPending) {
    return (
      <StateBlock
        kind="loading"
        loadingLabel="Loading the appointment"
        skeleton={
          <>
            <Skeleton className="h-(--size-target)" />
            <Skeleton className="h-8" />
            <Skeleton className="h-(--size-target)" />
            <Skeleton className="h-(--size-target)" />
            <Skeleton className="h-(--size-target)" />
          </>
        }
      />
    );
  }
  if (appointment.isError) {
    return (
      <LoadProblem
        error={appointment.error}
        retry={() => void appointment.refetch()}
      />
    );
  }
  const a = appointment.data;
  const dealership = dealerships.data?.find((d) => d.id === a.dealershipId);
  const now = Date.now();
  if (isCancelled(a)) {
    return (
      <div className="grid gap-4">
        <Head appointment={a} />
        <Alert
          kind="info"
          role="status"
          title="This appointment is cancelled"
          focusTitle={cancelledHere}
          actions={
            <Button
              variant="primary"
              to={`/schedule?date=${localDateIn(a.start, a.timeZone)}`}
            >
              Back to schedule
            </Button>
          }
        >
          <p>
            It was {dayAndTime(a.start, a.timeZone, now)} with{" "}
            {a.display.technicianName}. The time is free again, so it cannot be
            moved or changed.
          </p>
        </Alert>
      </div>
    );
  }
  if (Date.parse(a.end) <= now) {
    // A finished job cannot be moved (Q-0001-245): the same rule as the appointment page and the schedule.
    return (
      <div className="grid gap-4">
        <Head appointment={a} />
        <Alert
          kind="info"
          role="status"
          title="This appointment has ended"
          actions={
            <Button
              variant="primary"
              to={`/schedule?date=${localDateIn(a.start, a.timeZone)}`}
            >
              Back to schedule
            </Button>
          }
        >
          <p>
            It was {dayAndTime(a.start, a.timeZone, now)} with{" "}
            {a.display.technicianName}. A finished appointment cannot be moved
            or changed.
          </p>
        </Alert>
      </div>
    );
  }
  return (
    <AdjustForm
      key={a.id}
      appointment={a}
      dealership={dealership}
      now={now}
      onCancelled={() => setCancelledHere(true)}
    />
  );
}

function LoadProblem({ error, retry }: { error: unknown; retry: () => void }) {
  const words = describeProblem(error);
  if (words.kind === "not-found") {
    return (
      <StateBlock
        kind="not-found"
        title="We cannot find that appointment."
        focusTitle
        actions={
          <Button variant="primary" to="/schedule">
            Back to schedule
          </Button>
        }
      >
        It may have been removed, or it belongs to someone else.
      </StateBlock>
    );
  }
  if (words.kind !== "error")
    return <ProblemState error={error} retry={retry} />;
  return (
    <div className="grid gap-4">
      <PageBack to="/schedule">Back to schedule</PageBack>
      <StateBlock
        kind="error"
        title="Something went wrong on our side."
        headingLevel={2}
        traceId={error instanceof ApiProblem ? error.traceId : null}
        focusTitle
        actions={
          <Button variant="primary" icon="refresh" onClick={retry}>
            Try again
          </Button>
        }
      >
        We could not load this appointment. {words.body}
      </StateBlock>
    </div>
  );
}

/** Back link, title, the one-line identity and the badges (manager.md 4.1 hierarchy). */
function Head({ appointment: a }: { appointment: Appointment }) {
  const cancelled = isCancelled(a);
  const kinds = [...new Set(a.flags.map((f) => f.kind))];
  return (
    <div className="grid gap-2">
      <PageBack to={`/schedule?date=${localDateIn(a.start, a.timeZone)}`}>
        Back to schedule
      </PageBack>
      <h1 className="text-2xl lg:text-3xl">Adjust appointment</h1>
      <ZoneTimesNote timeZone={a.timeZone} />
      <p className="text-lg wrap-anywhere">
        {a.display.serviceTypeName} for{" "}
        <span dir="auto">{a.display.customerName}</span> · {vehicleText(a)}{" "}
        <Plate>{a.display.vehicle.registration}</Plate>
      </p>
      <div className="flex flex-wrap gap-2">
        <StatusBadge status={cancelled ? "cancelled" : "confirmed"} />
        <TransportBadge transport={a.transport as Transport} />
        {!cancelled &&
          kinds.map((k) => (
            <Badge key={k} variant="flag" icon="alert">
              {flagBadgeWords[k]}
            </Badge>
          ))}
      </div>
    </div>
  );
}

interface Refusal {
  values: AdjustValues;
  reasons: string[];
  suggestions: TimeSlot[];
}

interface Saved {
  before: Appointment;
  after: Appointment;
}

function AdjustForm({
  appointment: a,
  dealership,
  now,
  onCancelled,
}: {
  appointment: Appointment;
  dealership: Dealership | undefined;
  now: number;
  onCancelled: () => void;
}) {
  const { client } = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const zone = a.timeZone;
  const minutes = Math.round(
    (Date.parse(a.end) - Date.parse(a.start)) / 60_000,
  );
  const [today] = useState(() => localDateIn(Date.now(), zone));
  const grid = dealership?.policies.gridMinutes ?? 15;
  const initial = useMemo(() => valuesOf(a), [a]);
  const schema = useMemo(
    () =>
      z.custom<AdjustValues>().superRefine((values, ctx) => {
        for (const p of fieldProblems(values, today, grid)) {
          ctx.addIssue({ code: "custom", path: [p.name], message: p.message });
        }
      }),
    [today, grid],
  );
  const form = useForm<AdjustValues>({
    defaultValues: initial,
    resolver: zodResolver(schema),
    shouldFocusError: false,
  });
  const values = form.watch();
  const submitted = form.formState.isSubmitted;
  const problems = submitted ? fieldProblems(values, today, grid) : [];
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [serverProblems, setServerProblems] = useState<FormProblem[]>([]);
  const [cancelling, setCancelling] = useState(false);

  const start =
    /^\d{4}-\d{2}-\d{2}$/.test(values.date) && CLOCK.test(values.time)
      ? instantAt(values.date, values.time, zone)
      : null;
  const body = changeOf(a, values, start);
  // A blank or half-typed date or time: Save stays on, so pressing it names the field ("Choose a date.").
  const unreadable = start === null;
  const shownDate = start ? values.date : initial.date;

  const serviceTypes = useQuery({
    queryKey: ["service-types"],
    queryFn: () => call(client.GET("/service-types")),
  });
  const skill = serviceTypes.data?.find(
    (s) => s.id === a.serviceTypeId,
  )?.requiredSkill;
  const day = useQuery({
    queryKey: ["schedule-day", a.dealershipId, shownDate],
    queryFn: () =>
      call(
        client.GET("/dealerships/{dealershipId}/schedule", {
          params: {
            path: { dealershipId: a.dealershipId },
            query: { date: shownDate },
          },
        }),
      ),
    placeholderData: (previous) => previous,
  });
  const technicians = (day.data?.technicians ?? []).filter(
    (t) =>
      t.id !== a.technicianId &&
      (skill === undefined || t.skills.includes(skill)),
  );
  const bays = (day.data?.serviceBays ?? []).filter(
    (b) => b.active && b.id !== a.serviceBayId,
  );
  const chosenTech = technicians.find((t) => t.id === values.technicianId);
  const chosenBay = bays.find((b) => b.id === values.serviceBayId);

  const flagged = a.flags.length > 0;
  // A flagged booking comes with the closest times that fit (manager.md 4.2: Move opens adjust with them listed).
  const fits = useQuery({
    queryKey: ["fits", a.id, a.version],
    queryFn: () =>
      call(
        client.POST("/availability-checks", {
          body: {
            dealershipId: a.dealershipId,
            serviceTypeId: a.serviceTypeId,
            start: a.start,
            transport: a.transport,
            appointmentId: a.id,
          },
        }),
      ),
    enabled: flagged,
  });

  const save = useMutation({
    mutationFn: (change: NonNullable<typeof body>) =>
      call(
        client.PATCH("/appointments/{appointmentId}", {
          params: { path: { appointmentId: a.id } },
          body: change,
        }),
      ),
    onMutate: () => {
      setSaveError(null);
      setServerProblems([]);
    },
    onSuccess: async (after) => {
      setRefusal(null);
      setSaved({ before: a, after });
      if (moved(a, after))
        toast.show({
          kind: "success",
          message: `Appointment moved to ${dayAndTime(after.start, after.timeZone, now)}.`,
        });
      await queryClient.invalidateQueries({
        predicate: (q) =>
          [...changedQueries, "fits"].includes(String(q.queryKey[0])),
      });
    },
    onError: (error) => {
      const code = error instanceof ApiProblem ? error.code : null;
      if (code === "SLOT_UNAVAILABLE" && error instanceof ApiProblem) {
        setRefusal({
          values: form.getValues(),
          reasons: error.problem?.reasons ?? [],
          // The appointment's own time is no news: choosing it would change nothing.
          suggestions: (error.problem?.suggestions ?? []).filter(
            (t) => Date.parse(t.start) !== Date.parse(a.start),
          ),
        });
        return;
      }
      if (code === "ALREADY_CANCELLED") {
        void queryClient.invalidateQueries({
          queryKey: ["appointment", a.id],
        });
        return;
      }
      if (error instanceof ApiProblem && error.status === 422) {
        setServerProblems(
          (error.problem?.errors ?? []).map((e) =>
            serverProblem(e.field, e.message),
          ),
        );
        return;
      }
      setSaveError(error);
    },
  });
  const busy = save.isPending;

  if (saved) {
    const picked = saved.after.picked;
    return (
      <div className="grid gap-4">
        <Head appointment={a} />
        <div className="grid gap-6 lg:flex lg:items-start">
          <div className="grid min-w-0 content-start gap-6 lg:flex-1">
            <Alert
              kind="success"
              role="status"
              title="Change saved"
              actions={
                <>
                  <Button
                    variant="primary"
                    to={`/schedule?date=${localDateIn(saved.after.start, zone)}`}
                  >
                    Back to schedule
                  </Button>
                  {moved(saved.before, saved.after) && (
                    <Button to={`/manage/outbox?appointmentId=${a.id}`}>
                      See the message
                    </Button>
                  )}
                </>
              }
            >
              <p>{savedText(saved.before, saved.after, picked, now)}</p>
            </Alert>
          </div>
          <ChangeSummary
            className="lg:sticky lg:top-4 lg:w-(--size-side) lg:shrink-0"
            rows={savedRows(saved.before, saved.after, now)}
            footnote={SAME_NOTE}
          />
        </div>
      </div>
    );
  }

  const refusedNow = refusal !== null && sameValues(refusal.values, values);
  const fieldCount = problems.length;
  const reason = busy
    ? null
    : fieldCount > 0
      ? `Fix the ${fieldCount === 1 ? "field" : `${fieldCount} fields`} above to save.`
      : refusedNow
        ? "Pick a closest time, or change the form."
        : body === null && !unreadable
          ? flagged
            ? "Pick a time that fits, or change the form."
            : "Change the time, technician or bay to save."
          : null;
  const disabled = !busy && reason !== null;
  const footnote =
    fieldCount > 0
      ? "Nothing is checked until the form is fixed."
      : refusedNow
        ? "Nothing was changed. Your entries are still in the form."
        : SAME_NOTE;
  const rows = editRows(
    a,
    values,
    start,
    minutes,
    { technician: chosenTech?.name, bay: chosenBay?.name },
    refusedNow,
    now,
  );

  const set = (key: keyof AdjustValues, value: string) => {
    // A failed save was about the old values: once the form changes, its Try again would send something else.
    setSaveError(null);
    form.setValue(key, value, { shouldDirty: true, shouldValidate: submitted });
  };
  const fill = (s: TimeSlot) => {
    set("date", localDateIn(s.start, zone));
    set("time", formatTime(s.start, zone));
  };
  const submit = form.handleSubmit(
    () => {
      if (body) save.mutate(body);
    },
    (errors) => {
      const first = (["date", "time"] as const).find((k) => errors[k]);
      if (first) focusField(`field-${first}`);
    },
  );
  const label = (instant: string) => dayAndTime(instant, zone, now);
  const endLabel = (instant: string) => formatTime(instant, zone);
  const failureWords = saveError ? describeProblem(saveError) : null;
  const summary = [
    ...problems.map((p) => ({ name: p.name, message: p.summary })),
    ...serverProblems,
  ];
  const techName = a.display.technicianName ?? "";
  const bayName = a.display.serviceBayName ?? "";

  const saveButton = (
    <Button
      variant="primary"
      disabled={disabled}
      loading={busy}
      loadingLabel="Checking…"
      aria-describedby={reason ? "adjust-save-reason" : undefined}
      onClick={() => void submit()}
    >
      Save change
    </Button>
  );

  return (
    <div className="grid gap-4">
      <Head appointment={a} />
      {summary.length > 0 && (
        <FormSummary problems={summary} action="check this change" />
      )}
      {refusal && (
        <Alert
          key={JSON.stringify(refusal.values)}
          kind="danger"
          role={null}
          focusTitle
          title="That change was not saved."
        >
          <p>{clashText(refusal.reasons, a, dealership)}</p>
          {refusal.suggestions.length === 0 ? (
            <p>
              <b>There are no other times in the next 14 days.</b> Try another
              date, or leave the appointment where it is.
            </p>
          ) : (
            <SuggestionFillGroup
              title="Closest times that are free"
              items={refusal.suggestions.slice(0, 5)}
              pressed={start}
              onPick={fill}
              startLabel={label}
              endLabel={endLabel}
            />
          )}
        </Alert>
      )}
      {failureWords && (
        <Alert
          kind="danger"
          role={null}
          focusTitle
          title={failureWords.title}
          actions={
            <Button
              variant="primary"
              icon="refresh"
              loading={busy}
              loadingLabel="Checking…"
              onClick={() => void submit()}
            >
              Try again
            </Button>
          }
        >
          <p>{failureWords.body}</p>
        </Alert>
      )}
      {flagged && !refusal && (
        <Alert kind="warning" role={null} title="This booking no longer fits">
          <p>
            {flagSentences(a)} It is still booked and keeps its technician and
            bay until you move or cancel it. Moving it to a time that fits
            clears the flag.
          </p>
          <FitsList
            pending={fits.isPending}
            failed={fits.isError}
            suggestions={
              fits.data && !fits.data.available ? fits.data.suggestions : []
            }
            retry={() => void fits.refetch()}
            pressed={start}
            onPick={fill}
            startLabel={label}
            endLabel={endLabel}
            current={a.start}
          />
        </Alert>
      )}
      <div className="grid gap-6 lg:flex lg:items-start">
        <ChangeSummary
          className="lg:sticky lg:top-4 lg:order-last lg:w-(--size-side) lg:shrink-0"
          rows={rows}
          footnote={footnote}
        />
        <div className="grid min-w-0 content-start gap-6 lg:flex-1">
          <form
            noValidate
            aria-label="Change the appointment"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="grid gap-4"
          >
            <fieldset
              disabled={busy}
              className="m-0 grid min-w-0 gap-4 border-0 p-0"
            >
              <legend className="mb-2 p-0 text-lg font-semibold">
                New time and resources
              </legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <DateField
                  label="Date"
                  name="date"
                  thisYear={Number(today.slice(0, 4))}
                  value={values.date}
                  onChange={(e) => set("date", e.target.value)}
                  error={problems.find((p) => p.name === "date")?.message}
                />
                <TimeField
                  label="Start time"
                  name="time"
                  value={values.time}
                  onChange={(e) => set("time", e.target.value)}
                  error={problems.find((p) => p.name === "time")?.message}
                  helper={
                    start
                      ? endsText(
                          new Date(
                            Date.parse(start) + minutes * 60_000,
                          ).toISOString(),
                          zone,
                          minutes,
                        )
                      : undefined
                  }
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label="Technician"
                  name="technicianId"
                  value={values.technicianId}
                  onChange={(e) => set("technicianId", e.target.value)}
                  helper={`If ${techName} is busy at the new time, we pick another free technician and tell you.`}
                  options={[
                    { value: "", label: `Same as now (${techName})` },
                    ...technicians.map((t) => ({
                      value: t.id,
                      label: technicianOption(t, zone),
                    })),
                  ]}
                />
                <SelectField
                  label="Service bay"
                  name="serviceBayId"
                  value={values.serviceBayId}
                  onChange={(e) => set("serviceBayId", e.target.value)}
                  helper="Same idea: another free bay is picked if this one is busy."
                  options={[
                    { value: "", label: `Same as now (${bayName})` },
                    ...bays.map((b) => ({ value: b.id, label: b.name })),
                  ]}
                />
              </div>
            </fieldset>
            <p className="text-sm text-text-secondary">
              We check once more when you save, in case someone books first.
            </p>
          </form>
          <div className="hidden flex-wrap items-center gap-3 lg:flex">
            {saveButton}
            {reason && (
              <span
                id="adjust-save-reason"
                className="text-sm text-text-secondary"
              >
                {reason}
              </span>
            )}
            <Button
              variant="quiet"
              to={`/schedule?date=${localDateIn(a.start, zone)}`}
            >
              Leave without saving
            </Button>
          </div>
          <section aria-labelledby="adjust-cancel" className="grid gap-3">
            <h2 id="adjust-cancel" className="text-lg">
              Cancel this appointment
            </h2>
            <p className="max-w-(--measure)">
              The time becomes free again. The customer is sent a cancellation
              message and their reminders are cancelled. This cannot be undone.
            </p>
            <div>
              <Button
                aria-haspopup="dialog"
                onClick={() => setCancelling(true)}
              >
                Cancel appointment
              </Button>
            </div>
          </section>
        </div>
      </div>
      <ActionBar
        title={start ? label(start) : label(a.start)}
        status={
          refusedNow
            ? "Refused. Nothing was changed"
            : (fieldCount > 0 && reason) ||
              (body === null && !unreadable
                ? flagged
                  ? flaggedStatus(a)
                  : "No change yet"
                : `Was ${label(a.start)}`)
        }
        actions={saveButton}
      />
      <CancelDialog
        appointment={cancelling ? a : null}
        now={now}
        onClose={() => setCancelling(false)}
        onCancelled={() => {
          setCancelling(false);
          onCancelled();
        }}
      />
    </div>
  );
}

/** A 422 from the API: a field the form has links to it; any other is listed without a link. */
function serverProblem(field: string, message: string) {
  const name =
    field === "start"
      ? "time"
      : field === "technicianId" || field === "serviceBayId"
        ? field
        : null;
  return { name: name ?? field, message, link: name !== null };
}

function FitsList({
  pending,
  failed,
  suggestions,
  retry,
  pressed,
  onPick,
  startLabel,
  endLabel,
  current,
}: {
  pending: boolean;
  failed: boolean;
  suggestions: readonly TimeSlot[];
  retry: () => void;
  pressed: string | null;
  onPick: (s: TimeSlot) => void;
  startLabel: (instant: string) => string;
  endLabel: (instant: string) => string;
  current: string;
}) {
  if (pending) {
    return (
      <div aria-busy="true" className="grid gap-2">
        <span role="status" className="sr-only">
          Loading the times that fit
        </span>
        <Skeleton className="h-(--size-target) w-3/4" />
      </div>
    );
  }
  if (failed) {
    return (
      <p className="flex flex-wrap items-center gap-3">
        We could not load the times that fit.
        <Button icon="refresh" onClick={retry}>
          Try again
        </Button>
      </p>
    );
  }
  const items = suggestions
    .filter((s) => Date.parse(s.start) !== Date.parse(current))
    .slice(0, 5);
  if (items.length === 0) {
    return (
      <p>
        <b>There are no other times in the next 14 days.</b> Try another date,
        or leave the appointment where it is.
      </p>
    );
  }
  return (
    <SuggestionFillGroup
      title="Times that fit"
      items={items}
      pressed={pressed}
      onPick={onPick}
      startLabel={startLabel}
      endLabel={endLabel}
    />
  );
}
