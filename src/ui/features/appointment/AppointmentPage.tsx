// `/appointments/:appointmentId` for every role (design.md 5): one page that loads the appointment, shows
// loading, error and not-found, and picks the role's view. Each role's view is its own file, so the
// customer and manager tickets add a file and a line here.
import { useQuery } from "@tanstack/react-query";
import type { ComponentType } from "react";
import { useParams } from "react-router";
import { ProblemState } from "../../app/states";
import { Button } from "../../components/Button";
import { PageBack } from "../../components/Small";
import { Skeleton, StateBlock } from "../../components/StateBlock";
import { ApiProblem, call, type Role } from "../../data/api-problem";
import { describeProblem } from "../../data/words";
import { useDealerships } from "../../session/dealership";
import { useSession } from "../../session/session";
import type { AppointmentViewProps } from "./AppointmentReadSide";
import { CustomerAppointmentPage } from "./CustomerAppointmentPage";
import { CustomerAppointmentView } from "./CustomerAppointmentView";
import { ManagerAppointmentView } from "./ManagerAppointmentView";
import { StaffAppointmentView } from "./StaffAppointmentView";

const views: Record<Role, ComponentType<AppointmentViewProps>> = {
  customer: CustomerAppointmentView,
  staff: StaffAppointmentView,
  manager: ManagerAppointmentView,
};

function Back({ role }: { role: Role }) {
  return role === "customer" ? (
    <PageBack to="/appointments">My appointments</PageBack>
  ) : (
    <PageBack to="/schedule">Back to schedule</PageBack>
  );
}

export function AppointmentPage() {
  const { appointmentId = "" } = useParams();
  const { client, me } = useSession();
  const dealerships = useDealerships();
  const appointment = useQuery({
    queryKey: ["appointment", appointmentId],
    queryFn: () =>
      call(
        client.GET("/appointments/{appointmentId}", {
          params: { path: { appointmentId } },
        }),
      ),
  });
  const role = me!.role;
  // The owner's page has its own states and actions (customer.md 6).
  if (role === "customer")
    return <CustomerAppointmentPage appointmentId={appointmentId} />;
  if (appointment.isPending) {
    return (
      <div className="grid gap-4">
        <Back role={role} />
        <StateBlock
          kind="loading"
          loadingLabel="Loading the appointment"
          skeleton={
            <>
              <Skeleton className="h-9 w-3/5" />
              <Skeleton className="w-2/5" />
              <Skeleton className="w-1/3" />
              <div className="grid gap-4 md:flex">
                <div className="grid gap-3 rounded-card border border-border-subtle bg-surface p-5 md:flex-1">
                  {Array.from({ length: 6 }, (_, i) => (
                    <Skeleton key={i} />
                  ))}
                </div>
                <div className="grid content-start gap-3 rounded-card border border-border-subtle bg-surface p-5 md:w-(--size-side)">
                  <Skeleton />
                  <Skeleton className="h-(--size-target)" />
                </div>
              </div>
            </>
          }
        />
      </div>
    );
  }

  if (appointment.isError) {
    const error = appointment.error;
    const words = describeProblem(error, { role });
    return (
      <div className="grid gap-4">
        <Back role={role} />
        {words.kind === "error" ? (
          <StateBlock
            kind="error"
            title="We could not load this appointment."
            traceId={error instanceof ApiProblem ? error.traceId : null}
            focusTitle
            actions={
              <Button
                variant="primary"
                icon="refresh"
                onClick={() => void appointment.refetch()}
              >
                Try again
              </Button>
            }
          >
            Something went wrong on our side. Nothing was changed.{" "}
            {words.reference
              ? `Try again; if it keeps happening, quote reference ${words.reference}.`
              : "Check your connection and try again."}
          </StateBlock>
        ) : (
          <ProblemState
            error={error}
            retry={() => void appointment.refetch()}
            context={{ scope: "dealership" }}
          />
        )}
      </div>
    );
  }

  const View = views[role];
  return (
    <View
      appointment={appointment.data}
      dealership={dealerships.data?.find(
        (d) => d.id === appointment.data.dealershipId,
      )}
      now={Date.now()}
    />
  );
}
