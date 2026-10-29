// "Cancel this appointment?" (manager.md 5.1): the one dialog the manager's adjust page, appointment page and
// flagged list share. The safe button is first and has focus; while it works the dialog cannot be closed; a
// failure shows inside it with Try again (REQ-BOOK-012.AC-1, REQ-BOOK-013.AC-3, D-0001-50 B).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { Alert } from "../../components/Alert";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { useToast } from "../../components/Toast";
import { call } from "../../data/api-problem";
import { describeProblem } from "../../data/words";
import { useSession } from "../../session/session";
import { dayAndTime, type Appointment } from "./adjust-model";

export const cancelledToast =
  "Appointment cancelled. The customer is told and the time is free again.";

/** Every read that shows this appointment or the flagged count is asked again after a change. */
export const changedQueries = [
  "appointment",
  "appointments",
  "schedule-day",
  "flagged-count",
  "flagged-list",
];

export function CancelDialog({
  appointment: a,
  now,
  onClose,
  onCancelled,
}: {
  /** The appointment to cancel; null when the dialog is closed. */
  appointment: Appointment | null;
  now: number;
  onClose: () => void;
  onCancelled: (cancelled: Appointment) => void;
}) {
  const { client } = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const keep = useRef<HTMLButtonElement>(null);
  const cancel = useMutation({
    mutationFn: (id: string) =>
      call(
        client.POST("/appointments/{appointmentId}/cancel", {
          params: { path: { appointmentId: id } },
        }),
      ),
    onSuccess: async (cancelled) => {
      toast.show({ kind: "success", message: cancelledToast });
      await queryClient.invalidateQueries({
        predicate: (q) => changedQueries.includes(String(q.queryKey[0])),
      });
      onCancelled(cancelled);
      cancel.reset();
    },
  });
  const busy = cancel.isPending;
  const close = () => {
    if (busy) return;
    cancel.reset();
    onClose();
  };
  const failed = cancel.isError ? describeProblem(cancel.error) : null;

  return (
    <Dialog
      open={a !== null}
      title="Cancel this appointment?"
      onClose={close}
      destructive
      busy={busy}
      initialFocus={keep}
      actions={
        <>
          <Button ref={keep} disabled={busy} onClick={close}>
            Keep appointment
          </Button>
          <Button
            variant="danger"
            loading={busy}
            loadingLabel="Cancelling…"
            onClick={() => a && cancel.mutate(a.id)}
          >
            {failed ? "Try again" : "Cancel appointment"}
          </Button>
        </>
      }
    >
      {a && (
        <p>
          {a.display.serviceTypeName} for{" "}
          <span dir="auto">{a.display.customerName}</span>,{" "}
          {dayAndTime(a.start, a.timeZone, now)}. The time becomes free again.
          The customer is sent a cancellation message and their reminders are
          cancelled. This cannot be undone.
        </p>
      )}
      {failed && (
        <Alert
          kind="danger"
          role="alert"
          focusTitle
          headingLevel={3}
          title="We could not cancel this appointment"
        >
          <p>
            {failed.kind === "error"
              ? `The booking service did not answer. Nothing was changed. ${
                  failed.reference
                    ? `Try again; if it keeps happening, quote reference ${failed.reference}.`
                    : "Check your connection and try again."
                }`
              : `${failed.title} ${failed.body}`}
          </p>
        </Alert>
      )}
    </Dialog>
  );
}
