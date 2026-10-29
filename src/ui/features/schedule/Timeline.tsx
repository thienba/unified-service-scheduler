// design.md 8.12: Timeline, TimelineRow, TimelineBlock, FreeGap, NowLine and Legend (desktop).
// Every position is set through the DOM style object, never as style text in the HTML, so the built page's
// Content Security Policy allows it (SEC-15.AC-1).
import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router";
import { transportWords, type Transport } from "../../components/Badge";
import { cx } from "../../components/cx";
import { Icon } from "../../components/Icon";
import { formatTime, formatTimeRange } from "../../format/format";
import {
  appointmentsOf,
  appointmentsWord,
  axisHours,
  blockName,
  blockShowsText,
  flagReason,
  gapHref,
  gapName,
  gapShowsText,
  hourLength,
  hoursFrom,
  minutesBetween,
  railText,
  railTitle,
  vehicleText,
  type Appointment,
  type Axis,
  type Rows,
  type ScheduleDay,
  type ScheduleTechnician,
  type TimeSlot,
} from "./schedule-model";

/** Left and width of a slot inside a lane. */
function across(axis: Axis, slot: TimeSlot): CSSProperties {
  return {
    left: hourLength(hoursFrom(axis, slot.start)),
    width: hourLength(hoursFrom(axis, slot.end) - hoursFrom(axis, slot.start)),
  };
}

const laneItem = "absolute top-2 bottom-2 rounded-control";

export function TimelineBlock({
  day,
  appointment: a,
  selected,
  onSelect,
  style,
  vertical = false,
}: {
  day: ScheduleDay;
  appointment: Appointment;
  selected?: boolean;
  onSelect?: (id: string) => void;
  style: CSSProperties;
  /** In the one-technician day the block is a link to the appointment page. */
  vertical?: boolean;
}) {
  const reason = flagReason(a);
  // A flagged block shows the alert and still the car choice, so the car choice is never lost (REQ-BOOK-010.AC-2).
  const carIcon = transportWords[a.transport as Transport].icon;
  const minutes = minutesBetween(a.start, a.end);
  // The visible words run in the same order as the name in `aria-label`, so the name contains them
  // (WCAG 2.5.3, Q-0001-209): service then vehicle on a row, time then service in the one-day view.
  const time = formatTimeRange(a.start, a.end, day.timeZone);
  const vehicle = `${vehicleText(a)} ${a.display.vehicle.registration}`;
  const [top, bottom] = vertical
    ? [time, a.display.serviceTypeName]
    : [a.display.serviceTypeName, vehicle];
  const className = cx(
    vertical ? "absolute inset-x-1 justify-start pt-1" : laneItem,
    vertical && "rounded-control",
    "flex min-w-0 flex-col justify-center overflow-hidden border px-2 text-start leading-snug text-text no-underline transition-colors duration-(--duration-fast) ease-out",
    reason
      ? "border-dashed border-flag-border bg-flag-bg hover:bg-warning-tint"
      : "border-appointment-border bg-appointment-bg hover:bg-appointment-bg-hover",
    "active:border-(length:--border-width-strong) active:bg-info-tint-strong",
    selected &&
      "z-10 outline-solid outline-(length:--border-width-thick) outline-offset-1 outline-text",
  );
  const content = blockShowsText(minutes) ? (
    <>
      <b className="flex min-w-0 items-center gap-1 text-sm font-semibold">
        {reason && <Icon name="alert" />}
        <Icon name={carIcon} />
        <span className="num truncate">{top}</span>
      </b>{" "}
      <small className="num block truncate text-xs">{bottom}</small>
    </>
  ) : (
    <Icon name={reason ? "alert" : carIcon} />
  );
  const name = blockName(day, a);
  const title = `${time}, ${a.display.serviceTypeName}, ${vehicleText(a)}${reason ? " (flagged)" : ""}`;
  if (vertical) {
    return (
      <Link
        to={`/appointments/${a.id}`}
        className={className}
        style={style}
        aria-label={name}
        title={title}
      >
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      data-appointment={a.id}
      className={className}
      style={style}
      aria-pressed={selected ?? false}
      aria-label={name}
      title={title}
      onClick={() => onSelect?.(a.id)}
    >
      {content}
    </button>
  );
}

export function FreeGap({
  zone,
  gap,
  technician,
  canBook,
  style,
  vertical = false,
}: {
  zone: string;
  gap: TimeSlot;
  technician: ScheduleTechnician;
  canBook: boolean;
  style: CSSProperties;
  vertical?: boolean;
}) {
  const showText = gapShowsText(minutesBetween(gap.start, gap.end));
  const className = cx(
    vertical ? "absolute inset-x-1" : laneItem,
    vertical && "rounded-control",
    "flex items-center justify-center gap-1 overflow-hidden border border-dashed border-free-border text-sm whitespace-nowrap text-text no-underline transition-colors duration-(--duration-fast) ease-out hover:border-solid hover:bg-info-tint active:bg-info-tint-strong",
  );
  const content = (
    <>
      <Icon name="plus" />
      {showText && <span>Free</span>}
    </>
  );
  const name = gapName(zone, gap, technician.name);
  return canBook ? (
    <Link
      to={gapHref(gap, technician.id)}
      className={className}
      style={style}
      aria-label={name}
    >
      {content}
    </Link>
  ) : (
    <span role="img" className={className} style={style} aria-label={name}>
      {content}
    </span>
  );
}

function Hatch({ style }: { style: CSSProperties }) {
  return (
    <div className="hatched absolute inset-y-0" style={style} aria-hidden />
  );
}

export function BreakMarker({
  zone,
  slot,
  style,
  className,
}: {
  zone: string;
  slot: TimeSlot;
  style: CSSProperties;
  className?: string;
}) {
  const words = `Break ${formatTimeRange(slot.start, slot.end, zone)}`;
  return (
    <div
      className={cx(
        "flex items-center justify-center overflow-hidden rounded-control border border-border-subtle bg-break-bg text-break-fg",
        className ?? laneItem,
      )}
      style={style}
      title={words}
    >
      <Icon name="coffee" />
      <span className="sr-only">{words}</span>
    </div>
  );
}

export function NotWorking({ onLeave }: { onLeave: boolean }) {
  return (
    <>
      <div className="hatched absolute inset-0" aria-hidden />
      <div className="absolute inset-0 flex items-center justify-center text-sm text-text-secondary">
        <span className="rounded-pill border border-border-subtle bg-surface px-3">
          {onLeave
            ? "On leave today. No bookings."
            : "Not working today. No bookings."}
        </span>
      </div>
    </>
  );
}

/** One row: the rail (name over skills and shift) and the lane, items in time order for Tab. */
function TimelineRow({
  name,
  subtitle,
  label,
  children,
  lines,
}: {
  name: string;
  subtitle: string;
  label: string;
  children: ReactNode;
  lines: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex border-t border-border-subtle first:border-t-0"
    >
      <div
        className="sticky start-0 z-20 flex w-(--size-rail) shrink-0 flex-col justify-center border-e border-border-subtle bg-surface px-4 py-2"
        title={railTitle(name, subtitle)}
      >
        <b className="truncate font-heading">{name}</b>
        <span className="num truncate text-sm text-text-secondary">
          {subtitle}
        </span>
      </div>
      <div className="relative h-(--size-row) flex-1">
        {lines}
        {children}
      </div>
    </div>
  );
}

export function Timeline({
  day,
  axis,
  rows,
  now,
  selectedId,
  onSelect,
  canBook,
}: {
  day: ScheduleDay;
  axis: Axis;
  rows: Rows;
  /** The current instant on today; null on any other day. */
  now: number | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  canBook: boolean;
}) {
  const zone = day.timeZone;
  const hours = axisHours(axis);
  const lines = axis.labels.map((l) => (
    <span
      key={l.at}
      aria-hidden
      className="absolute inset-y-0 w-px bg-border-subtle"
      style={{ left: hourLength(hoursFrom(axis, l.at)) }}
    />
  ));
  const block = (a: Appointment) => (
    <TimelineBlock
      key={a.id}
      day={day}
      appointment={a}
      selected={a.id === selectedId}
      onSelect={onSelect}
      style={across(axis, a)}
    />
  );
  const nowInside = now !== null && now >= axis.start && now <= axis.end;
  return (
    <div
      tabIndex={0}
      role="region"
      aria-label="Day timeline, scrolls sideways"
      className="overflow-x-auto rounded-card border border-border-subtle bg-surface"
    >
      <div
        className="relative"
        style={{
          minWidth: `calc(var(--size-rail) + ${hourLength(hours)})`,
        }}
      >
        <div className="flex border-b border-border-subtle bg-surface-page">
          <div className="sticky start-0 z-20 flex w-(--size-rail) shrink-0 items-center border-e border-border-subtle bg-surface-page px-4 text-sm text-text-secondary">
            {rows === "technicians" ? "Technician" : "Service bay"}
          </div>
          <div className="relative h-(--size-target) flex-1" aria-hidden>
            {axis.labels.map((l) => (
              <span
                key={l.at}
                className="num absolute top-0 ps-2 pt-2 text-xs text-text-secondary"
                style={{ left: hourLength(hoursFrom(axis, l.at)) }}
              >
                {l.text}
              </span>
            ))}
          </div>
        </div>
        {rows === "technicians"
          ? day.technicians.map((t) => {
              const items = [
                ...appointmentsOf(day, "technicians", t.id).map((a) => ({
                  at: a.start,
                  node: block(a),
                })),
                ...t.free.map((gap) => ({
                  at: gap.start,
                  node: (
                    <FreeGap
                      key={`gap-${gap.start}`}
                      zone={zone}
                      gap={gap}
                      technician={t}
                      canBook={canBook}
                      style={across(axis, gap)}
                    />
                  ),
                })),
              ].sort((x, y) => Date.parse(x.at) - Date.parse(y.at));
              return (
                <TimelineRow
                  key={t.id}
                  name={t.name}
                  subtitle={railText(day, t)}
                  label={t.onLeave ? `${t.name}, on leave` : t.name}
                  lines={lines}
                >
                  {t.shift === null ? (
                    <NotWorking onLeave={t.onLeave} />
                  ) : (
                    <>
                      <Hatch
                        style={{
                          left: 0,
                          width: hourLength(hoursFrom(axis, t.shift.start)),
                        }}
                      />
                      <Hatch
                        style={{
                          left: hourLength(hoursFrom(axis, t.shift.end)),
                          right: 0,
                        }}
                      />
                      {t.break && (
                        <BreakMarker
                          zone={zone}
                          slot={t.break}
                          style={across(axis, t.break)}
                        />
                      )}
                    </>
                  )}
                  {items.map((i) => i.node)}
                </TimelineRow>
              );
            })
          : day.serviceBays.map((b) => {
              const jobs = appointmentsOf(day, "bays", b.id);
              return (
                <TimelineRow
                  key={b.id}
                  name={b.name}
                  subtitle={
                    jobs.length
                      ? appointmentsWord(jobs.length)
                      : "No appointments"
                  }
                  label={b.name}
                  lines={lines}
                >
                  {jobs.map(block)}
                </TimelineRow>
              );
            })}
        {nowInside && (
          <div
            className="pointer-events-none absolute inset-y-0 z-30 w-(--border-width-strong) bg-now"
            style={{
              left: `calc(var(--size-rail) + ${hourLength(hoursFrom(axis, now))})`,
            }}
          >
            <span className="num absolute start-1 top-1 rounded-pill bg-surface-selected px-2 text-xs whitespace-nowrap text-text-on-selected">
              Now {formatTime(now, zone)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function Swatch({ className }: { className: string }) {
  return (
    <i
      aria-hidden
      className={cx(
        "inline-block h-4 w-6 flex-none rounded-xs border border-border-subtle",
        className,
      )}
    />
  );
}

/** What the shapes mean: only the shapes this view draws. */
export function Legend({
  rows,
  showNow,
  showGaps,
}: {
  rows: Rows;
  showNow: boolean;
  showGaps: boolean;
}) {
  const item = "inline-flex items-center gap-2";
  return (
    <div
      role="group"
      aria-label="What the shapes mean"
      className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-text-secondary"
    >
      <span className={item}>
        <Swatch className="border-appointment-border bg-appointment-bg" />
        Appointment
      </span>
      <span className={item}>
        <Swatch className="border-dashed border-flag-border bg-flag-bg" />
        Flagged: needs a look
      </span>
      {rows === "technicians" && (
        <>
          <span className={item}>
            <Swatch className="hatched" />
            Outside the shift
          </span>
          <span className={item}>
            <Swatch className="bg-break-bg" />
            Break
          </span>
          {showGaps && (
            <span className={item}>
              <Swatch className="border-dashed border-free-border bg-transparent" />
              Free: tap to book
            </span>
          )}
        </>
      )}
      {showNow && (
        <span className={item}>
          <i
            aria-hidden
            className="inline-block h-4 w-(--border-width-strong) bg-now"
          />
          Now
        </span>
      )}
      {(Object.keys(transportWords) as Transport[]).map((k) => (
        <span key={k} className={item}>
          <Icon name={transportWords[k].icon} />
          {transportWords[k].label}
        </span>
      ))}
    </div>
  );
}
