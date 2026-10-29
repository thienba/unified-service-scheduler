// AppointmentCard (customer.md 6, design.md 8.10): the date as a link, the time, the badges, what is
// booked, and the three buttons. Inside the change window the card has one sentence instead of Reschedule
// and Cancel (REQ-BOOK-012.AC-4, D-0001-25 A).
import { Link } from "react-router";
import {
  StatusBadge,
  TransportBadge,
  type Transport,
} from "../../components/Badge";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { PhoneLink, Plate } from "../../components/Small";
import { cx } from "../../components/cx";
import type { Dealership } from "../../data/api-problem";
import { formatTimeRange, viewerTimeZone, zoneNote } from "../../format/format";
import {
  customerStatus,
  dateLine,
  mayChangeOnline,
  type Appointment,
} from "./customer-appointment";

export function AppointmentCard({
  appointment: a,
  dealership,
  now,
  first = false,
  ownZone = false,
  onCancel,
}: {
  appointment: Appointment;
  dealership: Dealership | undefined;
  now: number;
  /** The next appointment: its date is the largest on the page. */
  first?: boolean;
  /** The page shows appointments in more than one zone: the card says its own, "(London time)" (Q-0001-252). */
  ownZone?: boolean;
  onCancel: (appointment: Appointment) => void;
}) {
  const zone = a.timeZone;
  const zoneWords = zoneNote(zone, viewerTimeZone());
  const status = customerStatus(a, now);
  const open = dealership !== undefined && mayChangeOnline(a, dealership, now);
  const tooClose = status === "confirmed" && !open;
  const v = a.display.vehicle;
  const headingId = `card-${a.id}`;
  const details = `/appointments/${a.id}`;
  return (
    <article
      aria-labelledby={headingId}
      className={cx(
        "grid content-start gap-3 rounded-card border border-border-subtle p-5",
        status === "cancelled" ? "bg-surface-sunken" : "bg-surface",
      )}
    >
      <h3 id={headingId} className="text-lg">
        <Link
          to={details}
          className="group block min-h-(--size-target) text-text no-underline"
        >
          <span
            className={cx(
              "block group-hover:underline",
              first ? "text-2xl" : "text-xl",
            )}
          >
            {dateLine(a.start, zone, now)}
          </span>
          <span className="num block font-sans text-base font-medium">
            {formatTimeRange(a.start, a.end, zone)}
            {ownZone && zoneWords && ` ${zoneWords}`}
          </span>
        </Link>
      </h3>
      <div className="flex flex-wrap gap-2">
        <StatusBadge status={status} />
        {status !== "cancelled" && (
          <TransportBadge transport={a.transport as Transport} />
        )}
      </div>
      <dl className="cols-icon-text m-0 grid gap-x-4 gap-y-1">
        <dt className="text-sm text-text-secondary">Service</dt>
        <dd className="m-0 wrap-anywhere">{a.display.serviceTypeName}</dd>
        <dt className="text-sm text-text-secondary">Car</dt>
        <dd className="m-0 wrap-anywhere">
          {v.make} {v.model}, <Plate>{v.registration}</Plate>
        </dd>
        <dt className="text-sm text-text-secondary">Dealership</dt>
        <dd className="m-0 wrap-anywhere">{dealership?.name}</dd>
        {/* D-0001-26 C, D-0001-71 A: the technician's name, never the bay. */}
        {a.display.technicianName && (
          <>
            <dt className="text-sm text-text-secondary">Technician</dt>
            <dd className="m-0 wrap-anywhere">{a.display.technicianName}</dd>
          </>
        )}
      </dl>
      {tooClose && dealership && (
        <p className="m-0 flex items-start gap-2 rounded-control border border-text-link bg-info-tint p-3 text-sm">
          <Icon name="info" className="mt-1 shrink-0 text-text-link" />
          <span>
            It is too close to the start to change online. Contact{" "}
            {dealership.name}.
            {dealership.phone && (
              <>
                {" "}
                <PhoneLink phone={dealership.phone} />
              </>
            )}
          </span>
        </p>
      )}
      <div className="mt-1 flex flex-wrap gap-2">
        <Button to={details}>View details</Button>
        {open && (
          <>
            <Button to={`/appointments/${a.id}/reschedule`}>Reschedule</Button>
            <Button
              variant="quiet"
              aria-haspopup="dialog"
              onClick={() => onCancel(a)}
            >
              Cancel appointment
            </Button>
          </>
        )}
      </div>
    </article>
  );
}
