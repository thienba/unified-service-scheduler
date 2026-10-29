// design.md 8.19. Sticky at the bottom of a task screen on a phone: what was chosen on the left, the buttons on the right.
import type { ReactNode } from "react";
import { useContext, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cx } from "./cx";
import { ShellContext, useTaskMode } from "./shell-context";

export function ActionBar({
  title,
  status,
  actions,
  hideFrom = "lg",
}: {
  /** The chosen thing in words, or "Unsaved changes". Empty until there is something to say. */
  title?: string;
  /** A second, quieter line: "Ends 13:00". */
  status?: string;
  /** One primary button, or two that share the row. With none the bar is not drawn and the tab bar stays. */
  actions?: ReactNode;
  /** From where the buttons sit in the page instead: `lg` for most screens, `md` for an appointment. */
  hideFrom?: "md" | "lg";
}) {
  const shell = useContext(ShellContext);
  const bar = useRef<HTMLDivElement>(null);
  const drawn = Boolean(actions);
  useTaskMode(hideFrom, drawn);

  // The page keeps room equal to the bar's height, so a focused control is never behind it.
  useLayoutEffect(() => {
    const el = bar.current;
    if (!el) return;
    const root = document.documentElement;
    const measure = () => {
      root.style.scrollPaddingBottom =
        getComputedStyle(el).display === "none" ? "" : `${el.offsetHeight}px`;
    };
    measure();
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      root.style.scrollPaddingBottom = "";
    };
  });

  if (!drawn) return null;
  const node = (
    <div
      ref={bar}
      className={cx(
        "sticky bottom-0 z-(--z-sticky) flex items-center justify-between gap-3 border-t border-border-subtle bg-surface px-4 pt-3 shadow-sticky safe-bottom",
        hideFrom === "md" ? "md:hidden" : "lg:hidden",
      )}
    >
      <div className="min-w-0">
        {title && <b className="num block font-heading">{title}</b>}
        {status && (
          <span className="num block text-sm text-text-secondary">
            {status}
          </span>
        )}
      </div>
      <div className="flex shrink-0 gap-2">{actions}</div>
    </div>
  );
  if (!shell) return node;
  return shell.actionBarSlot ? createPortal(node, shell.actionBarSlot) : null;
}
