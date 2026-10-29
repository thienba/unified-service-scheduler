// design.md 8.23. One row per weekday: its name, a Closed (or Day off) checkbox and the times. Each weekday is a
// `group` labelled by its name; a row's error sits under the row and is tied to every field of the row.
import { Checkbox, FieldError } from "./Fields";
import { cx } from "./cx";
import { afterStart, TimeField } from "./TimeField";

export type WeekMode = "hours" | "shift";

const fieldsOf = {
  hours: [
    { key: "open", label: "Opens" },
    { key: "close", label: "Closes" },
  ],
  shift: [
    { key: "start", label: "Starts" },
    { key: "end", label: "Ends" },
    { key: "breakStart", label: "Break starts (optional)" },
    { key: "breakEnd", label: "Break ends (optional)" },
  ],
} as const;

// design.md 8.30: an end time cannot be chosen up to its start time; those times are crossed out with the reason.
const endsAfter: Record<string, { start: string; words: string }> = {
  close: { start: "open", words: "close after it opens" },
  end: { start: "start", words: "end after it starts" },
};

const heads = {
  hours: ["Opens", "Closes"],
  shift: ["Starts", "Ends", "Break starts", "Break ends"],
} as const;

export interface WeekDay {
  label: string;
  /** Under the name: "Dealership open 08:00 to 18:00". */
  hint?: string;
  off: boolean;
  /** The times by field key: `open`, `close` or `start`, `end`, `breakStart`, `breakEnd`. */
  times: Record<string, string>;
  /** The row's one message, and the fields it is about. */
  error?: { fields: readonly string[]; message: string } | undefined;
}

export function WeekPatternEditor({
  mode,
  days,
  disabled = false,
  idPrefix = "days",
  onChange,
}: {
  mode: WeekMode;
  days: readonly WeekDay[];
  disabled?: boolean;
  /** Field ids are `field-<idPrefix>.<index>.<key>`, so a form summary can link to them. */
  idPrefix?: string;
  onChange: (
    index: number,
    change: { off: boolean } | { key: string; value: string },
  ) => void;
}) {
  const fields = fieldsOf[mode];
  const shift = mode === "shift";
  // From 1024 wide one line per weekday: fixed widths for the name and the checkbox, the times share the rest.
  const nameWidth = shift ? "lg:w-48" : "lg:w-32";
  const timeWidth = shift ? "lg:flex-1" : "lg:w-48";
  return (
    <div className="grid">
      <div
        className="hidden gap-4 pb-1 text-sm text-text-secondary lg:flex"
        aria-hidden="true"
      >
        <span className={cx("shrink-0", nameWidth)}>Day</span>
        <span className="w-32 shrink-0" />
        {heads[mode].map((h) => (
          <span key={h} className={cx("min-w-0", timeWidth)}>
            {h}
          </span>
        ))}
      </div>
      {days.map((day, i) => {
        const nameId = `${idPrefix}-${i}-name`;
        const errorId = `${idPrefix}-${i}-error`;
        return (
          <div
            key={day.label}
            role="group"
            aria-labelledby={nameId}
            className={cx(
              "grid grid-cols-2 items-start gap-x-4 gap-y-3 border-t border-border-subtle py-4 *:min-w-0",
              shift && "sm:grid-cols-4",
              "lg:flex lg:flex-wrap lg:items-center",
            )}
          >
            <div className={cx("col-span-full lg:shrink-0", nameWidth)}>
              <h3 id={nameId} className="text-base">
                {day.label}
              </h3>
              {day.hint && (
                <p className="text-sm text-text-secondary">{day.hint}</p>
              )}
            </div>
            <div className="col-span-full lg:w-32 lg:shrink-0">
              <Checkbox
                id={`field-${idPrefix}.${i}.off`}
                label={shift ? "Day off" : "Closed"}
                checked={day.off}
                disabled={disabled}
                onChange={(e) => onChange(i, { off: e.target.checked })}
              />
            </div>
            {fields.map((f) => {
              const bad = day.error?.fields.includes(f.key) ?? false;
              const after = endsAfter[f.key];
              return (
                <div key={f.key} className={cx("lg:min-w-0", timeWidth)}>
                  <TimeField
                    id={`field-${idPrefix}.${i}.${f.key}`}
                    label={f.label}
                    hideLabel="lg"
                    optional={f.label.endsWith("(optional)")}
                    value={day.off ? "" : (day.times[f.key] ?? "")}
                    disabled={disabled || day.off}
                    invalid={bad}
                    describedBy={day.error ? errorId : undefined}
                    onChange={(value) => onChange(i, { key: f.key, value })}
                    {...(after && !day.off
                      ? afterStart(day.times[after.start], after.words)
                      : {})}
                  />
                </div>
              );
            })}
            {day.error && (
              <div className="col-span-full lg:basis-full">
                <FieldError id={errorId}>{day.error.message}</FieldError>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
