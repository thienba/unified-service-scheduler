// The panel under the timeline: the selected block's details (staff.md 5.1, states `selected` and
// `selected-flagged`). It is a polite live region, so a selection is read out while focus stays on the block.
import { FlagBadge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { Plate } from "../../components/Small";
import { formatTimeRange } from "../../format/format";
import {
  bayName,
  carChoiceText,
  flagReason,
  technicianName,
  vehicleText,
  type Appointment,
  type ScheduleDay,
} from "./schedule-model";

export function DetailPanel({
  day,
  appointment: a,
}: {
  day: ScheduleDay;
  appointment: Appointment | null;
}) {
  const reason = a ? flagReason(a) : null;
  return (
    <div
      aria-live="polite"
      className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 rounded-card border border-border-subtle bg-surface p-5"
    >
      {a === null ? (
        <p className="flex items-center gap-2 text-text-secondary">
          <Icon name="info" />
          <span>
            Select an appointment to see who it is for, or a dashed time to book
            it.
          </span>
        </p>
      ) : (
        <>
          <div className="min-w-0">
            <h2 className="text-lg">
              {a.display.serviceTypeName}, {vehicleText(a)}
            </h2>
            <dl className="num mt-2 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-x-6 gap-y-2">
              {[
                ["Time", formatTimeRange(a.start, a.end, day.timeZone)],
                ["Customer", <span dir="auto">{a.display.customerName}</span>],
                [
                  "Registration",
                  <Plate>{a.display.vehicle.registration}</Plate>,
                ],
                ["Technician", technicianName(day, a)],
                ["Bay", bayName(day, a)],
                ["Car choice", carChoiceText(a)],
              ].map(([term, value]) => (
                <div key={term as string}>
                  <dt className="text-sm text-text-secondary">{term}</dt>
                  <dd className="m-0 font-medium wrap-anywhere">{value}</dd>
                </div>
              ))}
            </dl>
            {reason && (
              <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <FlagBadge>Flagged: {reason}</FlagBadge>
                <span>
                  The booking is still valid. The garage manager can move it.
                </span>
              </p>
            )}
          </div>
          <Button to={`/appointments/${a.id}`}>Open appointment</Button>
        </>
      )}
    </div>
  );
}
