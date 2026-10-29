// `appointment` for its owner (customer.md 6, customer-appointment.html): loading, error and not-found in the
// customer's words, then the view with its cancel dialog. Another customer's id answers 404, so the page is
// the same as for an id that does not exist (SEC-5.AC-1, AC-2).
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation } from "react-router";
import { ProblemState } from "../../app/states";
import { Button } from "../../components/Button";
import { PageBack } from "../../components/Small";
import { Skeleton, StateBlock } from "../../components/StateBlock";
import { useToast } from "../../components/Toast";
import { ApiProblem, call } from "../../data/api-problem";
import { useDealerships } from "../../session/dealership";
import { useSession } from "../../session/session";
import { CancelDialog } from "../my-appointments/CancelDialog";
import { CustomerAppointmentView } from "./CustomerAppointmentView";

/** What the reschedule screen hands over when the appointment turned out to be cancelled (D-0001-60 A). */
export interface CustomerAppointmentState {
  alreadyCancelled?: boolean;
}

export function CustomerNotFound() {
  return (
    <StateBlock
      kind="not-found"
      title="We cannot find that appointment."
      focusTitle
      actions={
        <>
          <Button variant="primary" to="/appointments">
            Go to My appointments
          </Button>
          <Button to="/book">Book a service</Button>
        </>
      }
    >
      It may have been removed, or it belongs to someone else.
    </StateBlock>
  );
}

export function CustomerAppointmentPage({
  appointmentId,
}: {
  appointmentId: string;
}) {
  const { client } = useSession();
  const dealerships = useDealerships();
  const toast = useToast();
  const handed = (useLocation().state ?? {}) as CustomerAppointmentState;
  const [dialog, setDialog] = useState(false);
  const [refused, setRefused] = useState(false);
  const appointment = useQuery({
    queryKey: ["appointment", appointmentId],
    queryFn: () =>
      call(
        client.GET("/appointments/{appointmentId}", {
          params: { path: { appointmentId } },
        }),
      ),
  });

  const back = <PageBack to="/appointments">My appointments</PageBack>;
  const failure = appointment.error ?? dealerships.error;
  if (failure) {
    const problem = failure instanceof ApiProblem ? failure : null;
    if (problem?.status === 404) {
      return (
        <div className="grid gap-4">
          {back}
          <CustomerNotFound />
        </div>
      );
    }
    if (problem !== null && problem.status !== 500 && problem.status !== 0) {
      return (
        <div className="grid gap-4">
          {back}
          <ProblemState error={problem} />
        </div>
      );
    }
    const reference = problem?.traceId?.slice(0, 8);
    return (
      <div className="grid gap-4">
        {back}
        <StateBlock
          kind="error"
          title="We could not load this appointment."
          traceId={problem?.traceId}
          focusTitle
          actions={
            <Button
              icon="refresh"
              onClick={() => {
                void appointment.refetch();
                void dealerships.refetch();
              }}
            >
              Try again
            </Button>
          }
        >
          {problem === null || problem.status === 0
            ? "We could not reach the booking service, so we cannot show it. Nothing was changed. Check your connection and try again."
            : `Something went wrong on our side, so we cannot show it. Nothing was changed. ${
                reference
                  ? `Try again; if it keeps happening, quote reference ${reference}.`
                  : "Try again."
              }`}
        </StateBlock>
      </div>
    );
  }

  const a = appointment.data;
  const dealership = dealerships.data?.find((d) => d.id === a?.dealershipId);
  if (!a || dealerships.isPending) {
    return (
      <div className="grid gap-4">
        {back}
        <StateBlock
          kind="loading"
          loadingLabel="Loading the appointment"
          skeleton={
            <>
              <Skeleton className="h-9 w-3/5" />
              <Skeleton className="min-h-(--size-hour) rounded-card" />
            </>
          }
        />
      </div>
    );
  }

  const now = Date.now();
  return (
    <>
      <CustomerAppointmentView
        appointment={a}
        dealership={dealership}
        now={now}
        closed={refused}
        onCancel={() => setDialog(true)}
        notice={
          handed.alreadyCancelled && a.cancelledAt
            ? "This appointment was cancelled, so it cannot be moved."
            : undefined
        }
      />
      {dialog && dealership && (
        <CancelDialog
          appointment={a}
          dealership={dealership}
          now={now}
          onClose={() => setDialog(false)}
          onRefused={() => {
            setDialog(false);
            setRefused(true);
            void appointment.refetch();
          }}
          onCancelled={() => {
            setDialog(false);
            toast.show({
              kind: "success",
              message: "Appointment cancelled. The time is free again.",
            });
          }}
        />
      )}
    </>
  );
}
