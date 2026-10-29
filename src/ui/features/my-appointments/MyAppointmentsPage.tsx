// `my-appointments` (customer.md 6, REQ-BOOK-012.AC-1, REQ-BOOK-003.AC-2): the customer's own appointments,
// read from the API on every visit, so a reload shows the same list. "Upcoming" first, soonest first; then
// "Past and cancelled", newest first, 10 at a time. Staff and managers never reach it (the route's guard).
import { useState } from "react";
import { Button } from "../../components/Button";
import { HintBox } from "../../components/TimeChipGrid";
import { Skeleton, StateBlock } from "../../components/StateBlock";
import { useToast } from "../../components/Toast";
import { ApiProblem, type Dealership } from "../../data/api-problem";
import { formatDuration } from "../../format/format";
import { useDealerships } from "../../session/dealership";
import { AppointmentCard } from "./AppointmentCard";
import { CancelDialog } from "./CancelDialog";
import {
  customerStatus,
  useMyAppointments,
  type Appointment,
} from "./customer-appointment";

const PAGE = 10;

export function MyAppointmentsPage() {
  const list = useMyAppointments();
  const dealerships = useDealerships();
  const toast = useToast();
  const [shown, setShown] = useState(PAGE);
  const [cancelling, setCancelling] = useState<Appointment | null>(null);
  const now = Date.now();

  const loading =
    list.isPending || (dealerships.isPending && !dealerships.isError);
  const failure = list.error ?? dealerships.error;
  const all = list.data ?? [];
  const upcoming = all
    .filter((a) => customerStatus(a, now) === "confirmed")
    .sort((x, y) => x.start.localeCompare(y.start));
  const earlier = all
    .filter((a) => customerStatus(a, now) !== "confirmed")
    .sort((x, y) => y.start.localeCompare(x.start));
  const empty = !loading && !failure && all.length === 0;
  const dealershipOf = (a: Appointment) =>
    dealerships.data?.find((d) => d.id === a.dealershipId);

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <h1 tabIndex={-1} className="text-2xl lg:text-3xl">
          My appointments
        </h1>
        {!loading && !failure && !empty && (
          <Button
            variant="primary"
            icon="plus"
            to="/book"
            className="w-full sm:w-auto"
          >
            Book a service
          </Button>
        )}
      </div>

      {loading ? (
        <StateBlock
          kind="loading"
          loadingLabel="Loading your appointments"
          skeleton={
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="min-h-(--size-hour) rounded-card" />
              <Skeleton className="min-h-(--size-hour) rounded-card" />
            </div>
          }
        />
      ) : failure ? (
        <LoadError
          error={failure}
          retry={() => {
            void list.refetch();
            void dealerships.refetch();
          }}
        />
      ) : empty ? (
        <StateBlock
          kind="empty"
          headingLevel={2}
          title="You have no appointments yet"
          actions={
            <Button variant="primary" icon="plus" to="/book">
              Book a service
            </Button>
          }
        >
          When you book a service, it shows up here, and you can change or
          cancel it until {leadSentence(dealerships.data ?? [])} before it
          starts.
        </StateBlock>
      ) : (
        <>
          <section aria-labelledby="upcoming-title" className="grid gap-4">
            <h2 id="upcoming-title" className="text-xl">
              Upcoming
            </h2>
            {upcoming.length === 0 ? (
              <HintBox>
                You have nothing booked at the moment. Use Book a service to
                pick a time.
              </HintBox>
            ) : (
              <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2">
                {upcoming.map((a, i) => (
                  <li key={a.id} className="grid min-w-0">
                    <AppointmentCard
                      appointment={a}
                      dealership={dealershipOf(a)}
                      now={now}
                      first={i === 0}
                      onCancel={setCancelling}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
          {earlier.length > 0 && (
            <section aria-labelledby="earlier-title" className="grid gap-4">
              <h2 id="earlier-title" className="text-xl">
                Past and cancelled
              </h2>
              <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2">
                {earlier.slice(0, shown).map((a) => (
                  <li key={a.id} className="grid min-w-0">
                    <AppointmentCard
                      appointment={a}
                      dealership={dealershipOf(a)}
                      now={now}
                      onCancel={setCancelling}
                    />
                  </li>
                ))}
              </ul>
              {earlier.length > shown && (
                <div>
                  <Button onClick={() => setShown((n) => n + PAGE)}>
                    Show earlier
                  </Button>
                </div>
              )}
            </section>
          )}
        </>
      )}

      {cancelling && dealershipOf(cancelling) && (
        <CancelDialog
          appointment={cancelling}
          dealership={dealershipOf(cancelling)!}
          now={now}
          onClose={() => setCancelling(null)}
          onRefused={() => {
            setCancelling(null);
            void list.refetch();
          }}
          onCancelled={() => {
            setCancelling(null);
            toast.show({
              kind: "success",
              message: "Appointment cancelled. The time is free again.",
            });
          }}
        />
      )}
    </div>
  );
}

/** "2 hours" when every dealership has the same lead time; otherwise no number can be right for all. */
function leadSentence(dealerships: readonly Dealership[]): string {
  const leads = new Set(dealerships.map((d) => d.policies.leadTimeMinutes));
  const [only] = [...leads];
  return leads.size === 1 && only !== undefined
    ? formatDuration(only)
    : "shortly";
}

function LoadError({ error, retry }: { error: unknown; retry: () => void }) {
  const problem = error instanceof ApiProblem ? error : null;
  const reference = problem?.traceId?.slice(0, 8);
  return (
    <StateBlock
      kind="error"
      headingLevel={2}
      title="We could not load your appointments."
      traceId={problem?.traceId}
      actions={
        <Button icon="refresh" onClick={retry}>
          Try again
        </Button>
      }
    >
      {problem === null || problem.status === 0
        ? "We could not reach the booking service, so we cannot show your list. Nothing was changed. Check your connection and try again."
        : `Something went wrong on our side, so we cannot show your list. Nothing was changed. ${
            reference
              ? `Try again; if it keeps happening, quote reference ${reference}.`
              : "Try again."
          }`}
    </StateBlock>
  );
}
