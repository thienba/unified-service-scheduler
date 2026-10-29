// The customer's cancel dialog (customer.md 6, design.md 8.14): what is cancelled, what happens next, and
// "Keep appointment" first. One POST per press; while it runs nothing can close it. A 500 keeps it open with
// Try again; a 409 `CHANGE_WINDOW_CLOSED` turns it into the "can no longer be changed online" message.
import { useEffect, useRef } from "react";
import { Alert } from "../../components/Alert";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { PhoneLink, Plate } from "../../components/Small";
import { ApiProblem, type Dealership } from "../../data/api-problem";
import { formatDay, formatTimeRange } from "../../format/format";
import {
  leadWords,
  useCancelAppointment,
  type Appointment,
} from "./customer-appointment";

export function CancelDialog({
  appointment: a,
  dealership,
  now,
  onClose,
  onCancelled,
  onRefused,
}: {
  appointment: Appointment;
  dealership: Dealership;
  now: number;
  /** "Keep appointment", the close button or Escape. */
  onClose: () => void;
  onCancelled: (cancelled: Appointment) => void;
  /** Closed after a 409 `CHANGE_WINDOW_CLOSED`: the page is now `change-closed`. */
  onRefused: () => void;
}) {
  const cancel = useCancelAppointment();
  const keep = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const problem = cancel.error instanceof ApiProblem ? cancel.error : null;
  const refused = problem?.code === "CHANGE_WINDOW_CLOSED";
  const failed = cancel.isError && !refused;
  const busy = cancel.isPending;

  // The danger button is gone once it is refused: focus moves to the one button left.
  useEffect(() => {
    if (refused) close.current?.focus();
  }, [refused]);

  function confirm() {
    if (cancel.isPending) return;
    cancel.mutate(a.id, { onSuccess: onCancelled });
  }

  const zone = a.timeZone;
  const v = a.display.vehicle;
  const reference = problem?.traceId?.slice(0, 8);
  return (
    <Dialog
      open
      destructive
      busy={busy}
      title={
        refused
          ? "This appointment can no longer be changed online."
          : "Cancel this appointment?"
      }
      initialFocus={keep}
      onClose={refused ? onRefused : onClose}
      actions={
        refused ? (
          <Button ref={close} onClick={onRefused}>
            Close
          </Button>
        ) : (
          <>
            <Button ref={keep} disabled={busy} onClick={onClose}>
              Keep appointment
            </Button>
            <Button
              variant="danger"
              icon={failed ? "refresh" : undefined}
              loading={busy}
              loadingLabel="Cancelling…"
              onClick={confirm}
            >
              {failed ? "Try again" : "Cancel appointment"}
            </Button>
          </>
        )
      }
    >
      {failed && (
        <Alert kind="danger" headingLevel={3} title="We could not cancel it.">
          <p>
            {problem === null || problem.status === 0
              ? "We could not reach the booking service. Your appointment is still booked. Check your connection and try again."
              : `Something went wrong on our side. Your appointment is still booked. ${
                  reference
                    ? `Try again; if it keeps happening, quote reference ${reference}.`
                    : "Try again."
                }`}
          </p>
        </Alert>
      )}
      {refused ? (
        <Alert
          kind="info"
          role="alert"
          headingLevel={3}
          title={`It starts in less than ${leadWords(dealership)}.`}
        >
          <p>Contact {dealership.name} to change it.</p>
          {dealership.phone && <PhoneLink phone={dealership.phone} />}
          <p>Nothing was cancelled.</p>
        </Alert>
      ) : (
        <div className="grid gap-4">
          <p className="m-0">
            {a.display.serviceTypeName} on{" "}
            <span className="num">
              {formatDay(a.start, zone, now)},{" "}
              {formatTimeRange(a.start, a.end, zone)}
            </span>{" "}
            for your {v.make} {v.model} (<Plate>{v.registration}</Plate>) at{" "}
            {dealership.name}.
          </p>
          <p className="m-0">
            The time will be free for other customers. We will send you a
            message to confirm, and your reminders are cancelled. You can book
            again at any time.
          </p>
        </div>
      )}
      <p role="status" className="sr-only">
        {busy ? "Cancelling your appointment" : ""}
      </p>
    </Dialog>
  );
}
