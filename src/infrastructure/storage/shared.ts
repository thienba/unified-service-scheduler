// Small pure helpers both stores use, so that they answer the same way (AD-8).
import type { Customer, EpochMs, Vehicle } from "../../domain/model";

/** True when `[start, end)` touches `[from, to)`. */
export function touchesRange(
  appointment: { start: EpochMs; end: EpochMs },
  from: EpochMs,
  to: EpochMs,
): boolean {
  return appointment.start < to && appointment.end > from;
}

export function nameLower(name: string): string {
  return name.toLowerCase();
}

function squash(text: string): string {
  return text.replace(/\s+/g, "").toLowerCase();
}

/** A customer matches by part of the name (any case), part of the phone or part of a registration. */
export function matchesSearch(
  text: string,
  customer: Customer,
  vehicles: Vehicle[],
): boolean {
  const wanted = text.trim();
  if (wanted === "") return false;
  const squashed = squash(wanted);
  return (
    nameLower(customer.name).includes(wanted.toLowerCase()) ||
    squash(customer.phone).includes(squashed) ||
    vehicles.some((v) => squash(v.registration).includes(squashed))
  );
}

const compare = (a: string | number, b: string | number) =>
  a < b ? -1 : a > b ? 1 : 0;

/** Lists come back in this order from every store (the port documents it). */
export const byId = <T extends { id: string }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => compare(a.id, b.id));

export const byStartThenId = <T extends { id: string; start: number }>(
  rows: T[],
): T[] =>
  [...rows].sort((a, b) => compare(a.start, b.start) || compare(a.id, b.id));

export const byTechnicianThenDate = <
  T extends { technicianId: string; date: string },
>(
  rows: T[],
): T[] =>
  [...rows].sort(
    (a, b) =>
      compare(a.technicianId, b.technicianId) || compare(a.date, b.date),
  );
