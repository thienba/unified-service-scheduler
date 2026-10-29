// The manager's view of `appointment` (manager.md 4.1, manager-adjust.html `appointment`, `appointment-flagged`):
// the read side with Adjust (primary), Cancel appointment and a quiet link to the messages sent. A flagged booking
// shows "This booking no longer fits" with Move this appointment instead of a second Adjust.
import { useState } from "react";
import { Alert } from "../../components/Alert";
import { Button } from "../../components/Button";
import { CancelDialog } from "../adjust/CancelDialog";
import { flagSentences } from "../adjust/adjust-model";
import {
  AppointmentReadSide,
  isCancelled,
  type AppointmentViewProps,
} from "./AppointmentReadSide";

export function ManagerAppointmentView(props: AppointmentViewProps) {
  const a = props.appointment;
  const [cancelling, setCancelling] = useState(false);
  const [cancelledHere, setCancelledHere] = useState(false);
  const cancelled = isCancelled(a);
  const past = Date.parse(a.end) <= props.now;
  const open = !cancelled && !past;
  const flagged = open && a.flags.length > 0;
  const adjust = `/appointments/${a.id}/adjust`;
  const flagPanel = flagged ? (
    <Alert
      kind="warning"
      role={null}
      title="This booking no longer fits"
      actions={
        <Button variant="primary" icon="right" to={adjust}>
          Move this appointment
        </Button>
      }
    >
      <p>
        {flagSentences(a)} It is still booked and keeps its technician and bay
        until you move or cancel it.
      </p>
    </Alert>
  ) : null;
  const actions = (
    <>
      {open && !flagged && (
        <Button variant="primary" icon="right" to={adjust}>
          Adjust
        </Button>
      )}
      {open && (
        <Button aria-haspopup="dialog" onClick={() => setCancelling(true)}>
          Cancel appointment
        </Button>
      )}
      <Button variant="quiet" to={`/manage/outbox?appointmentId=${a.id}`}>
        See the messages sent
      </Button>
    </>
  );
  return (
    <>
      <AppointmentReadSide
        {...props}
        audience="garage"
        flagPanel={flagPanel}
        actions={actions}
        focusCancelled={cancelledHere}
      />
      {/* Mounted only while open: the read side alone needs no session (its tests render it bare). */}
      {cancelling && (
        <CancelDialog
          appointment={a}
          now={props.now}
          onClose={() => setCancelling(false)}
          onCancelled={() => {
            setCancelling(false);
            setCancelledHere(true);
          }}
        />
      )}
    </>
  );
}
