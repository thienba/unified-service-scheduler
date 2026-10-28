// Which messages an appointment event makes, and when they are due (AD-13, AD-9).
// A message holds ids only; a real sender would look up contact details when it sends (SEC-17).
import type { Appointment, EpochMs } from "../model";
import { MINUTE_MS, instantAt, localDateOf } from "../time";

export type OutboxKind =
  | "confirmation"
  | "reminder_48h"
  | "reminder_morning"
  | "cancellation"
  | "moved";

/** What a command stores; the command adds the message id and the status. */
export interface PlannedMessage {
  appointmentId: string;
  kind: OutboxKind;
  /** `appointmentId:kind:version` (AD-13) */
  dedupeKey: string;
  dueAt: EpochMs;
}

const HOUR_MS = 60 * MINUTE_MS;
const MORNING = "08:00";

/**
 * The two reminder times of a start (Q-0001-21 A, D-0001-22 d): 48 hours before, and 08:00 on the
 * day in the dealership's zone, or 2 hours before the start when the start is at or before 08:00.
 */
export function reminderTimes(
  start: EpochMs,
  timeZone: string,
): { reminder48h: EpochMs; morning: EpochMs } {
  const eight = instantAt(localDateOf(start, timeZone), MORNING, timeZone);
  return {
    reminder48h: start - 48 * HOUR_MS,
    morning: start <= eight ? start - 2 * HOUR_MS : eight,
  };
}

function message(
  appointment: Appointment,
  kind: OutboxKind,
  dueAt: EpochMs,
): PlannedMessage {
  return {
    appointmentId: appointment.id,
    kind,
    dedupeKey: `${appointment.id}:${kind}:${appointment.version}`,
    dueAt,
  };
}

/** The reminders that are still ahead of `now`; one whose time has passed is skipped. */
function reminders(appointment: Appointment, now: EpochMs): PlannedMessage[] {
  const times = reminderTimes(appointment.start, appointment.timeZone);
  return [
    message(appointment, "reminder_48h", times.reminder48h),
    message(appointment, "reminder_morning", times.morning),
  ].filter((m) => m.dueAt > now);
}

/** A new appointment: a confirmation now and the reminders still ahead. */
export function messagesForBooking(
  appointment: Appointment,
  now: EpochMs,
): PlannedMessage[] {
  return [
    message(appointment, "confirmation", now),
    ...reminders(appointment, now),
  ];
}

/** A new time (by the customer or the manager): a "moved" message now and the new reminders (D-0001-17). */
export function messagesForMove(
  appointment: Appointment,
  now: EpochMs,
): PlannedMessage[] {
  return [message(appointment, "moved", now), ...reminders(appointment, now)];
}

/** A cancelled appointment: one cancellation message now. */
export function messagesForCancel(
  appointment: Appointment,
  now: EpochMs,
): PlannedMessage[] {
  return [message(appointment, "cancellation", now)];
}

/** Fixed paths plus the appointment id and nothing else; the app origin is added when read (SEC-17.AC-2). */
export function messageLinks(appointmentId: string): {
  cancel: string;
  reschedule: string;
} {
  return {
    cancel: `/appointments/${appointmentId}/cancel`,
    reschedule: `/appointments/${appointmentId}/reschedule`,
  };
}
