// design.md 8.16. The icon sits on the heading's line; the text and the actions use the full width.
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

export type AlertKind = "info" | "success" | "warning" | "danger";

// The kind is carried by an icon and a word as well as the tint (never colour alone).
const kinds: Record<
  AlertKind,
  { box: string; icon: IconName; iconColour: string; word: string }
> = {
  warning: {
    box: "border-text bg-warning-tint",
    icon: "alert",
    iconColour: "text-text",
    word: "Warning",
  },
  info: {
    box: "border-text-link bg-info-tint",
    icon: "info",
    iconColour: "text-text-link",
    word: "Note",
  },
  success: {
    box: "border-text-success bg-success-tint",
    icon: "check",
    iconColour: "text-text-success",
    word: "Done",
  },
  danger: {
    box: "border-text-danger bg-danger-tint",
    icon: "alert",
    iconColour: "text-text-danger",
    word: "Problem",
  },
};

export function Alert({
  kind,
  title,
  children,
  actions,
  focusTitle = false,
  role,
  headingLevel = 2,
}: {
  kind: AlertKind;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  /** The 409 apology takes focus on its heading when it appears. */
  focusTitle?: boolean;
  /** `null`: no live role, for an Alert that takes focus on its heading (focus already announces it). */
  role?: "alert" | "status" | null;
  headingLevel?: 2 | 3;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusTitle) heading.current?.focus();
  }, [focusTitle]);
  const k = kinds[kind];
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section
      role={
        role === null
          ? undefined
          : (role ?? (kind === "danger" ? "alert" : "status"))
      }
      className={cx(
        "cols-icon-text grid gap-x-3 gap-y-2 rounded-card border p-5 *:min-w-0",
        k.box,
      )}
    >
      <span className="self-start">
        <Icon name={k.icon} large className={k.iconColour} />
        <span className="sr-only">{k.word}</span>
      </span>
      <Heading
        ref={heading}
        tabIndex={focusTitle ? -1 : undefined}
        className="text-lg"
      >
        {title}
      </Heading>
      {children && (
        <div className="col-span-2 max-w-(--measure) *:m-0 *:mb-2">
          {children}
        </div>
      )}
      {actions && (
        <div className="col-span-2 mt-2 flex flex-wrap gap-2">{actions}</div>
      )}
    </section>
  );
}
