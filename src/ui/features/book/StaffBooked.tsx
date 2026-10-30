// `book-confirmed` as staff and the manager see it (staff.md 5.4, state `confirmed`): who is booked in,
// when and where, what was booked, and the way back to the schedule.
import { useEffect } from "react";
import { useLocation } from "react-router";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { FactsList, PageBack, Plate } from "../../components/Small";
import {
  formatDay,
  formatDuration,
  formatTimeRange,
} from "../../format/format";
import { useSession } from "../../session/session";
import { useStaffMemory } from "./staff-memory";
import type { Appointment, Transport } from "./queries";

const carWords: Record<Transport, string> = {
  wait: "Waits on site",
  drop_off: "Drops the car off",
  courtesy_car: "Borrows a courtesy car",
};

export function StaffBooked({
  appointment,
  dealership,
}: {
  appointment: Appointment;
  dealership: { name: string } | undefined;
}) {
  const here = useLocation();
  const [, , forget] = useStaffMemory();
  // The booking is stored: what was typed for it is not needed any more (SEC-13.AC-2).
  useEffect(() => forget(), [forget]);
  const newCustomer =
    (here.state as { newCustomer?: boolean } | null)?.newCustomer === true;
  // The new customer can now be picked in "Viewing as" (D-0001-144).
  const reloadUsers = useSession().switcher?.reloadUsers;
  useEffect(() => {
    if (newCustomer) reloadUsers?.();
  }, [newCustomer, reloadUsers]);
  const zone = appointment.timeZone;
  const start = Date.parse(appointment.start);
  const name = appointment.display.customerName ?? "The customer";
  const firstName = name.split(/\s+/)[0] ?? name;
  const minutes = Math.round((Date.parse(appointment.end) - start) / 60_000);
  const { vehicle } = appointment.display;
  return (
    <div className="grid max-w-(--measure) gap-6">
      <PageBack to="/schedule">Back to schedule</PageBack>
      <section
        role="status"
        className="grid gap-2 rounded-card border border-text-success bg-success-tint p-5"
      >
        <div className="flex items-center gap-3">
          <Icon name="check" large className="shrink-0 text-text-success" />
          <h1 tabIndex={-1} dir="auto" className="text-2xl wrap-anywhere">
            {name} is booked in.
          </h1>
        </div>
        <p className="num m-0">
          {formatDay(start, zone, Date.parse(appointment.createdAt))},{" "}
          {formatTimeRange(start, appointment.end, zone)}.
          {dealership ? ` ${dealership.name}.` : ""}
        </p>
      </section>
      <FactsList
        heading="What was booked"
        rows={[
          {
            term: "Service",
            value: `${appointment.display.serviceTypeName}, about ${formatDuration(minutes)}`,
          },
          {
            term: "Vehicle",
            value: (
              <>
                {vehicle.make} {vehicle.model},{" "}
                <Plate>{vehicle.registration}</Plate>
              </>
            ),
          },
          { term: "Technician", value: appointment.display.technicianName },
          { term: "Bay", value: appointment.display.serviceBayName },
          { term: "Car choice", value: carWords[appointment.transport] },
        ]}
      />
      {newCustomer && (
        <p className="m-0" dir="auto">
          {name} is now saved, so you can find {firstName} next time.
        </p>
      )}
      <p className="m-0" dir="auto">
        We will send {firstName} a confirmation and reminders. In this demo they
        appear in the outbox.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button variant="primary" to="/schedule">
          Back to schedule
        </Button>
        <Button variant="quiet" to="/book/for-customer">
          Book another for a customer
        </Button>
      </div>
    </div>
  );
}
