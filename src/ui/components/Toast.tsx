// design.md 8.15. One at a time. Success and info close after 6 seconds, paused while hovered or focused;
// an error stays until it is dismissed. It only confirms something that already happened.
import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "./Button";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

export type ToastKind = "success" | "error" | "info";

export interface ToastMessage {
  kind: ToastKind;
  message: string;
  action?: ReactNode;
}

interface ToastApi {
  show: (toast: ToastMessage) => void;
  dismiss: () => void;
  current: (ToastMessage & { id: number }) | null;
}

const ToastContext = createContext<ToastApi | null>(null);

export const TOAST_MS = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<ToastApi["current"]>(null);
  const counter = useRef(0);
  const show = useCallback((toast: ToastMessage) => {
    counter.current += 1;
    setCurrent({ ...toast, id: counter.current });
  }, []);
  const dismiss = useCallback(() => setCurrent(null), []);
  const value = useMemo(
    () => ({ show, dismiss, current }),
    [show, dismiss, current],
  );
  return <ToastContext value={value}>{children}</ToastContext>;
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast needs a ToastProvider above it.");
  return api;
}

const icons: Record<ToastKind, { name: IconName; colour: string }> = {
  success: { name: "check", colour: "text-text-success" },
  error: { name: "alert", colour: "text-text-danger" },
  info: { name: "info", colour: "text-text-link" },
};

/**
 * Where the toast shows: top centre from 1024 wide, below the header so it never covers the switcher or the picker; on a phone at the bottom, 6rem up when a bar
 * (the tab bar or the action bar) is showing, so it never covers the bar.
 */
export function ToastViewport({ barShowing }: { barShowing: boolean }) {
  const { current, dismiss } = useToast();
  // Hover and focus each hold the timer; it runs again only when neither does.
  const holds = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const id = current?.id;
  const autoCloses = current !== null && current.kind !== "error";

  const start = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(dismiss, TOAST_MS);
  }, [dismiss]);

  useEffect(() => {
    holds.current.clear();
    if (!autoCloses) return;
    start();
    return () => clearTimeout(timer.current);
  }, [id, autoCloses, start]);

  const pause = (by: string) => {
    holds.current.add(by);
    clearTimeout(timer.current);
  };
  const resume = (by: string) => {
    holds.current.delete(by);
    if (autoCloses && holds.current.size === 0) start();
  };

  const isError = current?.kind === "error";
  return (
    <div
      className={cx(
        "pointer-events-none fixed inset-x-0 z-(--z-toast) flex justify-center px-4 lg:top-20 lg:bottom-auto",
        barShowing ? "bottom-24" : "bottom-4",
      )}
    >
      {/* Both live regions exist before a toast is put in, so it is announced. */}
      <div role="status" className="pointer-events-auto">
        {current && !isError && (
          <ToastBody
            key={current.id}
            toast={current}
            onDismiss={dismiss}
            onPause={pause}
            onResume={resume}
          />
        )}
      </div>
      <div role="alert" className="pointer-events-auto">
        {current && isError && (
          <ToastBody
            key={current.id}
            toast={current}
            onDismiss={dismiss}
            onPause={pause}
            onResume={resume}
          />
        )}
      </div>
    </div>
  );
}

function ToastBody({
  toast,
  onDismiss,
  onPause,
  onResume,
}: {
  toast: ToastMessage;
  onDismiss: () => void;
  onPause: (by: string) => void;
  onResume: (by: string) => void;
}) {
  const icon = icons[toast.kind];
  return (
    <div
      className="flex max-w-(--size-dialog) items-center gap-3 rounded-card border border-border-strong bg-surface py-2 ps-4 pe-2 shadow-raised"
      onMouseEnter={() => onPause("pointer")}
      onMouseLeave={() => onResume("pointer")}
      onFocus={() => onPause("focus")}
      onBlur={() => onResume("focus")}
    >
      <Icon name={icon.name} className={icon.colour} />
      <p className="min-w-0 flex-1">{toast.message}</p>
      {toast.action}
      <Button
        variant="quiet"
        size="icon"
        icon="x"
        aria-label="Dismiss"
        onClick={onDismiss}
      />
    </div>
  );
}
