// `shifts` (manager.md 4.4, 5.4; REQ-BOOK-006, REQ-BOOK-008). One technician's weekly pattern with one break,
// and leave or a different shift on single dates. Save asks the API first what the change would flag (D-0001-36 A).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useSearchParams } from "react-router";
import { z } from "zod";
import { mockEnabled } from "../../../config";
import type { components } from "../../../api/contract/schema";
import { devPanelPath } from "../../app/guard";
import { Alert } from "../../components/Alert";
import { Button } from "../../components/Button";
import { DateExceptionList } from "../../components/DateExceptionList";
import { Dialog } from "../../components/Dialog";
import { focusField } from "../../components/Fields";
import { DatePicker } from "../../components/DatePicker";
import { Select } from "../../components/Select";
import { afterStart, TimeField } from "../../components/TimeField";
import { FlagImpactDialog } from "../../components/FlagImpactDialog";
import { StateBlock } from "../../components/StateBlock";
import { useToast } from "../../components/Toast";
import { WeekPatternEditor } from "../../components/WeekPatternEditor";
import { ApiProblem, call, type Dealership } from "../../data/api-problem";
import {
  addDaysToLocalDate,
  localDateIn,
  placeOfZone,
} from "../../format/format";
import { FormSummary } from "../../forms/FormSummary";
import { zodResolver } from "../../forms/resolver";
import { useSelectedDealership } from "../../session/dealership";
import { useSession } from "../../session/session";
import { savedWords, shiftRows, shiftsChangeSentence } from "./flag-impact";
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
import type { Problem } from "./settings-form";
import {
  addDates,
  addEntryProblems,
  addedLine,
  dealershipHint,
  emptyAddEntry,
  entryRowWords,
  sameShifts,
  shiftDayChange,
  shiftsFromTechnician,
  shiftsProblems,
  shiftsRequest,
  type ShiftRow,
  type ShiftsRequest,
  type ShiftsValues,
} from "./shifts-form";
import { dateWords, weekdayNames } from "./words";

type Technician = components["schemas"]["Technician"];

const TITLE = "Shifts";
const LIST_PATH = "/manage/shifts";

/** Skills in the words the screens use (Q-0001-210). An unknown skill shows as it is stored. */
const skillWords: Record<string, string> = {
  mechanic: "Service",
  ev: "Electric cars",
};
export const skillsText = (skills: readonly string[]): string =>
  skills.map((s) => skillWords[s] ?? s).join(", ");

export function ShiftsPage() {
  const { client } = useSession();
  const { selected } = useSelectedDealership();
  const [params, setParams] = useSearchParams();
  const id = selected?.id;
  const zone = selected?.timeZone;
  // The dealership arrives after the first render, so today is worked out once its zone is known.
  const today = useMemo(
    () => (zone ? localDateIn(Date.now(), zone) : undefined),
    [zone],
  );
  const technicians = useQuery({
    queryKey: ["technicians", id, today],
    queryFn: () =>
      call(
        client.GET("/dealerships/{dealershipId}/technicians", {
          params: {
            path: { dealershipId: id! },
            query: { from: today!, to: addDaysToLocalDate(today!, 30) },
          },
        }),
      ),
    enabled: id !== undefined && today !== undefined,
  });
  const lede = selected
    ? `Weekly pattern, leave and extra shifts for each technician at ${selected.name}. All times are ${placeOfZone(selected.timeZone)} time.`
    : undefined;
  // The id in the address is only looked up in the list the API gave (SEC-12).
  const asked = params.get("technicianId");
  const list = technicians.data ?? [];
  const technician = asked ? list.find((t) => t.id === asked) : list[0];
  // A save answered 404: the technician is gone or works elsewhere (SEC-4.AC-3).
  const [lost, setLost] = useState<string | null>(null);

  let body;
  if (technicians.isError) {
    body = (
      <LoadFailed
        what="the shifts"
        error={technicians.error}
        retry={() => void technicians.refetch()}
      />
    );
  } else if (!technicians.data || !selected || !today) {
    body = <FormSkeleton label="Loading the shifts" />;
  } else if (list.length === 0) {
    body = (
      <div className="max-w-(--size-form)">
        <StateBlock
          kind="empty"
          title="No technicians yet"
          headingLevel={2}
          actions={
            mockEnabled ? (
              <Button variant="primary" to={devPanelPath}>
                Open the dev panel
              </Button>
            ) : undefined
          }
        >
          This dealership has no technicians in the demo data, so there are no
          shifts to edit. Technicians come with the demo data; there is no
          screen to add one.
          {mockEnabled
            ? " You can reset the demo data from the dev panel."
            : ""}
        </StateBlock>
      </div>
    );
  } else if (!technician || lost === technician.id) {
    body = (
      <div className="max-w-(--size-form)">
        <StateBlock
          kind="not-found"
          title="We cannot find that technician."
          headingLevel={2}
          focusTitle
          actions={
            <Button variant="primary" to={LIST_PATH}>
              Show all technicians
            </Button>
          }
        >
          They may have been removed, or they work somewhere else. Choose a
          technician from the list.
        </StateBlock>
      </div>
    );
  } else {
    body = (
      <ShiftsForm
        key={technician.id}
        technician={technician}
        technicians={list}
        dealership={selected}
        today={today}
        onPick={(next) =>
          setParams((previous) => {
            const p = new URLSearchParams(previous);
            p.set("technicianId", next);
            return p;
          })
        }
        onLost={() => {
          setLost(technician.id);
          void technicians.refetch();
        }}
      />
    );
  }
  return (
    <div className="grid gap-4">
      <PageHead title={TITLE} lede={lede} />
      {body}
    </div>
  );
}

const problemAt = (problems: readonly Problem[], path: string) =>
  problems.find((p) => p.path === path)?.message;

function ShiftsForm({
  technician,
  technicians,
  dealership,
  today,
  onPick,
  onLost,
}: {
  technician: Technician;
  technicians: readonly Technician[];
  dealership: Dealership;
  today: string;
  onPick: (id: string) => void;
  onLost: () => void;
}) {
  const { client } = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const zone = dealership.timeZone;
  const name = technician.name;
  const [saved, setSaved] = useState(() =>
    shiftsFromTechnician(technician, today),
  );
  const schema = useMemo(
    () =>
      z.custom<ShiftsValues>().superRefine((values, ctx) => {
        for (const p of shiftsProblems(values, today)) {
          ctx.addIssue({
            code: "custom",
            path: p.path.split("."),
            message: p.message,
          });
        }
      }),
    [today],
  );
  const form = useForm<ShiftsValues>({
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
  const [switchTo, setSwitchTo] = useState<string | null>(null);
  const keepEditing = useRef<HTMLButtonElement>(null);
  const keepEditingLeave = useRef<HTMLButtonElement>(null);

  const dirty = !sameShifts(values, saved);
  const submitted = form.formState.isSubmitted;
  const problems = submitted ? shiftsProblems(values, today) : [];
  const shown = [
    ...problems,
    ...(addTried ? addEntryProblems(values, today) : []).filter(
      (p) => !problems.some((q) => q.path === p.path),
    ),
  ];
  const leaveGuard = useLeaveGuard(dirty);

  const flow = useSaveFlow<ShiftsRequest>({
    put: (body, preview) =>
      call(
        client.PUT("/technicians/{technicianId}/shifts", {
          params: {
            path: { technicianId: technician.id },
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
      return new Set(
        flagged
          .filter((a) => a.technicianId === technician.id)
          .map((a) => a.id),
      );
    },
    onSaved: (count) => {
      const now = form.getValues();
      const next: ShiftsValues = {
        ...now,
        entries: now.entries.map((e) => ({ ...e, isNew: false })),
        add: emptyAddEntry,
      };
      const words = savedWords("shifts", count, name);
      setSaved(next);
      form.reset(next);
      setAddTried(false);
      setResult({ ...words, flagged: count });
      toast.show({ kind: "success", message: words.toast });
      void queryClient.invalidateQueries({
        predicate: (q) =>
          ["technicians", "flagged-count", "appointments"].includes(
            String(q.queryKey[0]),
          ),
      });
    },
  });
  const phase = flow.phase;
  const busy = phase.kind === "checking" || phase.kind === "saving";
  const notFound =
    phase.kind === "failed" &&
    phase.error instanceof ApiProblem &&
    phase.error.status === 404;
  useEffect(() => {
    if (notFound) onLost();
  }, [notFound, onLost]);

  const changed = (line: string) => {
    setLastChange(line);
    setResult(null);
  };
  const set = <K extends keyof ShiftsValues>(key: K, value: ShiftsValues[K]) =>
    form.setValue(key, value as never, {
      shouldDirty: true,
      shouldValidate: submitted,
    });

  const save = form.handleSubmit(
    (v) => {
      setResult(null);
      void flow.start(shiftsRequest(v, technician, today));
    },
    () => {
      const first = shiftsProblems(form.getValues(), today)[0];
      if (first) focusField(`field-${first.path}`);
    },
  );

  const editDay = (
    i: number,
    change: { off: boolean } | { key: string; value: string },
  ) => {
    const before = values.days[i]!;
    const after: ShiftRow =
      "off" in change
        ? { off: change.off, start: "", end: "", breakStart: "", breakEnd: "" }
        : { ...before, [change.key]: change.value };
    set(
      "days",
      values.days.map((d, j) => (j === i ? after : d)),
    );
    const usual = saved.days[i]!;
    changed(
      JSON.stringify(after) === JSON.stringify(usual)
        ? `${weekdayNames[i]} is back to its saved shift`
        : shiftDayChange(weekdayNames[i]!, usual, after),
    );
  };

  const addEntry = () => {
    const current = form.getValues();
    const refused = addEntryProblems(current, today);
    if (refused.length > 0) {
      setAddTried(true);
      focusField(`field-${refused[0]!.path}`);
      return;
    }
    const { add } = current;
    const dates = addDates(add);
    const times =
      add.kind === "leave"
        ? { start: "", end: "", breakStart: "", breakEnd: "" }
        : {
            start: add.start,
            end: add.end,
            breakStart: add.breakStart,
            breakEnd: add.breakEnd,
          };
    set(
      "entries",
      [
        ...current.entries,
        ...dates.map((date) => ({
          date,
          kind: add.kind,
          isNew: true,
          ...times,
        })),
      ].sort((a, b) => a.date.localeCompare(b.date)),
    );
    set("add", { ...emptyAddEntry, kind: add.kind });
    setAddTried(false);
    changed(addedLine(add, dates, today));
  };

  const removeEntry = (date: string) => {
    set(
      "entries",
      values.entries.filter((e) => e.date !== date),
    );
    changed(`Removed the change for ${dateWords(date, today)}`);
  };

  const pick = (id: string) => {
    if (id === technician.id) return;
    if (dirty) setSwitchTo(id);
    else onPick(id);
  };
  const index = technicians.findIndex((t) => t.id === technician.id);
  const step = (by: number) =>
    pick(
      technicians[(index + by + technicians.length) % technicians.length]!.id,
    );

  const days = values.days.map((d, i) => {
    const problem = shown.find((p) => p.path.startsWith(`days.${i}.`));
    return {
      label: weekdayNames[i]!,
      hint: dealershipHint(dealership, i),
      off: d.off,
      times: {
        start: d.start,
        end: d.end,
        breakStart: d.breakStart,
        breakEnd: d.breakEnd,
      },
      error: problem
        ? { fields: [problem.path.split(".")[2]!], message: problem.message }
        : undefined,
    };
  });
  const touched =
    phase.kind === "confirm" || phase.kind === "saving" ? phase.touched : [];
  const add = values.add;
  const addTime = (
    key: "start" | "end" | "breakStart" | "breakEnd",
    label: string,
  ) => (
    <Controller
      control={form.control}
      name={`add.${key}`}
      render={({ field }) => (
        <TimeField
          label={label}
          optional={label.endsWith("(optional)")}
          error={problemAt(shown, `add.${key}`)}
          {...(key === "end"
            ? afterStart(add.start, "end after it starts")
            : {})}
          {...field}
        />
      )}
    />
  );

  return (
    <div className="grid max-w-(--size-form) gap-6">
      {problems.length > 0 && (
        <FormSummary
          action="save"
          problems={problems.map((p) => ({ name: p.path, message: p.short }))}
        />
      )}
      {phase.kind === "failed" && !notFound && (
        <SaveFailed error={phase.error} retry={() => void save()} />
      )}
      {result && <SavedAlert result={result} />}
      <div className="grid gap-1">
        <div className="flex items-end gap-2">
          <Button
            size="icon"
            icon="left"
            aria-label="Previous technician"
            disabled={busy}
            onClick={() => step(-1)}
          />
          <div className="min-w-0 flex-1">
            <Select
              label="Technician"
              name="technician"
              value={technician.id}
              disabled={busy}
              options={technicians.map((t) => ({
                value: t.id,
                label: `${t.name} · ${skillsText(t.skills)}`,
              }))}
              onChange={pick}
            />
          </div>
          <Button
            size="icon"
            icon="right"
            aria-label="Next technician"
            disabled={busy}
            onClick={() => step(1)}
          />
        </div>
        <p className="text-sm text-text-secondary">
          Skills: {skillsText(technician.skills)}. Skills come with the demo
          data and are not edited here.
        </p>
      </div>
      <Alert kind="info" title="Changing a shift never deletes a booking">
        <p>
          If a booking no longer fits this technician’s shift, we tell you
          before you save. It stays booked and shows up under Flagged, so you
          can move or cancel it.
        </p>
      </Alert>
      <form
        noValidate
        aria-label={`Shifts for ${name}`}
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
            id="shifts-week"
            title="Weekly pattern"
            hint="The hours this technician works each week, with one optional break. Time outside the dealership’s opening hours cannot be booked. Use times on the quarter hour, for example 09:15."
          >
            <WeekPatternEditor
              mode="shift"
              days={days}
              disabled={busy}
              onChange={editDay}
            />
          </Panel>
          <Panel
            id="shifts-dates"
            title="Leave and extra shifts"
            hint="A date here replaces the weekly pattern for that day. Use it for leave, an extra shift on a day off, or different hours for one day. Earlier dates are not shown."
          >
            <DateExceptionList
              listLabel="Dates that differ from the weekly pattern"
              items={values.entries.map((entry) => ({
                key: entry.date,
                dateText: dateWords(entry.date, today),
                isNew: entry.isNew,
                ...entryRowWords(entry, values.days),
              }))}
              onRemove={removeEntry}
              disabled={busy}
              addLegend="Add leave or a different shift"
              addNote="Adding a date does not save it. Nothing is saved until you press Save shifts."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Controller
                  control={form.control}
                  name="add.first"
                  render={({ field }) => (
                    <DatePicker
                      label="First day"
                      today={today}
                      min={today}
                      error={problemAt(shown, "add.first")}
                      {...field}
                      disabled={busy}
                    />
                  )}
                />
                <Controller
                  control={form.control}
                  name="add.last"
                  render={({ field }) => (
                    <DatePicker
                      label="Last day (optional)"
                      today={today}
                      min={today}
                      helper={
                        add.last === "" ? "Leave empty for one day." : undefined
                      }
                      error={problemAt(shown, "add.last")}
                      {...field}
                      disabled={busy}
                    />
                  )}
                />
              </div>
              <Controller
                control={form.control}
                name="add.kind"
                render={({ field }) => (
                  <Select
                    label="What happens on these days"
                    helper="On leave hides the four time fields below."
                    options={[
                      { value: "leave", label: "On leave" },
                      { value: "changed", label: "Works a different shift" },
                    ]}
                    {...field}
                  />
                )}
              />
              {add.kind === "changed" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {addTime("start", "Starts")}
                  {addTime("end", "Ends")}
                  {addTime("breakStart", "Break starts (optional)")}
                  {addTime("breakEnd", "Break ends (optional)")}
                </div>
              )}
              <div>
                <Button icon="plus" onClick={addEntry}>
                  Add to the list
                </Button>
              </div>
            </DateExceptionList>
          </Panel>
        </fieldset>
        <SaveControls
          label="Save shifts"
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
        changeSentence={shiftsChangeSentence(
          saved,
          values,
          touched,
          name,
          zone,
          today,
        )}
        bookings={shiftRows(touched, values, name, zone)}
        onBack={flow.back}
        onConfirm={flow.confirm}
      />
      <Dialog
        open={switchTo !== null}
        title="Switch technician without saving?"
        destructive
        initialFocus={keepEditing}
        onClose={() => setSwitchTo(null)}
        actions={
          <>
            <Button ref={keepEditing} onClick={() => setSwitchTo(null)}>
              Keep editing
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const next = switchTo;
                setSwitchTo(null);
                if (next) onPick(next);
              }}
            >
              Switch without saving
            </Button>
          </>
        }
      >
        <p>
          You changed {name}’s shifts and have not saved them. If you switch
          now, the changes are lost.
        </p>
      </Dialog>
      <Dialog
        open={leaveGuard.leaving}
        title="Leave without saving?"
        destructive
        initialFocus={keepEditingLeave}
        onClose={leaveGuard.stay}
        actions={
          <>
            <Button ref={keepEditingLeave} onClick={leaveGuard.stay}>
              Keep editing
            </Button>
            <Button variant="danger" onClick={leaveGuard.leave}>
              Leave without saving
            </Button>
          </>
        }
      >
        <p>
          You changed {name}’s shifts and have not saved them. If you leave now,
          the changes are lost.
        </p>
      </Dialog>
    </div>
  );
}
