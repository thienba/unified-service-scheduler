// design.md 8.30 (D-0001-133): a time is chosen from a list of the times of the day, 24-hour, 15 minutes apart,
// `00:00` to `23:45`. Every value in the list is valid, whatever the browser's language. A saved time off the
// quarter hour ("08:10") is kept and shown once in its place, marked "(current)".
import type { Ref } from "react";
import { Select, type SelectOption } from "./Select";

const STEP = 15;
const pad = (n: number) => String(n).padStart(2, "0");
const minutesOf = (time: string) => {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return h * 60 + m;
};
const timeOf = (minutes: number) =>
  `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The options of a time list: every quarter hour, the saved value if it is off the grid, and "Not set". */
export function timeOptions({
  value,
  from = "00:00",
  to = "23:45",
  min,
  max,
  optional = false,
}: {
  value: string;
  from?: string;
  to?: string;
  min?: string | undefined;
  max?: string | undefined;
  optional?: boolean;
}): SelectOption[] {
  const options: SelectOption[] = optional
    ? [{ value: "", label: "Not set", textValue: "Not set" }]
    : [];
  const off = (t: string) =>
    (min !== undefined && t < min) || (max !== undefined && t > max);
  const current =
    CLOCK.test(value) && minutesOf(value) % STEP !== 0 ? value : null;
  for (let m = minutesOf(from); m <= minutesOf(to); m += STEP) {
    const t = timeOf(m);
    if (current && current < t && !options.some((o) => o.value === current)) {
      options.push({
        value: current,
        label: `${current} (current)`,
        textValue: current.replace(":", ""),
      });
    }
    options.push({
      value: t,
      label: t,
      textValue: t.replace(":", ""),
      hour: m % 60 === 0,
      ...(off(t) ? { struck: true } : {}),
    });
  }
  if (current && !options.some((o) => o.value === current)) {
    options.push({
      value: current,
      label: `${current} (current)`,
      textValue: current.replace(":", ""),
    });
  }
  return options;
}

/**
 * For an end time (design.md 8.30, "Ends"): the times up to `start` are crossed out, with one line that says why.
 * `words` finishes the sentence: "end after it starts" gives "Not up to 09:00: this must end after it starts at 09:00."
 */
export function afterStart(
  start: string | undefined,
  words: string,
): { min?: string; disabledReason?: string } {
  if (start === undefined || !CLOCK.test(start)) return {};
  return {
    min: timeOf(minutesOf(start) + 1),
    disabledReason: `Not up to ${start}: this must ${words} at ${start}.`,
  };
}

export function TimeField({
  label,
  name,
  id,
  value,
  onChange,
  onBlur,
  ref,
  required,
  disabled,
  readOnly,
  helper,
  error,
  invalid,
  describedBy,
  hideLabel,
  optional = false,
  from,
  to,
  min,
  max,
  disabledReason,
}: {
  label: string;
  name?: string;
  id?: string;
  /** `"08:00"`, or empty. */
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  ref?: Ref<HTMLButtonElement>;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  helper?: string | undefined;
  error?: string | undefined;
  invalid?: boolean;
  describedBy?: string | undefined;
  hideLabel?: boolean | "lg";
  /** Adds "Not set" first, which clears the value (a break time). */
  optional?: boolean;
  from?: string;
  to?: string;
  /** The first time that can be chosen; earlier ones are crossed out. */
  min?: string | undefined;
  /** The last time that can be chosen; later ones are crossed out. */
  max?: string | undefined;
  /** One sentence for all the crossed-out times, at the top of the list. */
  disabledReason?: string | undefined;
}) {
  const options = timeOptions({
    value,
    ...(from !== undefined ? { from } : {}),
    ...(to !== undefined ? { to } : {}),
    min,
    max,
    optional,
  });
  const anyOff = options.some((o) => o.struck);
  return (
    <Select
      label={label}
      {...(name !== undefined ? { name } : {})}
      {...(id !== undefined ? { id } : {})}
      {...(ref !== undefined ? { ref } : {})}
      {...(onBlur !== undefined ? { onBlur } : {})}
      options={options}
      value={value}
      onChange={onChange}
      placeholder={optional ? "Not set" : "Choose a time"}
      required={required}
      disabled={disabled}
      readOnly={readOnly}
      helper={helper}
      error={error}
      invalid={invalid}
      describedBy={describedBy}
      hideLabel={hideLabel}
      icon="clock"
      numeric
      listStyle="hours"
      listNote={anyOff ? disabledReason : undefined}
      openAt="08:00"
    />
  );
}
