// Save with a warning first (D-0001-36 A): ask the API what the change would flag (`preview=true`, nothing is
// written), save straight away when nothing new is flagged, otherwise wait for the manager to confirm.
import { useCallback, useRef, useState } from "react";
import { newlyFlagged, type Appointment } from "./flag-impact";

export type SavePhase =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "confirm"; touched: Appointment[] }
  | { kind: "saving"; touched: Appointment[] }
  | { kind: "failed"; error: unknown };

export interface SaveFlowOptions<Body> {
  /** `PUT …` with or without `preview=true`; gives back the flagged appointments after the change. */
  put: (body: Body, preview: boolean) => Promise<{ flagged: Appointment[] }>;
  /** The ids flagged now, before the change. */
  flaggedBefore: () => Promise<ReadonlySet<string>>;
  /** After the write: how many bookings the change flagged. */
  onSaved: (flagged: number, body: Body) => void;
}

export function useSaveFlow<Body>(options: SaveFlowOptions<Body>) {
  const [phase, setPhase] = useState<SavePhase>({ kind: "idle" });
  const pending = useRef<{ body: Body; before: ReadonlySet<string> } | null>(
    null,
  );
  const latest = useRef(options);
  latest.current = options;

  const write = useCallback(async (touched: Appointment[]) => {
    const job = pending.current;
    if (!job) return;
    setPhase({ kind: "saving", touched });
    try {
      const result = await latest.current.put(job.body, false);
      pending.current = null;
      setPhase({ kind: "idle" });
      latest.current.onSaved(
        newlyFlagged(result.flagged, job.before).length,
        job.body,
      );
    } catch (error) {
      setPhase({ kind: "failed", error });
    }
  }, []);

  const start = useCallback(
    async (body: Body) => {
      setPhase({ kind: "checking" });
      try {
        const before = await latest.current.flaggedBefore();
        const preview = await latest.current.put(body, true);
        pending.current = { body, before };
        const touched = newlyFlagged(preview.flagged, before);
        if (touched.length === 0) await write(touched);
        else setPhase({ kind: "confirm", touched });
      } catch (error) {
        setPhase({ kind: "failed", error });
      }
    },
    [write],
  );

  const confirm = useCallback(() => {
    if (phase.kind === "confirm") void write(phase.touched);
  }, [phase, write]);

  const back = useCallback(() => {
    pending.current = null;
    setPhase({ kind: "idle" });
  }, []);

  return { phase, start, confirm, back };
}
