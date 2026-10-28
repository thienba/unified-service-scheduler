// `dealership-settings` (manager.md 4.3, 5.3; REQ-BOOK-007, REQ-BOOK-011.AC-5). Weekly hours, dates with
// different hours and the booking rules of the manager's dealership. Save asks the API first what the change
// would flag (D-0001-36 A).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert } from "../../components/Alert";
import { Button } from "../../components/Button";
import { DateExceptionList } from "../../components/DateExceptionList";
import { Dialog } from "../../components/Dialog";
import {
  DateField,
  SelectField,
  TextField,
  TimeField,
  focusField,
} from "../../components/Fields";
import { FlagImpactDialog } from "../../components/FlagImpactDialog";
import { useToast } from "../../components/Toast";
import { WeekPatternEditor } from "../../components/WeekPatternEditor";
import { call, type Dealership } from "../../data/api-problem";
import { localDateIn, placeOfZone } from "../../format/format";
import { FormSummary } from "../../forms/FormSummary";
import { zodResolver } from "../../forms/resolver";
import { useSelectedDealership } from "../../session/dealership";
import { useSession } from "../../session/session";
import { hoursChangeSentence, hoursRows, savedWords } from "./flag-impact";
import { useLeaveGuard } from "./leave-guard";
import {
  FormSkeleton,
  LoadFailed,
  PageHead,
  Panel,
  SaveControls,
  SaveFailed,
  SavedAlert,
  type SavedResult,
} from "./parts";
import { useSaveFlow } from "./save-flow";
import {
  addDateProblems,
  dateRowWords,
  emptyAdd,
  sameSettings,
  settingsFromDealership,
  settingsProblems,
  settingsRequest,
  weekdayChange,
  type HoursRow,
  type Problem,
  type SettingsRequest,
  type SettingsValues,
} from "./settings-form";
import { dateWords, weekdayNames } from "./words";

const TITLE = "Dealership settings";

export function DealershipSettingsPage() {
  const { client } = useSession();
  const { selected } = useSelectedDealership();
  const id = selected?.id;
  const dealership = useQuery({
    queryKey: ["dealership", id],
    queryFn: () =>
      call(
        client.GET("/dealerships/{dealershipId}", {
          params: { path: { dealershipId: id! } },
        }),
      ),
    enabled: id !== undefined,
  });
  const lede = selected
    ? `Opening hours and booking rules for ${selected.name}. All times are ${placeOfZone(selected.timeZone)} time.`
    : undefined;
  return (
    <div className="grid gap-4">
      <PageHead title={TITLE} lede={lede} />
      {dealership.isError ? (
        <LoadFailed
          what="the settings"
          error={dealership.error}
          retry={() => void dealership.refetch()}
        />
      ) : dealership.data ? (
        <SettingsForm key={dealership.data.id} dealership={dealership.data} />
      ) : (
        <FormSkeleton label="Loading the settings" />
      )}
    </div>
  );
}

const problemAt = (problems: readonly Problem[], path: string) =>
  problems.find((p) => p.path === path)?.message;

function SettingsForm({ dealership }: { dealership: Dealership }) {
  const { client } = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const zone = dealership.timeZone;
  const [today] = useState(() => localDateIn(Date.now(), zone));
  const [saved, setSaved] = useState(() =>
    settingsFromDealership(dealership, today),
  );
  const schema = useMemo(
    () =>
      z.custom<SettingsValues>().superRefine((values, ctx) => {
        for (const p of settingsProblems(values, today)) {
          ctx.addIssue({
            code: "custom",
            path: p.path.split("."),
            message: p.message,
          });
        }
      }),
    [today],
  );
  const form = useForm<SettingsValues>({
    defaultValues: saved,
    resolver: zodResolver(schema),
    // The screen moves focus to the first problem itself (focusField); the
    // form's own focus step would otherwise move it again to a later field.
    shouldFocusError: false,
  });
  const values = form.watch();
  const [lastChange, setLastChange] = useState("");
  const [addTried, setAddTried] = useState(false);
  const [result, setResult] = useState<SavedResult | null>(null);

  const dirty = !sameSettings(values, saved);
  const submitted = form.formState.isSubmitted;
  const problems = submitted ? settingsProblems(values, today) : [];
  const shown = [
    ...problems,
    ...(addTried ? addDateProblems(values, today) : []).filter(
      (p) => !problems.some((q) => q.path === p.path),
    ),
  ];
  const leaveGuard = useLeaveGuard(dirty);
  const keepEditing = useRef<HTMLButtonElement>(null);

  const flow = useSaveFlow<SettingsRequest>({
    put: (body, preview) =>
      call(
        client.PUT("/dealerships/{dealershipId}/settings", {
          params: {
            path: { dealershipId: dealership.id },
            query: preview ? { preview: true } : {},
          },
          body,
        }),
      ),
    flaggedBefore: async () => {
      const flagged = await call(
        client.GET("/appointments", {
          params: { query: { dealershipId: dealership.id, flagged: true } },
        }),
      );
      return new Set(flagged.map((a) => a.id));
    },
    onSaved: (count) => {
      const now = form.getValues();
      const next: SettingsValues = {
        ...now,
        dates: now.dates.map((d) => ({ ...d, isNew: false })),
        add: emptyAdd,
      };
      const words = savedWords("settings", count);
      setSaved(next);
      form.reset(next);
      setAddTried(false);
      setResult({ ...words, flagged: count });
      toast.show({ kind: "success", message: words.toast });
      void queryClient.invalidateQueries({
        predicate: (q) =>
          [
            "dealership",
            "dealerships",
            "flagged-count",
            "appointments",
          ].includes(String(q.queryKey[0])),
      });
    },
  });
  const busy = flow.phase.kind === "checking" || flow.phase.kind === "saving";

  const changed = (line: string) => {
    setLastChange(line);
    setResult(null);
  };
  const set = <K extends keyof SettingsValues>(
    key: K,
    value: SettingsValues[K],
  ) =>
    form.setValue(key, value as never, {
      shouldDirty: true,
      shouldValidate: submitted,
    });

  const save = form.handleSubmit(
    (v) => {
      setResult(null);
      void flow.start(settingsRequest(v, dealership, today));
    },
    () => {
      const first = settingsProblems(form.getValues(), today)[0];
      if (first) focusField(`field-${first.path}`);
    },
  );

  const editDay = (
    i: number,
    change: { off: boolean } | { key: string; value: string },
  ) => {
    const before = values.days[i]!;
    const after: HoursRow =
      "off" in change
        ? { off: change.off, open: "", close: "" }
        : { ...before, [change.key]: change.value };
    set(
      "days",
      values.days.map((d, j) => (j === i ? after : d)),
    );
    const usual = saved.days[i]!;
    changed(
      JSON.stringify(after) === JSON.stringify(usual)
        ? `${weekdayNames[i]} is back to its saved hours`
        : weekdayChange(weekdayNames[i]!, usual, after),
    );
  };

  const addDate = () => {
    const current = form.getValues();
    const refused = addDateProblems(current, today);
    if (refused.length > 0) {
      setAddTried(true);
      focusField(`field-${refused[0]!.path}`);
      return;
    }
    const { add } = current;
    set(
      "dates",
      [...current.dates, { ...add, isNew: true }].sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
    );
    set("add", { ...emptyAdd, kind: add.kind });
    setAddTried(false);
    changed(`${dateWords(add.date, today)} added to the list`);
  };

  const removeDate = (date: string) => {
    set(
      "dates",
      values.dates.filter((d) => d.date !== date),
    );
    changed(`Removed the change for ${dateWords(date, today)}`);
  };

  const register = (
    name: "notice" | "horizon" | "breakMinutes",
    line: (v: string) => string,
  ) =>
    form.register(name, {
      onChange: (e: { target: { value: string } }) =>
        changed(line(e.target.value)),
    });

  const days = values.days.map((d, i) => {
    const problem = shown.find((p) => p.path.startsWith(`days.${i}.`));
    return {
      label: weekdayNames[i]!,
      off: d.off,
      times: { open: d.open, close: d.close },
      error: problem
        ? { fields: [problem.path.split(".")[2]!], message: problem.message }
        : undefined,
    };
  });

  const phase = flow.phase;
  const touched =
    phase.kind === "confirm" || phase.kind === "saving" ? phase.touched : [];
  const add = values.add;

  return (
    <div className="grid max-w-(--size-form) gap-6">
      {problems.length > 0 && (
        <FormSummary
          action="save"
          problems={problems.map((p) => ({ name: p.path, message: p.short }))}
        />
      )}
      {phase.kind === "failed" && (
        <SaveFailed error={phase.error} retry={() => void save()} />
      )}
      {result && <SavedAlert result={result} />}
      <Alert kind="info" title="Shortening hours never deletes a booking">
        <p>
          If a booking no longer fits the new hours, we tell you before you
          save. It stays booked and shows up under Flagged, so you can move or
          cancel it.
        </p>
      </Alert>
      <form
        noValidate
        aria-label={TITLE}
        className="grid gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset
          disabled={busy}
          className="m-0 grid min-w-0 gap-6 border-0 p-0"
        >
          <Panel
            id="settings-week"
            title="Opening hours each week"
            hint="These hours repeat every week. A booking has to fit wholly inside them. Use times on the quarter hour, for example 08:15."
          >
            <WeekPatternEditor
              mode="hours"
              days={days}
              disabled={busy}
              onChange={editDay}
            />
          </Panel>
          <Panel
            id="settings-dates"
            title="Different hours on one date"
            hint="Use this for a bank holiday, a late opening or a day the dealership is shut. It replaces the weekly hours for that date. Earlier dates are not shown."
          >
            <DateExceptionList
              listLabel="Dates with different hours"
              items={values.dates.map((row) => ({
                key: row.date,
                dateText: dateWords(row.date, today),
                isNew: row.isNew,
                ...dateRowWords(row, values.days),
              }))}
              onRemove={removeDate}
              disabled={busy}
              addLegend="Add a date"
              addNote="Adding a date does not save it. Nothing is saved until you press Save settings."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <DateField
                  label="Date"
                  thisYear={Number(today.slice(0, 4))}
                  min={today}
                  error={problemAt(shown, "add.date")}
                  {...form.register("add.date")}
                  value={add.date}
                />
                <SelectField
                  label="What happens on this date"
                  options={[
                    { value: "hours", label: "Open different hours" },
                    { value: "closed", label: "Closed all day" },
                  ]}
                  {...form.register("add.kind")}
                  value={add.kind}
                />
              </div>
              {add.kind === "hours" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <TimeField
                    label="Opens"
                    className="num"
                    error={problemAt(shown, "add.open")}
                    {...form.register("add.open")}
                    value={add.open}
                  />
                  <TimeField
                    label="Closes"
                    className="num"
                    error={problemAt(shown, "add.close")}
                    {...form.register("add.close")}
                    value={add.close}
                  />
                </div>
              )}
              <div>
                <Button icon="plus" onClick={addDate}>
                  Add this date
                </Button>
              </div>
            </DateExceptionList>
          </Panel>
          <Panel
            id="settings-rules"
            title="Booking rules"
            hint="These rules apply to new bookings and new searches straight away. They never change a booking that already exists."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Shortest notice (hours)"
                type="number"
                inputMode="numeric"
                min={0}
                max={72}
                step={1}
                className="num"
                helper="A customer cannot book a start time sooner than this. It is also the last moment a customer can cancel or change a booking online."
                error={problemAt(shown, "notice")}
                {...register(
                  "notice",
                  (v) => `Shortest notice is now ${v} hours`,
                )}
              />
              <TextField
                label="Furthest ahead (days)"
                type="number"
                inputMode="numeric"
                min={1}
                max={365}
                step={1}
                className="num"
                helper="Customers can book up to this many days from today."
                error={problemAt(shown, "horizon")}
                {...register(
                  "horizon",
                  (v) => `Furthest ahead is now ${v} days`,
                )}
              />
              <TextField
                label="Break between a technician’s jobs (minutes)"
                type="number"
                inputMode="numeric"
                min={0}
                max={60}
                step={5}
                className="num"
                helper="Rest time after each job. It applies to technicians only, not to bays."
                error={problemAt(shown, "breakMinutes")}
                {...register(
                  "breakMinutes",
                  (v) => `The break is now ${v} minutes`,
                )}
              />
              <dl className="cols-icon-text m-0 grid content-start gap-x-4 gap-y-2">
                <dt className="text-sm text-text-secondary">Time zone</dt>
                <dd className="m-0 font-medium wrap-anywhere">
                  {zone} ({placeOfZone(zone)} time)
                </dd>
              </dl>
            </div>
            <p className="text-sm text-text-secondary">
              The time zone was set when the dealership was set up. It cannot be
              changed here.
            </p>
          </Panel>
        </fieldset>
        <SaveControls
          label="Save settings"
          phase={phase}
          dirty={dirty}
          problems={problems.length}
          lastChange={lastChange}
          onSave={() => void save()}
          onDiscard={() => {
            form.reset(saved);
            setAddTried(false);
            setLastChange("");
          }}
        />
      </form>
      <FlagImpactDialog
        open={touched.length > 0}
        loading={phase.kind === "saving"}
        changeSentence={hoursChangeSentence(
          saved,
          values,
          touched,
          zone,
          today,
        )}
        bookings={hoursRows(touched, values, zone)}
        onBack={flow.back}
        onConfirm={flow.confirm}
      />
      <Dialog
        open={leaveGuard.leaving}
        title="Leave without saving?"
        destructive
        initialFocus={keepEditing}
        onClose={leaveGuard.stay}
        actions={
          <>
            <Button ref={keepEditing} onClick={leaveGuard.stay}>
              Keep editing
            </Button>
            <Button variant="danger" onClick={leaveGuard.leave}>
              Leave without saving
            </Button>
          </>
        }
      >
        <p>
          You changed the opening hours and have not saved them. If you leave
          now, the changes are lost.
        </p>
      </Dialog>
    </div>
  );
}
