// "Leave without saving?" (manager.md 5.3, D-0001-75). While the form has unsaved changes, a link to another page of
// the app and the browser's Back button wait for the manager's answer; closing or reloading the tab asks the
// browser's own question. Needs the data router, which is what `useBlocker` is built on.
import { useCallback, useEffect } from "react";
import { useBlocker } from "react-router";

export function useLeaveGuard(dirty: boolean) {
  // Only a move to another page: a change of the address's query stays on the page (the shifts screen asks about
  // switching technician itself).
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!dirty) return;
    const onUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  const { state, reset, proceed } = blocker;
  const stay = useCallback(() => reset?.(), [reset]);
  const leave = useCallback(() => proceed?.(), [proceed]);

  return { leaving: state === "blocked", stay, leave };
}
