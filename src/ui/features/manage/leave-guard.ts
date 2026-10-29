// "Leave without saving?" (manager.md 5.3). While the form has unsaved changes, a click on a link to another page
// of the app waits for the manager's answer, and closing or reloading the tab asks the browser's own question.
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";

export function useLeaveGuard(dirty: boolean) {
  const navigate = useNavigate();
  const where = useLocation();
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const here = where.pathname + where.search;
    // Capture, so this runs before the router's own link handler, which then sees the click as handled.
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank")
        return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const to = url.pathname + url.search;
      if (to === here) return;
      event.preventDefault();
      setPending(to);
    };
    const onUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [dirty, where.pathname, where.search]);

  const stay = useCallback(() => setPending(null), []);
  const leave = useCallback(() => {
    const to = pending;
    setPending(null);
    if (to) navigate(to);
  }, [navigate, pending]);

  return { leaving: pending !== null, stay, leave };
}
