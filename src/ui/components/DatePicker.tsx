// design.md 8.29 (D-0001-131, D-0001-132): a date typed in three segments (dd/mm/yyyy) with a calendar button, and
// the Calendar in a popover (or a bottom sheet on a phone). Days outside the field's limits are crossed out and
// cannot be chosen; days the dealership is closed are crossed out and hatched; a sentence under the grid says
// why. `DayButton` is the schedule's day picker: the same Calendar behind a button, nothing to type.
// "Today" is the dealership's today, given by the screen (AD-9), never the browser's.
import { parseDate, type CalendarDate } from "@internationalized/date";
import type { Ref } from "react";
import { useContext, useId, useMemo, useState } from "react";
import {
  Button as AriaButton,
  Calendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  CalendarStateContext,
  DateInput,
  DatePicker as AriaDatePicker,
  DateSegment,
  DialogTrigger,
  Group,
  Heading,
  I18nProvider,
  Label,
  Text,
  type DateValue,
} from "react-aria-components";
import { addDaysToLocalDate, formatLocalDate } from "../format/format";
import { Button } from "./Button";
import { cx } from "./cx";
import { fieldId } from "./Fields";
import { Icon } from "./Icon";
import { Picker } from "./Picker";

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

function toDate(value: string | undefined): CalendarDate | null {
  if (!value || !LOCAL_DATE.test(value)) return null;
  try {
    const date = parseDate(value);
    return date.toString() === value ? date : null;
  } catch {
    return null;
  }
}

/** The limits of a date field. Days before `min` and after `max` are crossed out; `closed` days are also hatched. */
export interface DateLimits {
  /** `YYYY-MM-DD`, the first day that can be chosen. */
  min?: string | undefined;
  /** `YYYY-MM-DD`, the last day that can be chosen. */
  max?: string | undefined;
  /** True for a day the dealership is closed. */
  closed?: ((date: string) => boolean) | undefined;
  /** The sentence under the grid that says why days are crossed out. */
  limitsText?: string | undefined;
  /** Why a day before `min` cannot be chosen: "Bookings need 2 hours notice." */
  tooSoonReason?: string | undefined;
  /** Why a day after `max` cannot be chosen: "Bookings open up to Fri 27 Nov." */
  tooLateReason?: string | undefined;
}

const navButton =
  "inline-flex size-(--size-target) items-center justify-center rounded-pill text-text outline-none transition-colors duration-(--duration-fast) ease-out data-focus-visible:outline-solid data-focus-visible:outline-(length:--focus-ring-width) data-focus-visible:outline-focus-ring data-focus-visible:outline-offset-(--focus-ring-offset) data-hovered:bg-surface-page data-pressed:bg-surface-sunken border border-solid border-transparent data-disabled:cursor-not-allowed data-disabled:border-border-subtle data-disabled:bg-surface-sunken data-disabled:text-text-secondary";

const dayNumber = (date: string) => Number(date.slice(8));

/** The inside of an open calendar. Must sit inside a React Aria `Calendar`. */
function CalendarBody({
  today,
  thisYear,
  min,
  max,
  closed,
  limitsText,
}: DateLimits & { today: string; thisYear: number }) {
  const state = useContext(CalendarStateContext);
  // The key shows real days of this calendar: one before the first day (or after the last), and a closed one.
  const offDay =
    min !== undefined
      ? addDaysToLocalDate(min, -1)
      : max !== undefined
        ? addDaysToLocalDate(max, 1)
        : today;
  const closedDay = closed
    ? Array.from({ length: 14 }, (_, i) =>
        addDaysToLocalDate(min ?? today, i),
      ).find(closed)
    : undefined;
  const todayDate = toDate(today);
  const todayOff =
    (min !== undefined && today < min) ||
    (max !== undefined && today > max) ||
    (closed?.(today) ?? false);
  return (
    <>
      <div className="cal-head">
        <AriaButton
          slot="previous"
          aria-label="Previous month"
          className={navButton}
        >
          <Icon name="left" />
        </AriaButton>
        <Heading level={3} aria-live="polite" />
        <AriaButton slot="next" aria-label="Next month" className={navButton}>
          <Icon name="right" />
        </AriaButton>
      </div>
      <CalendarGrid weekdayStyle="short" className="cal-grid">
        <CalendarGridHeader>
          {(day) => <CalendarHeaderCell>{day}</CalendarHeaderCell>}
        </CalendarGridHeader>
        <CalendarGridBody>
          {(date) => (
            <CalendarCell
              date={date}
              className={cx("cd", date.toString() === today && "is-today")}
            >
              {({ formattedDate, isOutsideMonth }) =>
                isOutsideMonth ? "" : formattedDate
              }
            </CalendarCell>
          )}
        </CalendarGridBody>
      </CalendarGrid>
      {limitsText && <p className="cal-note">{limitsText}</p>}
      <p className="cal-key" aria-hidden="true">
        {(min !== undefined || max !== undefined) && (
          <span>
            <span className="cd is-off cal-key-mark">{dayNumber(offDay)}</span>
            Not offered
          </span>
        )}
        {closed && (
          <span>
            <span className="cd is-closed cal-key-mark">
              {closedDay ? dayNumber(closedDay) : ""}
            </span>
            Closed
          </span>
        )}
        <span>
          <span className="cd is-today cal-key-mark">{dayNumber(today)}</span>
          Today
        </span>
      </p>
      <div className="cal-foot">
        <Button
          variant="quiet"
          disabled={todayOff || !todayDate}
          disabledReason={
            todayOff
              ? `Today, ${formatLocalDate(today, thisYear)}, cannot be chosen here.`
              : undefined
          }
          onClick={() => {
            if (todayDate) state?.selectDate(todayDate);
          }}
        >
          Today
        </Button>
      </div>
    </>
  );
}

function limitProps({ min, max, closed }: DateLimits) {
  const minValue = toDate(min);
  const maxValue = toDate(max);
  return {
    ...(minValue ? { minValue } : {}),
    ...(maxValue ? { maxValue } : {}),
    ...(closed
      ? { isDateUnavailable: (d: DateValue) => closed(d.toString()) }
      : {}),
  };
}

/** The words under an empty field: the days that can be chosen. */
function rangeText(
  min: string | undefined,
  max: string | undefined,
  thisYear: number,
) {
  const words = (d: string) => formatLocalDate(d, thisYear);
  if (min && max) return `Choose a day from ${words(min)} to ${words(max)}.`;
  if (min) return `Choose ${words(min)} or a later day.`;
  if (max) return `Choose a day up to ${words(max)}.`;
  return undefined;
}

export function DatePicker({
  label,
  name,
  id,
  value,
  onChange,
  onBlur,
  ref,
  today,
  min,
  max,
  closed,
  limitsText,
  tooSoonReason,
  tooLateReason,
  required,
  disabled = false,
  readOnly = false,
  loading = false,
  helper,
  error,
}: DateLimits & {
  label: string;
  name?: string;
  id?: string;
  /** `YYYY-MM-DD`, or empty. */
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  ref?: Ref<HTMLDivElement>;
  /** Today in the dealership's zone, `YYYY-MM-DD`. */
  today: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  /** The limits are not known yet: the calendar button turns, the helper says so. */
  loading?: boolean;
  /** Under the field. Without it: the date in words ("Fri 30 Oct"), or the days that can be chosen. */
  helper?: string | undefined;
  error?: string | undefined;
}) {
  const fallback = useId();
  const key = id ?? fieldId(name, fallback);
  const thisYear = Number(today.slice(0, 4));
  const date = useMemo(() => toDate(value), [value]);
  // While a year is typed it passes through 2, 20 and 202. The field keeps what is typed; the form hears of a
  // date only once its year has four digits, and until then it holds no date.
  const [typed, setTyped] = useState<{ from: string; date: DateValue | null }>({
    from: value,
    date,
  });
  const shownDate = typed.from === value ? typed.date : date;
  const shownHelper = loading
    ? "Loading the days the dealership is open…"
    : (helper ??
      (date
        ? formatLocalDate(value, thisYear)
        : rangeText(min, max, thisYear)));
  const limits = { min, max, closed, limitsText };
  // A typed day outside the limits: say what, why and what to do (8.29, invalid). The form's own check, when it
  // has one, speaks instead.
  const words = date ? formatLocalDate(value, thisYear) : "";
  const outside =
    date && min !== undefined && value < min
      ? `${words} is too soon. ${tooSoonReason ?? `The first day you can choose is ${formatLocalDate(min, thisYear)}.`} Choose a later day.`
      : date && max !== undefined && value > max
        ? `${words} is too far ahead. ${tooLateReason ?? `The last day you can choose is ${formatLocalDate(max, thisYear)}.`} Choose an earlier day.`
        : undefined;
  const problem = error ?? outside;
  return (
    <I18nProvider locale="en-GB">
      <AriaDatePicker
        value={shownDate}
        onChange={(d) => {
          const next = d && d.year >= 1000 ? d.toString() : "";
          setTyped({ from: next, date: d });
          if (next !== value) onChange(next);
        }}
        onBlur={onBlur}
        granularity="day"
        shouldForceLeadingZeros
        firstDayOfWeek="mon"
        isDisabled={disabled}
        isReadOnly={readOnly}
        isInvalid={problem ? true : undefined}
        validationBehavior="aria"
        {...limitProps(limits)}
        className="flex min-w-0 flex-col gap-1"
      >
        <Label className="font-medium">
          {label}
          {required ? " (required)" : ""}
        </Label>
        <Group
          id={key}
          ref={ref}
          className={cx(
            "dgrp",
            problem && "is-invalid",
            readOnly && "is-readonly",
          )}
        >
          <DateInput className="flex min-w-0 flex-1 items-stretch">
            {(segment) => <DateSegment segment={segment} className="sg" />}
          </DateInput>
          <AriaButton
            className="cbtn"
            isDisabled={disabled || readOnly || loading}
          >
            <Icon
              name={readOnly ? "lock" : loading ? "arc" : "calendar"}
              spin={loading}
            />
          </AriaButton>
        </Group>
        {problem ? (
          <Text
            slot="errorMessage"
            elementType="p"
            className="flex items-start gap-2 text-sm text-text-danger"
          >
            <Icon name="alert" className="mt-1" />
            <span>{problem}</span>
          </Text>
        ) : shownHelper ? (
          <Text
            slot="description"
            elementType="p"
            className="text-sm text-text-secondary"
          >
            {shownHelper}
          </Text>
        ) : null}
        <Picker title={label} kind="calendar">
          <Calendar className="cal">
            <CalendarBody {...limits} today={today} thisYear={thisYear} />
          </Calendar>
        </Picker>
      </AriaDatePicker>
    </I18nProvider>
  );
}

/**
 * The schedule's day picker (8.4, 8.29 variant `button`): a button that shows the day and opens the same
 * Calendar. Choosing a day closes it and focus goes back to the button.
 */
export function DayButton({
  date,
  today,
  min,
  max,
  onChange,
}: {
  date: string;
  today: string;
  min?: string | undefined;
  max?: string | undefined;
  onChange: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const thisYear = Number(today.slice(0, 4));
  const shown = formatLocalDate(date, thisYear);
  const value = useMemo(() => toDate(date), [date]);
  return (
    <I18nProvider locale="en-GB">
      <DialogTrigger isOpen={open} onOpenChange={setOpen}>
        <AriaButton
          aria-label={`Choose a date. Showing ${shown}`}
          className="inline-flex min-h-(--size-target) min-w-32 items-center justify-center gap-2 rounded-pill border border-solid border-text bg-surface px-4 font-heading font-bold text-text transition-colors duration-(--duration-fast) ease-out data-hovered:bg-surface-page data-pressed:bg-surface-sunken"
        >
          <Icon name="calendar" />
          <span className="num">{shown}</span>
        </AriaButton>
        <Picker title="Date" kind="calendar" dialogLabel="Choose a date">
          <Calendar
            className="cal"
            autoFocus
            value={value}
            firstDayOfWeek="mon"
            onChange={(d) => {
              setOpen(false);
              onChange(d.toString());
            }}
            {...limitProps({ min, max })}
          >
            <CalendarBody
              min={min}
              max={max}
              today={today}
              thisYear={thisYear}
            />
          </Calendar>
        </Picker>
      </DialogTrigger>
    </I18nProvider>
  );
}
