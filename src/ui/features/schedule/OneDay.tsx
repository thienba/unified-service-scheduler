// design.md 8.12 OneTechnicianDay: one technician's (or one bay's) day, hours running down the page at
// `--size-hour` per hour. Phone and tablet.
import type { CSSProperties } from "react";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { formatTime, formatTimeRange } from "../../format/format";
import {
  appointmentsOf,
  appointmentsWord,
  axisHours,
  hourLength,
  hoursFrom,
  skillsText,
  type Axis,
  type Rows,
  type ScheduleDay,
  type TimeSlot,
} from "./schedule-model";
import {
  BreakMarker,
  FreeGap,
  Legend,
  NotWorking,
  TimelineBlock,
} from "./Timeline";

function down(axis: Axis, slot: TimeSlot): CSSProperties {
  return {
    top: hourLength(hoursFrom(axis, slot.start)),
    height: hourLength(hoursFrom(axis, slot.end) - hoursFrom(axis, slot.start)),
  };
}

export function OneDay({
  day,
  axis,
  rows,
  rowId,
  onRow,
  now,
  dayText,
  canBook,
  showGaps,
}: {
  day: ScheduleDay;
  axis: Axis;
  rows: Rows;
  rowId: string;
  onRow: (id: string) => void;
  now: number | null;
  dayText: string;
  canBook: boolean;
  showGaps: boolean;
}) {
  const zone = day.timeZone;
  const options =
    rows === "technicians"
      ? day.technicians.map((t) => ({ id: t.id, name: t.name }))
      : day.serviceBays.map((b) => ({ id: b.id, name: b.name }));
  const index = Math.max(
    0,
    options.findIndex((o) => o.id === rowId),
  );
  const current = options[index];
  const technician =
    rows === "technicians"
      ? day.technicians.find((t) => t.id === current?.id)
      : undefined;
  const jobs = current ? appointmentsOf(day, rows, current.id) : [];
  const gaps = showGaps ? (technician?.free ?? []) : [];
  const what = rows === "technicians" ? "technician" : "bay";
  let facts: string;
  if (technician) {
    const head = technician.onLeave
      ? `${skillsText(technician)}, on leave`
      : technician.shift
        ? `${skillsText(technician)}, shift ${formatTimeRange(technician.shift.start, technician.shift.end, zone)}`
        : `${skillsText(technician)}, not working today`;
    facts = `${head}. ${appointmentsWord(jobs.length)}${showGaps ? `, ${gaps.length} ${gaps.length === 1 ? "free gap" : "free gaps"}` : ""}.`;
  } else {
    facts = `${appointmentsWord(jobs.length)} in ${current?.name ?? ""}. Free time is shown by technician.`;
  }
  const height = { height: hourLength(axisHours(axis)) };
  const items = [
    ...jobs.map((a) => ({
      at: a.start,
      node: (
        <TimelineBlock
          key={a.id}
          day={day}
          appointment={a}
          style={down(axis, a)}
          vertical
        />
      ),
    })),
    ...(technician
      ? gaps.map((gap) => ({
          at: gap.start,
          node: (
            <FreeGap
              key={`gap-${gap.start}`}
              zone={zone}
              gap={gap}
              technician={technician}
              canBook={canBook}
              style={down(axis, gap)}
              vertical
            />
          ),
        }))
      : []),
  ].sort((x, y) => Date.parse(x.at) - Date.parse(y.at));
  const step = (by: number) => {
    const next = options[(index + by + options.length) % options.length];
    if (next) onRow(next.id);
  };
  const selectId = `one-day-${what}`;
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <Button
          size="icon"
          icon="left"
          aria-label={`Previous ${what}`}
          onClick={() => step(-1)}
        />
        <div className="relative min-w-0 flex-1">
          <label htmlFor={selectId} className="sr-only">
            {rows === "technicians" ? "Technician" : "Service bay"}
          </label>
          <select
            id={selectId}
            value={current?.id ?? ""}
            onChange={(e) => onRow(e.target.value)}
            className="min-h-(--size-field) w-full appearance-none truncate rounded-control border border-border-strong bg-surface ps-3 pe-10 text-text hover:border-text"
          >
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <Icon
            name="down"
            className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2"
          />
        </div>
        <Button
          size="icon"
          icon="right"
          aria-label={`Next ${what}`}
          onClick={() => step(1)}
        />
      </div>
      <p className="num text-text-secondary">{facts}</p>
      <div className="grid grid-cols-[var(--size-ruler)_minmax(0,1fr)] overflow-hidden rounded-card border border-border-subtle bg-surface">
        <div className="relative" style={height} aria-hidden>
          {axis.labels.map((l) => (
            <span
              key={l.at}
              className="num absolute start-2 pt-1 text-xs text-text-secondary"
              style={{ top: hourLength(hoursFrom(axis, l.at)) }}
            >
              {l.text}
            </span>
          ))}
        </div>
        <div
          role="group"
          aria-label={`${current?.name ?? ""}, ${dayText}`}
          className="relative border-s border-border-subtle"
          style={height}
        >
          {axis.labels.map((l) => (
            <span
              key={l.at}
              aria-hidden
              className="absolute inset-x-0 h-px bg-border-subtle"
              style={{ top: hourLength(hoursFrom(axis, l.at)) }}
            />
          ))}
          {technician &&
            (technician.shift === null ? (
              <NotWorking onLeave={technician.onLeave} />
            ) : (
              <>
                <div
                  className="hatched absolute inset-x-0 top-0"
                  style={{
                    height: hourLength(hoursFrom(axis, technician.shift.start)),
                  }}
                  aria-hidden
                />
                <div
                  className="hatched absolute inset-x-0 bottom-0"
                  style={{
                    top: hourLength(hoursFrom(axis, technician.shift.end)),
                  }}
                  aria-hidden
                />
                {technician.break && (
                  <BreakMarker
                    zone={zone}
                    slot={technician.break}
                    style={down(axis, technician.break)}
                    className="absolute inset-x-1"
                  />
                )}
              </>
            ))}
          {items.map((i) => i.node)}
          {now !== null && now >= axis.start && now <= axis.end && (
            <div
              className="pointer-events-none absolute inset-x-0 z-30 h-(--border-width-strong) bg-now"
              style={{ top: hourLength(hoursFrom(axis, now)) }}
            >
              <span className="num absolute start-1 -top-4 rounded-pill bg-surface-selected px-2 text-xs whitespace-nowrap text-text-on-selected">
                Now {formatTime(now, zone)}
              </span>
            </div>
          )}
        </div>
      </div>
      <details className="text-sm text-text-secondary">
        <summary className="flex min-h-(--size-target) items-center">
          What the shapes mean
        </summary>
        <Legend rows={rows} showNow={now !== null} showGaps={showGaps} />
      </details>
    </div>
  );
}
