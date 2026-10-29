// The customer's view of `appointment` (customer.md 6, customer-appointment.html): the time as the title,
// the badges, the facts (the technician's name, never the bay: D-0001-26 C), and Reschedule and Cancel while
// it can still be changed online. From 768 wide the actions sit on the right; below, in the sticky bar.
// The cancel dialog and the calls live in CustomerAppointmentPage.
import type { ReactNode, Ref } from "react";
import { ActionBar } from "../../components/ActionBar";
import { Alert } from "../../components/Alert";
import {
  StatusBadge,
  TransportBadge,
  type Transport,
} from "../../components/Badge";
import { Button } from "../../components/Button";
import {
  FactsList,
  InlineNote,
  PageBack,
  PhoneLink,
  Plate,
} from "../../components/Small";
import {
  formatDay,
  formatDuration,
  formatTime,
  formatTimeRange,
} from "../../format/format";
import {
  carWords,
  customerStatus,
  cutoffOf,
  leadWords,
  mayChangeOnline,
} from "../my-appointments/customer-appointment";
import { ZoneTimesNote } from "../../session/TimesNote";
import { dayAndTime, type AppointmentViewProps } from "./AppointmentReadSide";

export function CustomerAppointmentView({
  appointment: a,
  dealership,
  now,
  onCancel,
  closed = false,
  notice,
  titleRef,
}: AppointmentViewProps & {
  /** Opens the cancel dialog. */
  onCancel?: () => void;
  /** The cancel was refused (409 `CHANGE_WINDOW_CLOSED`): show `change-closed` whatever this clock says. */
  closed?: boolean;
  /** One quiet line above the page (D-0001-60 A). */
  notice?: ReactNode;
  /** The title, where focus goes when the buttons it came from are gone (after a cancel). */
  titleRef?: Ref<HTMLHeadingElement>;
}) {
  const zone = a.timeZone;
  const status = customerStatus(a, now);
  const open =
    !closed && dealership !== undefined && mayChangeOnline(a, dealership, now);
  const changeClosed = status === "confirmed" && !open;
  const minutes = Math.round(
    (Date.parse(a.end) - Date.parse(a.start)) / 60_000,
  );
  const v = a.display.vehicle;
  const name = dealership?.name ?? "the dealership";
  const phone = dealership?.phone ? (
    <>
      {" "}
      <PhoneLink phone={dealership.phone} />
    </>
  ) : null;

  const actions = open ? (
    <>
      <Button to={`/appointments/${a.id}/reschedule`}>Reschedule</Button>
      <Button aria-haspopup="dialog" onClick={onCancel}>
        Cancel appointment
      </Button>
    </>
  ) : undefined;
  const cutoff = dealership ? cutoffOf(a, dealership) : 0;
  const until = open && dealership && (
    <p className="m-0 max-w-(--measure) text-sm text-text-secondary">
      You can change or cancel this online until {formatTime(cutoff, zone)} on{" "}
      {formatDay(cutoff, zone, now)}, which is {leadWords(dealership)} before it
      starts. After that, contact {name}.{phone}
    </p>
  );

  return (
    <div className="grid gap-4">
      <PageBack to="/appointments">My appointments</PageBack>
      {notice && <InlineNote>{notice}</InlineNote>}
      <div className="grid gap-6 md:flex md:items-start md:gap-8">
        <div className="grid min-w-0 content-start gap-4 md:flex-1">
          <div className="grid gap-2">
            <h1
              ref={titleRef}
              tabIndex={-1}
              className="num text-2xl lg:text-3xl"
            >
              {formatDay(a.start, zone, now)},{" "}
              {formatTimeRange(a.start, a.end, zone)}
            </h1>
            <ZoneTimesNote timeZone={zone} />
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={status} />
              {status !== "cancelled" && (
                <TransportBadge transport={a.transport as Transport} />
              )}
            </div>
          </div>
          {changeClosed && (
            <Alert
              kind="info"
              title="This appointment can no longer be changed online."
            >
              <p>
                It starts in less than{" "}
                {dealership ? leadWords(dealership) : "a short time"}. Contact{" "}
                {name} to change it.{phone}
              </p>
            </Alert>
          )}
          {a.cancelledAt && (
            <div className="grid justify-items-start gap-3">
              <p className="m-0">
                Cancelled on {dayAndTime(a.cancelledAt, zone, now)}. The time is
                free for other customers.
              </p>
              <Button variant="primary" icon="plus" to="/book">
                Book a service
              </Button>
            </div>
          )}
          <FactsList
            heading="Details"
            tone={status === "cancelled" ? "sunken" : "default"}
            rows={[
              {
                term: "Service",
                value: `${a.display.serviceTypeName}, about ${formatDuration(minutes)}`,
              },
              {
                term: "Car",
                value: (
                  <>
                    {v.make} {v.model}, <Plate>{v.registration}</Plate>
                  </>
                ),
              },
              { term: "Dealership", value: dealership?.name },
              // D-0001-71 A: the owner is sent the technician's name; the row shows only when it is there.
              ...(a.display.technicianName
                ? [{ term: "Technician", value: a.display.technicianName }]
                : []),
              { term: "The car", value: carWords[a.transport] },
            ]}
          />
          {/* Below 768 the "until when" line sits under the facts; the buttons are in the bar. */}
          <div className="md:hidden">{until}</div>
        </div>
        {open && (
          <aside
            aria-label="Change this appointment"
            className="hidden content-start gap-4 md:grid md:w-(--size-side) md:shrink-0"
          >
            <div className="grid gap-3">{actions}</div>
            {until}
          </aside>
        )}
      </div>
      <ActionBar hideFrom="md" actions={actions} />
    </div>
  );
}
