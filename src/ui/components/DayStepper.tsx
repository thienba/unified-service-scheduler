// design.md 8.4. Previous, the date (a button over a native date input), next, and a quiet "Today".
import { addDaysToLocalDate, formatLocalDate } from "../format/format";
import { Button } from "./Button";

export function DayStepper({
  date,
  today,
  min,
  max,
  onChange,
  label = "Day",
  showToday = true,
}: {
  /** The day shown, `YYYY-MM-DD`. */
  date: string;
  /** Today in the dealership's zone. */
  today: string;
  min?: string;
  max?: string;
  onChange: (date: string) => void;
  label?: string;
  showToday?: boolean;
}) {
  const year = Number(today.slice(0, 4));
  const atMin = min !== undefined && date <= min;
  const atMax = max !== undefined && date >= max;
  const isToday = date === today;
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex flex-wrap items-center gap-2"
    >
      <Button
        size="icon"
        icon="left"
        aria-label="Previous day"
        disabled={atMin}
        title={atMin ? "There is nothing before this day" : undefined}
        onClick={() => onChange(addDaysToLocalDate(date, -1))}
      />
      <div className="relative rounded-pill focus-within:outline-solid focus-within:outline-(length:--focus-ring-width) focus-within:outline-focus-ring focus-within:outline-offset-(--focus-ring-offset)">
        <span className="num inline-flex min-h-(--size-target) min-w-32 items-center justify-center rounded-pill border border-border-strong bg-surface px-4 font-heading font-bold">
          {formatLocalDate(date, year)}
        </span>
        <input
          type="date"
          aria-label="Choose a day"
          value={date}
          min={min}
          max={max}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          onClick={(e) => e.currentTarget.showPicker?.()}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
      <Button
        size="icon"
        icon="right"
        aria-label="Next day"
        disabled={atMax}
        title={atMax ? "There is nothing after this day" : undefined}
        onClick={() => onChange(addDaysToLocalDate(date, 1))}
      />
      {showToday && (
        <Button
          variant="quiet"
          disabled={isToday}
          title={isToday ? "You are already looking at today" : undefined}
          onClick={() => onChange(today)}
        >
          Today
        </Button>
      )}
    </div>
  );
}
