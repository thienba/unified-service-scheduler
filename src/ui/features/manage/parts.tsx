// The parts the two manager forms share: a panel, the Save row (in the page from 1024 wide, a sticky bar below),
// the result after saving and the words when a save fails (manager.md 5.3, 5.4).
import type { ReactNode } from "react";
import { ActionBar } from "../../components/ActionBar";
import { Alert } from "../../components/Alert";
import { Button } from "../../components/Button";
import { StateBlock, Skeleton, referenceOf } from "../../components/StateBlock";
import { ApiProblem } from "../../data/api-problem";
import type { SavePhase } from "./save-flow";

export function Panel({
  id,
  title,
  hint,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="grid min-w-0 content-start gap-4 rounded-card border border-border-subtle bg-surface p-5"
    >
      <h2 id={id} className="text-xl">
        {title}
      </h2>
      {hint && <p className="text-sm text-text-secondary">{hint}</p>}
      {children}
    </section>
  );
}

export function PageHead({ title, lede }: { title: string; lede?: string }) {
  return (
    <div>
      <h1 className="text-2xl lg:text-3xl">{title}</h1>
      {lede && (
        <p className="mt-2 max-w-(--measure) text-text-secondary">{lede}</p>
      )}
    </div>
  );
}

/** The loading state: a skeleton in the form's own shape, said to a screen reader. */
export function FormSkeleton({ label }: { label: string }) {
  return (
    <div className="max-w-(--size-form)">
      <StateBlock
        kind="loading"
        loadingLabel={label}
        skeleton={
          <>
            <Skeleton className="h-(--size-target)" />
            <Skeleton className="h-96" />
            <Skeleton className="h-48" />
          </>
        }
      />
    </div>
  );
}

/** A load that failed: what happened, Try again and the reference. */
export function LoadFailed({
  what,
  error,
  retry,
}: {
  what: string;
  error: unknown;
  retry: () => void;
}) {
  const traceId = error instanceof ApiProblem ? error.traceId : null;
  const reference = traceId ? referenceOf(traceId) : null;
  return (
    <div className="max-w-(--size-form)">
      <StateBlock
        kind="error"
        title="Something went wrong on our side."
        traceId={traceId}
        headingLevel={2}
        focusTitle
        actions={
          <Button variant="primary" icon="refresh" onClick={retry}>
            Try again
          </Button>
        }
      >
        {`We could not load ${what}. Nothing was changed. `}
        {reference
          ? `Try again; if it keeps happening, quote reference ${reference}.`
          : "Check your connection and try again."}
      </StateBlock>
    </div>
  );
}

export function SaveFailed({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const traceId = error instanceof ApiProblem ? error.traceId : null;
  return (
    <Alert
      kind="danger"
      role="alert"
      title="Your changes were not saved"
      focusTitle
      actions={
        <Button variant="primary" icon="refresh" onClick={retry}>
          Try again
        </Button>
      }
    >
      <p>
        We could not reach the booking service. Nothing was changed, and your
        edits are still here.
        {traceId
          ? ` Try again; if it keeps happening, quote reference ${referenceOf(traceId)}.`
          : ""}
      </p>
    </Alert>
  );
}

export interface SavedResult {
  title: string;
  body: string;
  flagged: number;
}

export function SavedAlert({ result }: { result: SavedResult }) {
  return result.flagged === 0 ? (
    <Alert kind="success" role="status" title={result.title}>
      <p>{result.body}</p>
    </Alert>
  ) : (
    <Alert
      kind="warning"
      role="status"
      title={result.title}
      actions={
        <Button variant="primary" icon="right" to="/manage/flagged">
          Review flagged bookings
        </Button>
      }
    >
      <p>{result.body}</p>
    </Alert>
  );
}

/** Save, its status line and Discard: in the page from 1024 wide, in the sticky bar below. */
export function SaveControls({
  label,
  phase,
  dirty,
  problems,
  lastChange,
  onSave,
  onDiscard,
}: {
  label: string;
  phase: SavePhase;
  dirty: boolean;
  /** How many things need fixing, once Save has been pressed. */
  problems: number;
  lastChange: string;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const checking = phase.kind === "checking";
  const saving = phase.kind === "saving";
  const busy = checking || saving;
  const invalid = problems > 0;
  const disabled = !busy && (!dirty || invalid);
  const status = busy
    ? ""
    : invalid
      ? `Fix the ${problems === 1 ? "1 thing" : `${problems} things`} above to save.`
      : dirty
        ? "You have unsaved changes."
        : "Nothing has changed yet.";
  const [barTitle, barStatus] = checking
    ? ["Checking bookings", "This takes a moment"]
    : saving
      ? ["Saving", "Please wait"]
      : invalid
        ? [
            `${problems === 1 ? "1 thing" : `${problems} things`} to fix`,
            "Nothing is saved yet",
          ]
        : phase.kind === "failed" && dirty
          ? ["Unsaved changes", "Saving failed"]
          : dirty
            ? ["Unsaved changes", lastChange]
            : ["No changes yet", "Change something to save"];
  const button = (bar: boolean) => (
    <Button
      variant="primary"
      disabled={disabled}
      loading={busy}
      loadingLabel={
        checking ? (bar ? "Checking…" : "Checking bookings…") : "Saving…"
      }
      onClick={onSave}
    >
      {label}
    </Button>
  );
  return (
    <>
      <div className="hidden flex-wrap items-center gap-3 lg:flex">
        {button(false)}
        <span className="text-sm text-text-secondary" aria-live="polite">
          {status}
        </span>
        {dirty && !busy && (
          <Button variant="quiet" onClick={onDiscard}>
            Discard changes
          </Button>
        )}
      </div>
      <ActionBar title={barTitle} status={barStatus} actions={button(true)} />
    </>
  );
}
