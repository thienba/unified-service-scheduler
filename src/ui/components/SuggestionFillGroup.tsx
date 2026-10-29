// design.md 8.18 SuggestionGroup in `fill` mode (adjust): the same two-line chips as `select` mode, but each is a
// button with `aria-pressed` that fills the form and saves nothing. Full width on a phone, time on the left and
// "ends 12:00" on the right. The line under the chips says so.
import { useId } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";

export interface FillTime {
  start: string;
  end: string;
}

export function SuggestionFillGroup({
  title,
  items,
  pressed,
  onPick,
  startLabel,
  endLabel,
}: {
  /** "Closest times that are free", "Times that fit". */
  title: string;
  items: readonly FillTime[];
  /** The start that the form holds now, so its chip shows as pressed. */
  pressed: string | null;
  onPick: (item: FillTime) => void;
  /** "Mon 2 Nov, 09:00". */
  startLabel: (instant: string) => string;
  /** "12:00". */
  endLabel: (instant: string) => string;
}) {
  const id = useId();
  return (
    <div className="grid gap-3">
      <h3 id={id} className="text-base">
        {title}
      </h3>
      <div
        role="group"
        aria-labelledby={id}
        className="flex flex-col gap-2 sm:flex-row sm:flex-wrap"
      >
        {items.map((item) => {
          const on =
            pressed !== null && Date.parse(pressed) === Date.parse(item.start);
          return (
            <button
              key={item.start}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(item)}
              className={cx(
                "num flex min-h-(--size-target) w-full items-center justify-between gap-3 rounded-pill border-2 px-4 py-2 leading-heading font-medium transition-colors duration-(--duration-base) ease-out sm:w-auto sm:min-w-(--size-chip-suggest) sm:flex-col sm:justify-center sm:gap-0",
                on
                  ? "border-surface-selected bg-surface-selected text-text-on-selected"
                  : "border-text bg-surface text-text hover:bg-surface-page active:bg-surface-sunken",
              )}
            >
              <span className="flex items-center gap-2">
                {on && <Icon name="check" />}
                {startLabel(item.start)}
              </span>
              <span className="sr-only">, </span>
              <small
                className={cx(
                  "text-sm font-normal",
                  on ? "text-border-subtle" : "text-text-secondary",
                )}
              >
                ends {endLabel(item.end)}
              </small>
            </button>
          );
        })}
      </div>
      <p className="text-sm text-text-secondary">
        Choosing a time fills in the form. It does not save anything.
      </p>
    </div>
  );
}
