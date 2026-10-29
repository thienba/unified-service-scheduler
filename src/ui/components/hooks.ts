import { useEffect, useState, useSyncExternalStore } from "react";

// The breakpoints of tokens.css. A media query cannot read a variable, so the values are repeated here.
export const query = {
  sm: "(min-width: 40rem)",
  md: "(min-width: 48rem)",
  lg: "(min-width: 64rem)",
} as const;

/** True while the window matches. Without `matchMedia` (a test) it is `fallback`. */
export function useMediaQuery(media: string, fallback = true): boolean {
  return useSyncExternalStore(
    (notify) => {
      if (typeof window.matchMedia !== "function") return () => {};
      const list = window.matchMedia(media);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    () =>
      typeof window.matchMedia === "function"
        ? window.matchMedia(media).matches
        : fallback,
    () => fallback,
  );
}

/** False until `ms` have passed. A skeleton shows only after 200 ms, so quick answers do not flash (8.17). */
export function useAfterDelay(ms: number): boolean {
  const [passed, setPassed] = useState(ms <= 0);
  useEffect(() => {
    if (ms <= 0) return;
    const timer = setTimeout(() => setPassed(true), ms);
    return () => clearTimeout(timer);
  }, [ms]);
  return passed;
}
