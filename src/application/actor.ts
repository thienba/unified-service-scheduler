// Who is calling, and what that role may do (AD-3, Q-0001-9 A, D-0001-14, D-0001-19).
import type { Role } from "../domain/model";

export interface Actor {
  userId: string;
  role: Role;
  /** Set for a customer. */
  customerId?: string;
  /** The dealerships a staff member or manager works for. */
  dealershipIds: string[];
}

/** Staff and managers work for the dealerships in their list; a customer is tied to none. */
export function servesDealership(actor: Actor, dealershipId: string): boolean {
  return (
    actor.role !== "customer" && actor.dealershipIds.includes(dealershipId)
  );
}

/** Cancel and reschedule belong to the owner and the manager; staff cannot (D-0001-19 A). */
export function mayChangeAppointments(actor: Actor): boolean {
  return actor.role === "customer" || actor.role === "manager";
}

/**
 * Whether the actor may see that this appointment exists: the customer who owns it, or a manager
 * of its dealership. Anyone else is told it does not exist (SEC-5).
 */
export function canReach(
  actor: Actor,
  appointment: { customerId: string; dealershipId: string },
): boolean {
  return actor.role === "customer"
    ? actor.customerId === appointment.customerId
    : servesDealership(actor, appointment.dealershipId);
}
