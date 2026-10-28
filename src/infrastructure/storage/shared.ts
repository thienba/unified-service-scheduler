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
