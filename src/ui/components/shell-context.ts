import { createContext, useContext, useEffect } from "react";

/** What the shell offers to the screens it holds: task mode and the place for the action bar (design.md 8.1, 8.19). */
export interface ShellValue {
  /** A task screen hides the tab bar below `hideFrom` while its action bar shows. */
  setTask: (task: { hideFrom: "md" | "lg" } | null) => void;
  /** Where the action bar is drawn, after the page and before the tab bar. */
  actionBarSlot: HTMLElement | null;
  /** Becomes true once the person has used the page. Until then a state block does not take focus, so the skip link stays the first Tab stop. */
  interacted: { current: boolean };
}

export const ShellContext = createContext<ShellValue | null>(null);

/** For a screen that shows an action bar on a phone: the tab bar steps aside while it is mounted. */
export function useTaskMode(hideFrom: "md" | "lg" = "lg", on = true): void {
  const shell = useContext(ShellContext);
  const setTask = shell?.setTask;
  useEffect(() => {
    if (!setTask || !on) return;
    setTask({ hideFrom });
    return () => setTask(null);
  }, [setTask, hideFrom, on]);
}
