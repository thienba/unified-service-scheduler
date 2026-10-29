// design.md 8.14. A centred dialog from 640 wide, a bottom sheet below. Focus moves in, is held inside, and returns.
import type { KeyboardEvent, ReactNode, RefObject } from "react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Alert } from "./Alert";
import { Button } from "./Button";
import { cx } from "./cx";
import { query, useMediaQuery } from "./hooks";

const focusable =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Dialog({
  open,
  title,
  description,
  children,
  actions,
  onClose,
  destructive = false,
  busy = false,
  error,
  initialFocus,
  hideTitle = false,
}: {
  open: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  /** In DOM order: the way out first, then the main action. On a phone the main action is on top. */
  actions?: ReactNode;
  onClose: () => void;
  /** A destructive dialog is not closed by the scrim, and starts on its safe button. */
  destructive?: boolean;
  /** While it works (the confirm says "Cancelling…") the dialog cannot be closed. */
  busy?: boolean;
  /** The words of a failure, shown inside (for example `CHANGE_WINDOW_CLOSED`). */
  error?: ReactNode;
  /** The safe button of a destructive dialog. Without it focus goes to the first control. */
  initialFocus?: RefObject<HTMLElement | null>;
  hideTitle?: boolean;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const sheet = !useMediaQuery(query.sm);
  const close = useRef(onClose);
  close.current = onClose;
  const isBusy = useRef(busy);
  isBusy.current = busy;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = panel.current?.querySelector<HTMLElement>(focusable);
    (initialFocus?.current ?? first)?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
    // Focus moves in once, when the dialog opens.
  }, [open]);

  if (!open) return null;

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.stopPropagation();
      if (!isBusy.current) close.current();
      return;
    }
    if (event.key !== "Tab" || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>(focusable)];
    const [firstItem] = items;
    const lastItem = items[items.length - 1];
    if (!firstItem || !lastItem) return;
    if (event.shiftKey && document.activeElement === firstItem) {
      event.preventDefault();
      lastItem.focus();
    } else if (!event.shiftKey && document.activeElement === lastItem) {
      event.preventDefault();
      firstItem.focus();
    }
  }

  return createPortal(
    <div
      className={cx(
        "fixed inset-0 z-(--z-overlay) flex bg-surface-scrim",
        sheet ? "items-end" : "items-center justify-center p-4",
      )}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !destructive && !busy) onClose();
      }}
      onKeyDown={onKeyDown}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx(
          "grid w-full gap-4 overflow-auto bg-surface shadow-card",
          sheet
            ? "sheet-rise max-h-(--size-sheet-max) rounded-t-card px-4 pt-4 pb-6"
            : "dialog-in max-w-(--size-dialog) rounded-card p-6",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className={cx("text-xl", hideTitle && "sr-only")}>
            {title}
          </h2>
          <Button
            variant="quiet"
            size="icon"
            icon="x"
            aria-label="Close"
            disabled={busy}
            onClick={onClose}
          />
        </div>
        {description && <p className="text-text-secondary">{description}</p>}
        {error && (
          <Alert kind="danger" title="That did not work">
            {error}
          </Alert>
        )}
        {children}
        {actions && (
          <div
            className={cx(
              "flex flex-wrap gap-3",
              sheet ? "flex-col-reverse items-stretch" : "justify-end",
            )}
          >
            {actions}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
