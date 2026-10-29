// Warn early (D-0001-107 C): no time is held, but while a time stays chosen the page asks the existing
// `POST /availability-checks` about it again, so the customer hears that it was taken before pressing Confirm.
// One check when the time is chosen, then one every 30 seconds while the tab is visible. A hidden tab stops the
// checks; coming back runs one at once and starts the 30 seconds again. Confirm keeps its own check (REQ-BOOK-009).
import { useEffect, useRef } from "react";
import type { components } from "../../../api/contract/schema";
import { call } from "../../data/api-problem";
import { useSession } from "../../session/session";

export type CheckRequest = components["schemas"]["AvailabilityCheckRequest"];
export type CheckAnswer = components["schemas"]["AvailabilityCheck"];

export const EARLY_CHECK_MS = 30_000;

/**
 * Checks `request` now and every 30 seconds while it is not null. `onAnswer` gets each answer that is still about
 * the request in force. A failed or slow check shows nothing (the ticket): Confirm's own check still runs.
 */
export function useEarlyCheck(
  request: CheckRequest | null,
  onAnswer: (answer: CheckAnswer, request: CheckRequest) => void,
) {
  const { client } = useSession();
  const latest = useRef(onAnswer);
  useEffect(() => {
    latest.current = onAnswer;
  });
  const key = request === null ? null : JSON.stringify(request);
  useEffect(() => {
    if (key === null) return;
    const asked = JSON.parse(key) as CheckRequest;
    let live = true;
    let out = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const check = async () => {
      // A slow answer is still awaited; the next 30 seconds do not pile a second request on it.
      if (out) return;
      out = true;
      try {
        const answer = await call(
          client.POST("/availability-checks", { body: asked }),
        );
        if (live) latest.current(answer, asked);
      } catch {
        // Nothing is shown for a failed check (500, no answer): Confirm checks again anyway.
      } finally {
        out = false;
      }
    };
    const begin = () => {
      void check();
      timer = setInterval(() => void check(), EARLY_CHECK_MS);
    };
    const stop = () => {
      clearInterval(timer);
      timer = undefined;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") stop();
      else if (timer === undefined) begin();
    };
    if (document.visibilityState !== "hidden") begin();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      live = false;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [client, key]);
}

/**
 * Focus is left where it is when an early answer comes in. But when that answer greys out or redraws the element
 * that had focus (the chosen time's chip is struck through, the courtesy car option goes grey), focus goes to the
 * nearest place instead of falling to the page (WCAG 2.4.3): an option of the same radio group that can still be
 * chosen, or else the heading `id`. Call the returned function just before the answer changes the page.
 */
export function useFocusKept(id: string): () => void {
  const before = useRef<{ element: Element; group: string | null } | null>(
    null,
  );
  useEffect(() => {
    const was = before.current;
    if (was === null) return;
    before.current = null;
    if (was.element.isConnected && !was.element.matches(":disabled")) return;
    const options = [
      ...document.querySelectorAll<HTMLInputElement>(
        'input[type="radio"]:not(:disabled)',
      ),
    ].filter((o) => was.group !== null && o.name === was.group);
    const next = options.find((o) => o.checked) ?? options[0];
    if (next) next.focus();
    else document.getElementById(id)?.focus();
  });
  return () => {
    const active = document.activeElement;
    before.current =
      active === null || active === document.body
        ? null
        : {
            element: active,
            group:
              active instanceof HTMLInputElement && active.type === "radio"
                ? active.name
                : null,
          };
  };
}
