// `book-confirmed` (customer.md section 5, design.md 6): it worked, what was booked, what happens next.
// The appointment is read from the API, so a reload shows the same one (REQ-BOOK-003.AC-2).
import { Link, useParams } from "react-router";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { FactsList, PhoneLink, Plate } from "../../components/Small";
import { Skeleton, StateBlock } from "../../components/StateBlock";
import { ApiProblem } from "../../data/api-problem";
import {
  formatDay,
  formatDuration,
  formatTime,
  formatTimeRange,
  localDateIn,
} from "../../format/format";
import { useDealerships } from "../../session/dealership";
import { instantAt } from "./days";
import { useAppointment, type Appointment, type Transport } from "./queries";

const carWords: Record<Transport, string> = {
  wait: "You will wait on site",
  drop_off: "You will drop it off",
  courtesy_car: "You will borrow a courtesy car",
};

const HOUR = 3_600_000;

export function ConfirmedPage() {
  const { appointmentId = "" } = useParams();
  const appointment = useAppointment(appointmentId);
  const dealerships = useDealerships();

  if (appointment.isError) {
    const problem =
      appointment.error instanceof ApiProblem ? appointment.error : null;
    if (problem?.status === 404) {
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
    const reference = problem?.traceId?.slice(0, 8);
    return (
      <StateBlock
        kind="error"
        title="We could not show your confirmation."
        traceId={problem?.traceId}
        focusTitle
        actions={
          <>
            <Button variant="primary" to="/appointments">
              Open my appointments
            </Button>
            <Button icon="refresh" onClick={() => void appointment.refetch()}>
              Try again
            </Button>
          </>
        }
      >
        Your booking went through, but something went wrong on our side while we
        loaded this page. Open My appointments to see it. If it is not there,
        try again
        {reference
          ? `; if that keeps happening, quote reference ${reference}.`
          : "."}
      </StateBlock>
    );
  }

  const data = appointment.data;
  const dealership = dealerships.data?.find((d) => d.id === data?.dealershipId);
  if (!data || dealerships.isPending) {
    return (
      <div className="max-w-(--measure)">
        <StateBlock
          kind="loading"
          loadingLabel="Loading your confirmation"
          skeleton={
            <>
              <Skeleton className="min-h-(--size-hour) rounded-card" />
              <Skeleton className="min-h-(--size-hour) rounded-card" />
              <Skeleton className="min-h-(--size-hour) rounded-card" />
            </>
          }
        />
      </div>
    );
  }
  return <Booked appointment={data} dealership={dealership} />;
}

function Booked({
  appointment,
  dealership,
}: {
  appointment: Appointment;
  dealership:
    | { name: string; phone?: string; policies: { leadTimeMinutes: number } }
    | undefined;
}) {
  const zone = appointment.timeZone;
  const now = Date.parse(appointment.createdAt);
  const start = Date.parse(appointment.start);
  const day = formatDay(start, zone, now);
  const minutes = Math.round((Date.parse(appointment.end) - start) / 60_000);
  const { vehicle } = appointment.display;
  const at = (instant: number) =>
    `${formatTime(instant, zone)} on ${formatDay(instant, zone, now)}`;

  // The reminders still ahead when it was booked (Q-0001-21 A): 48 hours before, and the morning one.
  const eight = Date.parse(instantAt(localDateIn(start, zone), "08:00", zone));
  const morning = start <= eight ? start - 2 * HOUR : eight;
  const twoDays = start - 48 * HOUR;
  const reminders = [
    twoDays > now ? `a reminder two days before, at ${at(twoDays)}` : null,
    morning > now
      ? `a reminder on the morning of your appointment, at ${at(morning)}`
      : null,
  ].filter((r): r is string => r !== null);
  const messages =
    reminders.length === 0
      ? "We will send you a confirmation now."
      : reminders.length === 1
        ? `We will send you a confirmation now, and ${reminders[0]}.`
        : `We will send you a confirmation now, ${reminders[0]}, and ${reminders[1]}.`;

  const lead = dealership?.policies.leadTimeMinutes ?? 0;
  const cutoff = start - lead * 60_000;
  const name = dealership?.name ?? "the dealership";

  return (
    <div className="grid max-w-(--measure) gap-6">
      <section
        role="status"
        className="grid gap-2 rounded-card border border-text-success bg-success-tint p-5"
      >
        <div className="flex items-center gap-3">
          <Icon name="check" large className="text-text-success" />
          <h1 tabIndex={-1} className="text-2xl lg:text-3xl">
            You are booked
          </h1>
        </div>
        <p className="num m-0 text-lg font-semibold">
          {day}, {formatTimeRange(start, appointment.end, zone)}
        </p>
      </section>

      <section aria-labelledby="facts-title" className="grid gap-3">
        <h2 id="facts-title" className="text-xl">
          Your appointment
        </h2>
        <FactsList
          rows={[
            {
              term: "Service",
              value: `${appointment.display.serviceTypeName}, about ${formatDuration(minutes)}`,
            },
            {
              term: "Car",
              value: (
                <>
                  {vehicle.make} {vehicle.model},{" "}
                  <Plate>{vehicle.registration}</Plate>
                </>
              ),
            },
            { term: "Dealership", value: dealership?.name },
            // D-0001-26 C: the technician's name, never a bay. The API sends it when the role may see it.
            ...(appointment.display.technicianName
              ? [
                  {
                    term: "Technician",
                    value: appointment.display.technicianName,
                  },
                ]
              : []),
            { term: "The car", value: carWords[appointment.transport] },
          ]}
        />
      </section>

      <section aria-labelledby="next-title" className="grid gap-3">
        <h2 id="next-title" className="text-xl">
          What happens next
        </h2>
        <p className="m-0">
          {messages} This is a demo, so nothing is really sent: the messages
          wait in an outbox that the garage manager can open.
        </p>
        <p className="m-0">
          {cutoff > Date.now() ? (
            <>
              You can{" "}
              <Link to={`/appointments/${appointment.id}`}>
                change or cancel this appointment
              </Link>{" "}
              online until {at(cutoff)}, which is {formatDuration(lead)} before
              it starts. After that, contact {name}.
            </>
          ) : (
            <>It is too close to the start to change online. Contact {name}.</>
          )}
        </p>
        {dealership?.phone && <PhoneLink phone={dealership.phone} />}
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button to="/appointments">View my appointments</Button>
        <Button variant="quiet" to="/book">
          Add another booking
        </Button>
      </div>
    </div>
  );
}
