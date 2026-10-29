// design.md 8.5. Four variants; the label is a verb phrase ("Confirm booking", never "OK").
import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { useId } from "react";
import { Link } from "react-router";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

const base =
  "inline-flex min-h-(--size-target) min-w-(--size-target) items-center justify-center gap-2 rounded-pill border border-solid px-5 font-semibold no-underline transition-colors duration-(--duration-fast) ease-out";

const variants: Record<ButtonVariant, string> = {
  primary:
    "border-primary-border bg-primary text-text-on-primary hover:bg-primary-hover active:bg-primary-active",
  secondary:
    "border-text bg-surface text-text hover:bg-surface-page active:bg-surface-sunken",
  quiet:
    "border-transparent bg-transparent text-text hover:underline active:bg-surface-sunken",
  danger:
    "border-text-danger bg-text-danger text-surface hover:underline hover:shadow-raised active:underline active:shadow-raised",
};

const disabledStyle =
  "cursor-not-allowed border-border-subtle bg-surface-sunken text-text-secondary shadow-none hover:bg-surface-sunken hover:no-underline hover:shadow-none active:bg-surface-sunken";

export interface ButtonProps {
  variant?: ButtonVariant;
  /** `icon` is a 44 by 44 button with no visible label: give it `aria-label`. */
  size?: "default" | "icon";
  icon?: IconName;
  iconPosition?: "start" | "end";
  /** Shows `loadingLabel` with the arc icon, ignores presses, keeps its width. */
  loading?: boolean;
  loadingLabel?: string;
  disabled?: boolean;
  /** Written next to a disabled button: a reason is never hidden. */
  disabledReason?: string;
  fullWidth?: boolean;
  type?: "button" | "submit" | "reset";
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
  /** An address in the app: the button is drawn as a link. */
  to?: string;
  ref?: Ref<HTMLButtonElement>;
  title?: string;
  children?: ReactNode;
  "aria-label"?: string;
  "aria-haspopup"?: "dialog";
  "aria-expanded"?: boolean;
  "aria-controls"?: string;
  "aria-describedby"?: string;
  id?: string;
  className?: string;
}

export function Button({
  variant = "secondary",
  size = "default",
  icon,
  iconPosition = "start",
  loading = false,
  loadingLabel = "Working…",
  disabled = false,
  disabledReason,
  fullWidth = false,
  type = "button",
  onClick,
  to,
  ref,
  children,
  className,
  ...aria
}: ButtonProps) {
  const reasonId = useId();
  const classes = cx(
    base,
    disabled ? disabledStyle : variants[variant],
    size === "icon" && "px-0",
    fullWidth && "w-full",
    loading && "cursor-progress",
    className,
  );
  const iconNode = icon ? <Icon name={icon} /> : null;
  const content = loading ? (
    // Both labels share one cell, so the button keeps the width of the longer one.
    <span className="inline-grid">
      <span className="invisible col-start-1 row-start-1" aria-hidden="true">
        {children}
      </span>
      <span className="col-start-1 row-start-1 inline-flex items-center justify-center gap-2">
        <Icon name="arc" spin />
        {loadingLabel}
      </span>
    </span>
  ) : (
    <>
      {iconPosition === "start" && iconNode}
      {children}
      {iconPosition === "end" && iconNode}
    </>
  );
  const control = to ? (
    <Link to={to} className={classes} {...aria}>
      {content}
    </Link>
  ) : (
    <button
      ref={ref}
      type={loading ? "button" : type}
      className={classes}
      disabled={disabled}
      aria-busy={loading || undefined}
      aria-describedby={disabled && disabledReason ? reasonId : undefined}
      onClick={loading ? undefined : onClick}
      {...aria}
    >
      {content}
    </button>
  );
  if (!disabled || !disabledReason) return control;
  return (
    <span className={cx("inline-flex flex-col gap-1", fullWidth && "w-full")}>
      {control}
      <span id={reasonId} className="text-sm text-text-secondary">
        {disabledReason}
      </span>
    </span>
  );
}
