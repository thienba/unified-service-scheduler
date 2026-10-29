// design.md 8.8 and 8.18. Start times as native radios: the visible text is the start, the name is
// "10:00 to 13:00". A time that cannot be chosen stays in place, struck through, with its words.
// SuggestionGroup is the titled row of two-line chips that a 409 or an empty day offers.
import { useId, type ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";

export interface GridTime {
  start: string;
  end: string;
  /** "Just taken" or "Too soon": shown, not choosable. Reschedule adds "Your time". */
  unavailable?: string;
  /** The appointment's own start on `reschedule` ("Your time"): not choosable, and not struck through (P4). */
  own?: boolean;
}

export interface GridGroup {
  /** "Morning", "Afternoon", "Evening". */
  label: string;
  /** "10 times", "1 time", "none left". */
  count: string;
  times: readonly GridTime[];
}

const chipFace =
  "flex min-h-(--size-target) items-center justify-center gap-2 rounded-pill border border-border-strong bg-surface px-4 font-medium transition-colors duration-(--duration-base) ease-out group-hover:border-text peer-active:bg-surface-sunken peer-checked:border-surface-selected peer-checked:bg-surface-selected peer-checked:text-text-on-selected peer-focus-visible:outline-solid peer-focus-visible:outline-(length:--focus-ring-width) peer-focus-visible:outline-focus-ring peer-focus-visible:outline-offset-(--focus-ring-offset)";
const radio =
  "peer absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed";

export function TimeChipGrid({
  groups,
  value,
  onChange,
  name,
  label,
}: {
  groups: readonly GridGroup[];
  value: string | null;
  onChange: (start: string) => void;
  name: string;
  /** Turns an instant into "10:00". */
  label: (instant: string) => string;
}) {
  const id = useId();
  return (
    <div className="grid gap-6">
      {groups.map((group) => {
        const headingId = `${id}-${group.label}`;
        return (
          <div key={group.label} className="grid gap-3">
            <h3 id={headingId} className="flex items-baseline gap-2 text-lg">
              {group.label}
              <span className="font-sans text-sm font-normal text-text-secondary">
                · {group.count}
              </span>
            </h3>
            <div
              role="radiogroup"
              aria-labelledby={headingId}
              className="flex flex-wrap gap-2"
            >
              {group.times.map((time) => {
                const start = label(time.start);
                if (time.unavailable) {
                  return (
                    <label
                      key={time.start}
                      className="relative block grow basis-(--size-chip) sm:grow-0 sm:basis-auto"
                    >
                      <input
                        type="radio"
                        name={name}
                        disabled
                        aria-label={`${start}, ${time.unavailable.toLowerCase()}`}
                        className={radio}
                      />
                      <span className="num flex min-h-(--size-target) min-w-(--size-chip) flex-col items-center justify-center rounded-pill border border-border-subtle bg-surface-sunken px-4 py-1 leading-heading text-text-secondary">
                        <span className={cx(!time.own && "line-through")}>
                          {start}
                        </span>
                        <span className="text-xs">{time.unavailable}</span>
                      </span>
                    </label>
                  );
                }
                return (
                  <label
                    key={time.start}
                    className="group relative block grow basis-(--size-chip) sm:grow-0 sm:basis-auto"
                  >
                    <input
                      type="radio"
                      name={name}
                      value={time.start}
                      checked={value === time.start}
                      aria-label={`${start} to ${label(time.end)}`}
                      onChange={() => onChange(time.start)}
                      className={radio}
                    />
                    <span className={cx(chipFace, "num min-w-(--size-chip)")}>
                      {value === time.start && <Icon name="check" />}
                      {start}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export interface SuggestedTime {
  start: string;
  end: string;
  /** "Sat 31 Oct" when the time is on another day than the one asked for. */
  day?: string | undefined;
}

/** A titled row of two-line suggestion chips. In `select` mode they are radios: choosing one books nothing. */
export function SuggestionGroup({
  title,
  titleLevel = 3,
  items,
  value,
  onChange,
  name,
  label,
  note,
}: {
  /** "Closest to your time", "Same time, another day". Without it, `note` names the group. */
  title?: string;
  titleLevel?: 3 | 4;
  items: readonly SuggestedTime[];
  value: string | null;
  onChange: (start: string) => void;
  name: string;
  label: (instant: string) => string;
  /** The group's name when it has no visible title: "Closest times on other days". */
  note?: string;
}) {
  const id = useId();
  const Heading = titleLevel === 3 ? "h3" : "h4";
  return (
    <div className="grid gap-3">
      {title && (
        <Heading id={id} className="text-base">
          {title}
        </Heading>
      )}
      <div
        role="radiogroup"
        aria-labelledby={title ? id : undefined}
        aria-label={title ? undefined : note}
        className="flex flex-wrap gap-2"
      >
        {items.map((item) => {
          const start = label(item.start);
          const end = label(item.end);
          return (
            <label
              key={item.start}
              className="group relative block grow basis-(--size-chip-suggest) sm:grow-0 sm:basis-auto"
            >
              <input
                type="radio"
                name={name}
                value={item.start}
                checked={value === item.start}
                aria-label={`${item.day ? `${item.day}, ` : ""}${start} to ${end}`}
                onChange={() => onChange(item.start)}
                className={radio}
              />
              <span
                className={cx(
                  chipFace,
                  "num min-w-(--size-chip-suggest) flex-col gap-0 border-2 border-text py-2 leading-heading",
                )}
              >
                <span className="flex items-center gap-2">
                  {value === item.start && <Icon name="check" />}
                  {start}
                </span>
                <small
                  className={cx(
                    "text-sm font-normal",
                    value === item.start
                      ? "text-border-subtle"
                      : "text-text-secondary",
                  )}
                >
                  {item.day ? `${item.day} · ` : ""}ends {end}
                </small>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

/** A quiet box with one line: "Pick a day above to see the start times." */
export function HintBox({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-card border border-border-subtle bg-surface p-5 text-text-secondary">
      {children}
    </p>
  );
}
