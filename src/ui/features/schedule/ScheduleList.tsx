// design.md 8.13: ListRow (AppointmentRow and FreeGapRow). The list reads in time order (REQ-BOOK-004.AC-6).
import { Link } from "react-router";
import {
  FlagBadge,
  TransportBadge,
  type Transport,
} from "../../components/Badge";
import { Plate } from "../../components/Small";
import { Icon } from "../../components/Icon";
import { formatTime, formatTimeRange } from "../../format/format";
import {
  bayName,
  flagReason,
  gapHref,
  gapLabel,
  gapName,
  technicianName,
  vehicleText,
  type Appointment,
  type ListItem,
  type Rows,
  type ScheduleDay,
  type ScheduleTechnician,
  type TimeSlot,
} from "./schedule-model";

const rowEdge = "border-t border-border-subtle";

export function AppointmentRow({
  day,
  appointment: a,
  rows,
}: {
  day: ScheduleDay;
  appointment: Appointment;
  rows: Rows;
}) {
  const reason = flagReason(a);
  const who =
    rows === "technicians"
      ? `${technicianName(day, a)}, ${bayName(day, a)}`
      : `${bayName(day, a)}, ${technicianName(day, a)}`;
  return (
    <Link
      to={`/appointments/${a.id}`}
      className={`${rowEdge} grid min-h-(--size-row) grid-cols-[var(--size-hour)_minmax(0,1fr)] items-start gap-x-4 gap-y-1 px-2 py-4 text-text no-underline transition-colors duration-(--duration-fast) ease-out hover:bg-surface focus-visible:-outline-offset-(--focus-ring-offset) active:bg-surface-sunken md:grid-cols-[var(--size-hour)_minmax(0,1fr)_auto]`}
    >
      <span className="num leading-snug font-semibold">
        {formatTime(a.start, day.timeZone)}
        <small className="block text-sm font-normal text-text-secondary">
          to {formatTime(a.end, day.timeZone)}
        </small>
      </span>
      <span className="min-w-0 wrap-anywhere">
        <b>{a.display.serviceTypeName}</b>, {vehicleText(a)}{" "}
        <Plate>{a.display.vehicle.registration}</Plate>
        <span className="block text-sm text-text-secondary">{who}</span>
      </span>
      <span className="col-start-2 flex flex-wrap gap-2 md:col-start-3 md:row-start-1 md:max-w-(--size-side) md:justify-end">
        <TransportBadge transport={a.transport as Transport} />
        {reason && <FlagBadge>Flagged: {reason}</FlagBadge>}
      </span>
    </Link>
  );
}

export function FreeGapRow({
  zone,
  gap,
  technician,
  canBook,
}: {
  zone: string;
  gap: TimeSlot;
  technician: ScheduleTechnician;
  canBook: boolean;
}) {
  const inner = (
    <span className="flex min-h-(--size-target) items-center gap-3 rounded-control border border-dashed border-free-border px-3 py-2 transition-colors duration-(--duration-fast) ease-out group-hover:border-solid group-hover:bg-info-tint group-active:bg-info-tint-strong">
      <Icon name="plus" />
      <span>
        <b className="num font-semibold">
          {formatTimeRange(gap.start, gap.end, zone)} · {gapLabel(gap)}
        </b>
        <small className="block text-sm text-text-secondary">
          {technician.name}. Book this time
        </small>
      </span>
    </span>
  );
  const name = gapName(zone, gap, technician.name);
  const className = `${rowEdge} group block p-2 text-text no-underline focus-visible:-outline-offset-(--focus-ring-offset)`;
  return canBook ? (
    <Link
      to={gapHref(gap, technician.id)}
      className={className}
      aria-label={name}
    >
      {inner}
    </Link>
  ) : (
    <div className={className} role="img" aria-label={name}>
      {inner}
    </div>
  );
}

export function ScheduleList({
  day,
  items,
  rows,
  canBook,
}: {
  day: ScheduleDay;
  items: readonly ListItem[];
  rows: Rows;
  canBook: boolean;
}) {
  const gaps = items.some((i) => i.kind === "gap");
  return (
    <ol
      aria-label={`Appointments${gaps ? " and free time" : ""} in time order`}
      className="m-0 list-none border-b border-border-subtle p-0"
    >
      {items.map((item) => (
        <li
          key={
            item.kind === "gap"
              ? `gap-${item.technician.id}-${item.start}`
              : item.appointment.id
          }
        >
          {item.kind === "gap" ? (
            <FreeGapRow
              zone={day.timeZone}
              gap={item.gap}
              technician={item.technician}
              canBook={canBook}
            />
          ) : (
            <AppointmentRow
              day={day}
              appointment={item.appointment}
              rows={rows}
            />
          )}
        </li>
      ))}
    </ol>
  );
}
