// design.md 8.4. Previous, the date (a button that opens the Calendar of 8.29), next, and a quiet "Today".
import { addDaysToLocalDate } from "../format/format";
import { Button } from "./Button";
import { DayButton } from "./DatePicker";

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
      <DayButton
        date={date}
        today={today}
        min={min}
        max={max}
        onChange={onChange}
      />
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
