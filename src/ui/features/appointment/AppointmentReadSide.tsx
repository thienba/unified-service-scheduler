// The read side of the `appointment` page, shared by every role (design.md 6, staff.md 5.2, customer.md):
// the time as the title, the badges, the flag and cancelled panels, and a flat facts list. Each role's
// view adds its own side panel and actions in `aside`.
import type { ReactNode } from "react";
import type { components } from "../../../api/contract/schema";
import { Alert } from "../../components/Alert";
import {
  FlagBadge,
  StatusBadge,
  TransportBadge,
  type Transport,
} from "../../components/Badge";
import { FactsList, PageBack, Plate, type Fact } from "../../components/Small";
import type { Dealership } from "../../data/api-problem";
import {
  formatDay,
  formatDuration,
  formatTime,
  formatTimeRange,
  localDateIn,
} from "../../format/format";
import { carChoiceText } from "../schedule/schedule-model";

export type Appointment = components["schemas"]["Appointment"];

export interface AppointmentViewProps {
  appointment: Appointment;
  /** The appointment's dealership, when the list of dealerships has it. */
  dealership: Dealership | undefined;
  now: number;
}

/** "Mon 26 Oct, 14:02". */
export function dayAndTime(instant: string, zone: string, now: number): string {
  return `${formatDay(instant, zone, now)}, ${formatTime(instant, zone)}`;
}

export function isCancelled(a: Appointment): boolean {
  return a.cancelledAt !== null;
}

export function AppointmentReadSide({
  appointment: a,
  dealership,
  now,
  audience,
  aside,
  flagPanel,
  actions,
  focusCancelled = false,
}: AppointmentViewProps & {
  audience: "customer" | "garage";
  aside?: ReactNode;
  /** Takes the place of the flag panel below (the manager's "This booking no longer fits"). */
  flagPanel?: ReactNode;
  /** A row of buttons under the details (the manager's Adjust and Cancel). */
  actions?: ReactNode;
  /** The cancel was made on this page: its button is gone, so the cancelled note takes focus (WCAG 2.4.3). */
  focusCancelled?: boolean;
}) {
  const zone = a.timeZone;
  const garage = audience === "garage";
  const cancelled = isCancelled(a);
  const status = cancelled
    ? "cancelled"
    : Date.parse(a.end) <= now
      ? "past"
      : "confirmed";
  const reason = garage ? (a.flags[0]?.reason ?? null) : null;
  const minutes = Math.round(
    (Date.parse(a.end) - Date.parse(a.start)) / 60_000,
  );
  const v = a.display.vehicle;
  const facts: Fact[] = [
    ...(garage
      ? [
          {
            term: "Customer",
            value: <span dir="auto">{a.display.customerName}</span>,
          },
        ]
      : []),
    {
      term: "Vehicle",
      value: (
        <>
          {v.make} {v.model}, <Plate>{v.registration}</Plate>
        </>
      ),
    },
    {
      term: "Service",
      value: `${a.display.serviceTypeName}, about ${formatDuration(minutes)}`,
    },
    { term: "Dealership", value: dealership?.name },
    // A customer is sent no technician name today (Q-0001-208), so the row shows only when there is one.
    ...(garage || a.display.technicianName
      ? [{ term: "Technician", value: a.display.technicianName }]
      : []),
    ...(garage ? [{ term: "Bay", value: a.display.serviceBayName }] : []),
    { term: "Car choice", value: carChoiceText(a) },
    { term: "Booked", value: dayAndTime(a.createdAt, zone, now) },
    ...(a.cancelledAt
      ? [{ term: "Cancelled", value: dayAndTime(a.cancelledAt, zone, now) }]
      : []),
  ];
  return (
    <div className="grid gap-4">
      {garage ? (
        <PageBack to={`/schedule?date=${localDateIn(a.start, zone)}`}>
          Back to schedule
        </PageBack>
      ) : (
        <PageBack to="/appointments">My appointments</PageBack>
      )}
      <div className="grid gap-2">
        <h1 className="num text-2xl lg:text-3xl">
          {formatDay(a.start, zone, now)},{" "}
          {formatTimeRange(a.start, a.end, zone)}
        </h1>
        <p className="text-lg">
          {a.display.serviceTypeName}
          {garage && a.display.customerName && (
            <>
              {" "}
              for <span dir="auto">{a.display.customerName}</span>
            </>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={status} />
          <TransportBadge transport={a.transport as Transport} />
          {reason && <FlagBadge>Flagged: {reason}</FlagBadge>}
        </div>
      </div>
      {flagPanel !== undefined
        ? flagPanel
        : reason &&
          !cancelled && (
            <Alert kind="warning" title={`Flagged: ${reason}`}>
              <p>
                It is still booked and still holds its technician and bay. The
                garage manager can move it from the Flagged list.
              </p>
            </Alert>
          )}
      {a.cancelledAt && (
        <Alert
          kind="info"
          focusTitle={focusCancelled}
          title={`This appointment was cancelled on ${dayAndTime(a.cancelledAt, zone, now)}.`}
        >
          <p>
            Its time is free again. A cancelled appointment cannot be changed.
          </p>
        </Alert>
      )}
      <div className="grid gap-4 md:flex md:items-start">
        <div className="min-w-0 md:flex-1">
          <FactsList
            heading="Details"
            rows={facts}
            tone={cancelled ? "sunken" : "default"}
          />
        </div>
        {aside && (
          <div className="min-w-0 md:w-(--size-side) md:shrink-0">{aside}</div>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** A flat panel with a title, a few words and its actions (the side of the page). */
export function SidePanel({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="grid content-start gap-4 rounded-card border border-border-subtle bg-surface p-5">
      <h2 className="text-xl">{title}</h2>
      <p className="max-w-(--measure)">{children}</p>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </section>
  );
}
