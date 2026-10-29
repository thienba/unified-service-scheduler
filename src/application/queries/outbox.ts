// The outbox read (REQ-BOOK-013). The messages are written by the booking commands; this only reads.
import { isManager, type Actor } from "../actor";
import type { EpochMs } from "../../domain/model";
import type { OutboxStatus } from "../ports";
import type { QueryDeps, QueryFailure } from "./shared";

export interface OutboxEntry {
  id: string;
  appointmentId: string;
  dealershipId: string;
  kind: string;
  dueAt: EpochMs;
  status: OutboxStatus;
}

export type OutboxResult =
  { kind: "ok"; messages: OutboxEntry[] } | QueryFailure;

/**
 * Managers only, for their own dealerships (SEC-3, SEC-4, SEC-17.AC-3). A dealership that is not
 * theirs is refused; an appointment id that is unknown or not in their dealerships is "not found".
 */
export async function listOutbox(
  actor: Actor,
  deps: QueryDeps,
  filter: { dealershipId?: string; appointmentId?: string } = {},
): Promise<OutboxResult> {
  if (!isManager(actor)) return { kind: "forbidden" };
  const { dealershipId, appointmentId } = filter;
  if (
    dealershipId !== undefined &&
    !actor.dealershipIds.includes(dealershipId)
  ) {
    return { kind: "forbidden" };
  }
  const allowed =
    dealershipId === undefined ? actor.dealershipIds : [dealershipId];
  return deps.uow.read((stores) =>
    deps.logger.step("load", async (): Promise<OutboxResult> => {
      if (appointmentId !== undefined) {
        const appointment = await stores.appointments.get(appointmentId);
        if (!appointment || !allowed.includes(appointment.dealershipId)) {
          return { kind: "not_found" };
        }
      }
      const messages: OutboxEntry[] = [];
      for (const message of await stores.outbox.list(
        appointmentId === undefined ? {} : { appointmentId },
      )) {
        const appointment = await stores.appointments.get(
          message.appointmentId,
        );
        if (appointment && allowed.includes(appointment.dealershipId)) {
          messages.push({
            id: message.id,
            appointmentId: message.appointmentId,
            dealershipId: appointment.dealershipId,
            kind: message.kind,
            dueAt: message.dueAt,
            status: message.status,
          });
        }
      }
      return { kind: "ok", messages };
    }),
  );
}
