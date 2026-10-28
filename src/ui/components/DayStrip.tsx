// design.md 8.7. A week stepper, then seven days as one native radio group: one Tab stop, arrow keys move.
// On a phone the days scroll sideways inside their own row; from 640 wide they are seven equal columns.
import { useEffect, useRef, useState } from "react";
import { formatLocalDate } from "../format/format";
import { Button } from "./Button";
import { cx } from "./cx";
import { Icon } from "./Icon";

export interface DayTile {
  date: string;
  /** Only `open` days can be chosen; the others say why in words. */
  kind: "open" | "full" | "closed" | "too-soon" | "too-far";
  /** "18 times", "Closed", "Fully booked", "Too soon", "Too far ahead". */
  note: string;
  /** How much of the day is free, 0 to 1. */
  fill: number;
}

export interface WeekStep {
  disabled: boolean;
  /** Why it is off, as the button's title: "You cannot book a day that has passed". */
  reason?: string;
  onClick: () => void;
}

export function DayStrip({
  days,
  value,
  onChange,
  weekLabel,
  previous,
  next,
  thisYear,
  name = "day",
  label = "Choose a day",
}: {
  days: readonly DayTile[];
  value: string | null;
  onChange: (date: string) => void;
  /** "Wed 28 Oct to Tue 3 Nov". */
  weekLabel: string;
  previous: WeekStep;
  next: WeekStep;
  thisYear: number;
  name?: string;
  label?: string;
}) {
  // The fill bars grow once, when the strip first appears; not on every choice (design.md 7).
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // The chosen day scrolls into view inside its row on a phone.
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!value) return;
    const chosen = row.current?.querySelector<HTMLElement>(
      `[data-date="${value}"]`,
    );
    chosen?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [value]);

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <Button
          size="icon"
          icon="left"
          aria-label="Previous week"
          disabled={previous.disabled}
          title={previous.disabled ? previous.reason : undefined}
          onClick={previous.onClick}
        />
        <b className="num text-center font-heading">{weekLabel}</b>
        <Button
          size="icon"
          icon="right"
          aria-label="Next week"
          disabled={next.disabled}
          title={next.disabled ? next.reason : undefined}
          onClick={next.onClick}
        />
      </div>
      <div
        ref={row}
        role="radiogroup"
        aria-label={label}
        className="grid snap-x snap-proximity auto-cols-(--size-day) grid-flow-col gap-2 overflow-x-auto pb-2 sm:snap-none sm:grid-flow-row sm:grid-cols-7 sm:overflow-visible sm:pb-0"
      >
        {days.map((day) => {
          const off = day.kind !== "open";
          const checked = value === day.date;
          const [weekday = "", ...rest] = formatLocalDate(
            day.date,
            thisYear,
          ).split(" ");
          return (
            <label
              key={day.date}
              data-date={day.date}
              className="group relative block min-w-0 snap-start"
            >
              <input
                type="radio"
                name={name}
                value={day.date}
                checked={checked}
                disabled={off}
                aria-label={`${weekday} ${rest.join(" ")}, ${day.note}`}
                onChange={() => onChange(day.date)}
                className="peer absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
              />
              <span
                aria-hidden="true"
                className={cx(
                  "flex h-full min-h-(--size-target) flex-col items-start gap-1 rounded-card border border-border-strong bg-surface p-3 transition-colors duration-(--duration-base) ease-out",
                  "group-hover:border-text peer-focus-visible:outline-solid peer-focus-visible:outline-(length:--focus-ring-width) peer-focus-visible:outline-focus-ring peer-focus-visible:outline-offset-(--focus-ring-offset)",
                  "peer-checked:border-surface-selected peer-checked:bg-surface-selected peer-checked:text-text-on-selected",
                  "peer-disabled:border-border-subtle peer-disabled:bg-surface-sunken peer-disabled:text-text-secondary group-hover:peer-disabled:border-border-subtle",
                )}
              >
                <span
                  className={cx(
                    "text-sm",
                    checked ? "text-border-subtle" : "text-text-secondary",
                  )}
                >
                  {weekday}
                </span>
                <span className="num flex items-center gap-1 font-heading font-bold">
                  {checked && <Icon name="check" />}
                  {rest.join(" ")}
                </span>
                <span className="text-sm">{day.note}</span>
                <span
                  className={cx(
                    "mt-auto block h-1 w-full overflow-hidden rounded-pill",
                    checked ? "bg-slate-tech" : "bg-border-subtle",
                  )}
                >
                  <span
                    className={cx(
                      "block h-full origin-left transition-transform duration-(--duration-slow) ease-out",
                      checked ? "bg-signal" : "bg-surface-selected",
                      grown ? "scale-x-100" : "scale-x-0",
                    )}
                    style={{ width: `${Math.round((off ? 0 : day.fill) * 100)}%` }}
                  />
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
