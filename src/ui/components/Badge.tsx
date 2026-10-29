// design.md 8.11. Always an icon and words. Not interactive, so no 44px target.
import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

export type BadgeVariant =
  "plain" | "confirmed" | "cancelled" | "past" | "flag" | "danger";

const variants: Record<BadgeVariant, string> = {
  plain: "border-border-strong bg-surface",
  confirmed: "border-text-link bg-info-tint",
  cancelled: "border-border-subtle bg-surface-sunken text-text-secondary",
  past: "border-border-subtle bg-surface-sunken text-text-secondary",
  // A flag reads as a sentence: it may wrap, and has the control corner (B2 P8).
  flag: "rounded-control border-dashed border-flag-border bg-warning-tint-strong py-1 leading-snug",
  danger: "border-text-danger bg-danger-tint",
};

export function Badge({
  variant = "plain",
  icon,
  small,
  children,
}: {
  variant?: BadgeVariant;
  icon?: IconName;
  small?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex max-w-full items-center gap-1 rounded-pill border px-3 text-sm leading-5",
        variant !== "flag" && "whitespace-nowrap",
        small && "px-2 text-xs",
        variants[variant],
      )}
    >
      {icon && <Icon name={icon} className={small ? "size-3" : "size-3.5"} />}
      {children}
    </span>
  );
}

export type Transport = "wait" | "drop_off" | "courtesy_car";
const transportWords: Record<Transport, { icon: IconName; label: string }> = {
  wait: { icon: "hourglass", label: "Waiting" },
  drop_off: { icon: "login", label: "Drop-off" },
  courtesy_car: { icon: "key", label: "Courtesy car" },
};

export function TransportBadge({ transport }: { transport: Transport }) {
  const words = transportWords[transport];
  return <Badge icon={words.icon}>{words.label}</Badge>;
}

export function StatusBadge({
  status,
}: {
  status: "confirmed" | "cancelled" | "past";
}) {
  if (status === "cancelled")
    return (
      <Badge variant="cancelled" icon="x">
        Cancelled
      </Badge>
    );
  if (status === "past")
    return (
      <Badge variant="past" icon="clock">
        Past
      </Badge>
    );
  return (
    <Badge variant="confirmed" icon="check">
      Confirmed
    </Badge>
  );
}

export function FlagBadge({ children = "Flagged" }: { children?: ReactNode }) {
  return (
    <Badge variant="flag" icon="alert">
      {children}
    </Badge>
  );
}

/** The navy number on a tab. A screen reader reads "3 flagged" (8.1). */
export function CountBadge({ count, word }: { count: number; word: string }) {
  return (
    <span className="inline-flex h-(--size-icon) min-w-(--size-icon) items-center justify-center rounded-pill bg-surface-selected px-1 text-xs font-bold text-text-on-selected">
      {count}
      <span className="sr-only"> {word}</span>
    </span>
  );
}
