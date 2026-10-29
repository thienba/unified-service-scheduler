// design.md 8.4. A pill of buttons with `aria-pressed`. The options sit 4px apart inside one pill (section 3).
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

export interface SegmentOption {
  value: string;
  label: string;
  icon?: IconName;
}

export function SegmentedControl({
  options,
  value,
  onChange,
  label,
  disabled,
  className,
}: {
  options: readonly SegmentOption[];
  value: string | null;
  onChange: (value: string) => void;
  /** The group's accessible name, for example "Viewing as". */
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cx(
        "inline-flex gap-1 rounded-pill border border-border-strong bg-surface-page p-1",
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cx(
            "inline-flex min-h-(--size-target) min-w-(--size-target) items-center justify-center gap-2 rounded-pill px-4 font-medium transition-colors duration-(--duration-fast) ease-out",
            o.value === value
              ? "bg-surface-selected text-text-on-selected"
              : "bg-transparent text-text hover:bg-border-subtle active:bg-surface-sunken",
            disabled &&
              "cursor-not-allowed text-text-secondary hover:bg-transparent",
          )}
        >
          {o.icon && <Icon name={o.icon} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}
