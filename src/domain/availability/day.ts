// The one place that decides whether a start is free (AD-10). `checkStart`, `searchDay` and
// `suggest` all end up in `evaluateStart`, so they cannot disagree.
import { contains, overlaps, type Interval } from "../appointment/interval";
import { isBlocking } from "../appointment/blocking";
import type {
  Appointment,
  CourtesyCar,
  EpochMs,
  LocalDate,
  ServiceBay,
  Technician,
} from "../model";
import {
  earliestAllowedStart,
  lastAllowedDate,
} from "../policies/lead-and-horizon";
import { openingWindow } from "../policies/opening-window";
import { isTechnicianFree } from "../policies/technician-free";
import { workSegments } from "../policies/work-segments";
import { MINUTE_MS, dayBounds, localDateOf } from "../time";
import type {
  CheckResult,
  ResourceRequest,
  Resources,
  SchedulingSnapshot,
  UnavailableReason,
} from "./types";

/** The blocking appointments of one resource, as intervals, in start order. */
function jobsBy(
  live: readonly Appointment[],
  pick: (a: Appointment) => string | null,
): Map<string, Interval[]> {
  const byId = new Map<string, Interval[]>();
  for (const a of live) {
    const id = pick(a);
    if (id === null) continue;
    const list = byId.get(id) ?? [];
    list.push({ start: a.start, end: a.end });
    byId.set(id, list);
  }
  return byId;
}

/** Everything about one local date that does not depend on the start time. */
export interface DayContext {
  snapshot: SchedulingSnapshot;
  date: LocalDate;
  window: Interval | null;
  durationMs: number;
  transport: ResourceRequest["transport"];
  technicians: {
    technician: Technician;
    segments: Interval[];
    jobs: Interval[];
  }[];
  bays: { bay: ServiceBay; jobs: Interval[] }[];
  courtesyCars: { car: CourtesyCar; jobs: Interval[] }[];
  bookedCount: ReadonlyMap<string, number>;
}

/** The blocking appointments that count for a check: not cancelled, not the one left out. */
function liveAppointments(
  snapshot: SchedulingSnapshot,
  excludeAppointmentId: string | undefined,
): Appointment[] {
  return snapshot.appointments.filter(
    (a) => isBlocking(a) && a.id !== excludeAppointmentId,
  );
}

export function buildDay(
  snapshot: SchedulingSnapshot,
  date: LocalDate,
  request: ResourceRequest,
): DayContext {
  const { dealership, serviceType } = snapshot;
  const live = liveAppointments(snapshot, request.excludeAppointmentId);
  const techJobs = jobsBy(live, (a) => a.technicianId);
  const bayJobs = jobsBy(live, (a) => a.serviceBayId);
  const carJobs = jobsBy(live, (a) => a.courtesyCarId);
  const pinnedTech = request.technicianId;
  const pinnedBay = request.serviceBayId;
  return {
    snapshot,
    date,
    window: openingWindow(dealership, date),
    durationMs: serviceType.durationMinutes * MINUTE_MS,
    transport: request.transport,
    technicians: snapshot.technicians
      .filter(
        (t) =>
          t.dealershipId === dealership.id &&
          t.active &&
          t.skills.includes(serviceType.requiredSkill) &&
          (pinnedTech === undefined || t.id === pinnedTech),
      )
      .map((technician) => ({
        technician,
        segments: workSegments(technician, dealership, date),
        jobs: techJobs.get(technician.id) ?? [],
      })),
    bays: snapshot.bays
      .filter(
        (b) =>
          b.dealershipId === dealership.id &&
          b.active &&
          (pinnedBay === undefined || b.id === pinnedBay),
      )
      .map((bay) => ({ bay, jobs: bayJobs.get(bay.id) ?? [] })),
    courtesyCars: snapshot.courtesyCars
      .filter((c) => c.dealershipId === dealership.id && c.active)
      .map((car) => ({ car, jobs: carJobs.get(car.id) ?? [] })),
    bookedCount: countByTechnician(live, date, dealership.timeZone),
  };
}

/** Steps 2 of section 7.4: lead time and horizon. Empty means the start is allowed. */
export function policyReasons(
  snapshot: SchedulingSnapshot,
  start: EpochMs,
  now: EpochMs,
): UnavailableReason[] {
  const { policies, timeZone } = snapshot.dealership;
  const reasons: UnavailableReason[] = [];
  if (start < earliestAllowedStart(now, policies.leadTimeMinutes)) {
    reasons.push("TOO_SOON");
  }
  if (
    localDateOf(start, timeZone) >
    lastAllowedDate(now, timeZone, policies.horizonDays)
  ) {
    reasons.push("BEYOND_HORIZON");
  }
  return reasons;
}

/** Steps 1 and 3 to 7 of section 7.4 for one start on the context's date. */
export function evaluateStart(day: DayContext, start: EpochMs): CheckResult {
  const job: Interval = { start, end: start + day.durationMs };
  if (day.window === null) {
    return { available: false, reasons: ["DEALERSHIP_CLOSED"] };
  }
  if (!contains(day.window, job)) {
    return { available: false, reasons: ["OUTSIDE_OPENING_HOURS"] };
  }
  const reasons: UnavailableReason[] = [];
  const breakMinutes = day.snapshot.dealership.policies.breakMinutes;

  const onShift = day.technicians.filter((t) =>
    t.segments.some((segment) => contains(segment, job)),
  );
  const freeTechnicians = onShift.filter((t) =>
    isTechnicianFree(job, t.jobs, breakMinutes),
  );
  if (onShift.length === 0) reasons.push("NO_QUALIFIED_TECHNICIAN_ON_SHIFT");
  else if (freeTechnicians.length === 0) reasons.push("TECHNICIAN_BUSY");

  const freeBays = day.bays.filter(
    (b) => !b.jobs.some((j) => overlaps(job, j)),
  );
  if (freeBays.length === 0) reasons.push("BAY_BUSY");

  const freeCars = day.courtesyCars.filter(
    (c) => !c.jobs.some((j) => overlaps(job, j)),
  );
  if (day.transport === "courtesy_car" && freeCars.length === 0) {
    reasons.push("COURTESY_CAR_BUSY");
  }

  if (reasons.length > 0) return { available: false, reasons };
  return {
    available: true,
    ...pickResources(
      {
        technicians: freeTechnicians.map((t) => t.technician),
        bays: freeBays.map((b) => b.bay),
        courtesyCars:
          day.transport === "courtesy_car" ? freeCars.map((c) => c.car) : [],
      },
      day.bookedCount,
    ),
  };
}

/** How many blocking appointments each technician has on a local date. */
export function countByTechnician(
  live: readonly Appointment[],
  date: LocalDate,
  zone: string,
): Map<string, number> {
  const day = dayBounds(date, zone);
  const counts = new Map<string, number>();
  for (const a of live) {
    if (a.start >= day.start && a.start < day.end) {
      counts.set(a.technicianId, (counts.get(a.technicianId) ?? 0) + 1);
    }
  }
  return counts;
}

const byName = <T extends { name: string }>(a: T, b: T) =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0;

/**
 * D-0001-15: the least-booked technician on that local date, then by name; the first free bay
 * by name (D-0001-22 b); the first free courtesy car by name. The lists hold only free
 * resources and the technician list is not empty.
 */
export function pickResources(
  free: {
    technicians: readonly Technician[];
    bays: readonly ServiceBay[];
    courtesyCars: readonly CourtesyCar[];
  },
  bookedCount: ReadonlyMap<string, number>,
): Resources {
  const count = (t: Technician) => bookedCount.get(t.id) ?? 0;
  const [technician] = [...free.technicians].sort(
    (a, b) => count(a) - count(b) || byName(a, b),
  );
  const [bay] = [...free.bays].sort(byName);
  const [car] = [...free.courtesyCars].sort(byName);
  return {
    technicianId: technician!.id,
    serviceBayId: bay!.id,
    courtesyCarId: car?.id ?? null,
  };
}

/** The booked intervals of a technician on a local date (REQ-BOOK-006.AC-4), earliest first. */
export function bookedIntervals(
  appointments: readonly Appointment[],
  technicianId: string,
  date: LocalDate,
  zone: string,
): Interval[] {
  const day = dayBounds(date, zone);
  return appointments
    .filter(
      (a) =>
        isBlocking(a) && a.technicianId === technicianId && overlaps(a, day),
    )
    .map((a) => ({ start: a.start, end: a.end }))
    .sort((a, b) => a.start - b.start);
}
