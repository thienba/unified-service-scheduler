// What the outbox screen shows (manager.md 4.5 and 5.5, REQ-BOOK-013). Pure: the API's messages and
// appointments in, groups of rows out. A message holds ids only (AD-13, SEC-17), so the words of each
// message are made here from the appointment, never stored.
import type { components } from "../../../api/contract/schema";
import type { IconName } from "../../components/Icon";
import { formatDay, formatTime } from "../../format/format";

export type OutboxMessage = components["schemas"]["OutboxMessage"];
export type Appointment = components["schemas"]["Appointment"];

/** The screen's three words for a message (D-0001-51: the store says `pending`, the screen "Scheduled"). */
export type MessageState = "scheduled" | "sent" | "cancelled";

export const stateWords: Record<
  MessageState,
  { label: string; icon: IconName; badge: "plain" | "confirmed" | "cancelled" }
> = {
  scheduled: { label: "Scheduled", icon: "clock", badge: "plain" },
  sent: { label: "Sent in this demo", icon: "check", badge: "confirmed" },
  cancelled: { label: "Cancelled", icon: "x", badge: "cancelled" },
};

const kindWords: Record<string, { label: string; icon: IconName }> = {
  confirmation: { label: "Confirmation", icon: "mail" },
  reminder_48h: { label: "Reminder, 48 hours before", icon: "clock" },
  reminder_morning: {
    label: "Reminder, morning of the appointment",
    icon: "clock",
  },
  moved: { label: "Moved to a new time", icon: "calendar" },
  cancellation: { label: "Cancelled", icon: "x" },
};

export function kindOf(kind: string): { label: string; icon: IconName } {
  return kindWords[kind] ?? { label: "Message", icon: "mail" };
}

/**
 * "Sent in this demo" is worked out from the due time having passed; nothing leaves the browser
 * (manager.md 9 item 7). A cancelled message stays cancelled whatever its time.
 */
export function stateOf(message: OutboxMessage, now: number): MessageState {
  if (message.status === "cancelled") return "cancelled";
  if (message.status === "sent") return "sent";
  return Date.parse(message.dueAt) <= now ? "sent" : "scheduled";
}

/** The first word of the name: the only part of a person a message row shows (SEC-17). */
export function firstNameOf(name: string | undefined): string {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first : "the customer";
}

export interface MessageLink {
  label: string;
  href: string;
}

export interface MessageView {
  id: string;
  kind: string;
  kindLabel: string;
  icon: IconName;
  state: MessageState;
  dueAt: number;
  /** "Sent Wed 28 Oct, 10:38", "Due Sat 31 Oct, 09:00", "Was due Fri 30 Oct, 08:00". */
  when: string;
  /** "Wed 28 Oct, 10:38" for the pane's When. */
  dueText: string;
  firstName: string;
  /** "For Fri 30 Oct, 09:15", "For the old time, Fri 30 Oct, 09:15", "To Mon 2 Nov, 09:00". */
  note: string | null;
  /** Only for a cancelled message: why it will not be sent. */
  notSent: string | null;
  /** The message text, one paragraph per line, then its links. */
  lines: string[];
  links: MessageLink[];
}

export interface GroupView {
  appointmentId: string;
  /** "Full service · Marta · Mon 2 Nov, 09:00" */
  heading: string;
  /** "Moved from Fri 30 Oct, 09:15. In the order the messages were made." */
  subLine: string;
  /** "Full service, Marta, Mon 2 Nov, 09:00", for the one-appointment banner. */
  summary: string;
  /** "Full service on Mon 2 Nov, 09:00", for the pane's About. */
  about: string;
  /** The time of the newest event in the group: groups are listed newest first. */
  latest: number;
  messages: MessageView[];
}

export interface ViewContext {
  zone: string;
  now: number;
  dealershipName: string;
  /** The page's origin. A link that points anywhere else is left out, never shown (SEC-11). */
  origin: string;
}

const EVENT_KINDS = ["confirmation", "moved"];
const REMINDER_KINDS = ["reminder_48h", "reminder_morning"];

const byDue = (a: OutboxMessage, b: OutboxMessage) =>
  Date.parse(a.dueAt) - Date.parse(b.dueAt) || a.id.localeCompare(b.id);

/** The order the messages were made in (D-0001-79). */
const byMade = (a: OutboxMessage, b: OutboxMessage) =>
  Date.parse(a.createdAt) - Date.parse(b.createdAt) || byDue(a, b);

const startOf = (m: OutboxMessage) => Date.parse(m.forStart);

const dayTime = (at: number, zone: string, now: number) =>
  `${formatDay(at, zone, now)}, ${formatTime(at, zone)}`;

const transportWords: Record<string, string> = {
  wait: "You are waiting on site.",
  drop_off: "You are dropping the car off.",
  courtesy_car: "A courtesy car is ready for you.",
};

/** Only an address on the app's own origin is a link (SEC-11.AC-4, SEC-17.AC-2). */
function ownLinks(m: OutboxMessage, origin: string): MessageLink[] {
  const links = [
    { label: "Change the time", href: m.links.reschedule },
    { label: "Cancel", href: m.links.cancel },
  ];
  return links.filter((l) => {
    try {
      return new URL(l.href).origin === origin;
    } catch {
      return false;
    }
  });
}

/** The words the customer would get (the template; Q-0001-216). Text only: React shows it as text. */
function textOf(
  m: OutboxMessage,
  a: Appointment,
  previous: number | null,
  ctx: ViewContext,
): string[] {
  const { zone, now, dealershipName } = ctx;
  const first = firstNameOf(a.display.customerName);
  const service = a.display.serviceTypeName;
  const what = `your ${service} at ${dealershipName}`;
  const length = Date.parse(a.end) - Date.parse(a.start);
  const start = startOf(m);
  const span = `${dayTime(start, zone, now)} to ${formatTime(start + length, zone)}`;
  switch (m.kind) {
    case "confirmation":
      return [
        `Hi ${first},`,
        `Your ${service} at ${dealershipName} is booked for ${span}. ${transportWords[a.transport] ?? ""}`.trim(),
      ];
    case "reminder_48h":
      return [
        `Hi ${first},`,
        `A reminder: ${what} is on ${formatDay(start, zone, now)} at ${formatTime(start, zone)}.`,
      ];
    case "reminder_morning":
      return [
        `Good morning ${first},`,
        `Your ${service} at ${dealershipName} is today at ${formatTime(start, zone)}.`,
      ];
    case "moved":
      return [
        `Hi ${first},`,
        `We have moved ${what} to ${span}.${previous === null ? "" : ` It was ${dayTime(previous, zone, now)}.`}`,
      ];
    case "cancellation":
      return [
        `Hi ${first},`,
        `Your ${service} at ${dealershipName} on ${dayTime(start, zone, now)} has been cancelled.`,
      ];
    default:
      return [`Hi ${first},`];
  }
}

/**
 * One group per appointment, newest activity first; inside a group the messages in the order they were
 * made (`createdAt`): each booking or move, then the reminders made with it (same `createdAt` and
 * `forStart`), and the cancellation last. `forStart` is the start each message was made for, so the old
 * time of a move is read, not worked out (D-0001-79).
 */
export function buildGroups(
  messages: readonly OutboxMessage[],
  appointments: ReadonlyMap<string, Appointment>,
  ctx: ViewContext,
): GroupView[] {
  const { zone, now } = ctx;
  const byAppointment = new Map<string, OutboxMessage[]>();
  for (const m of messages) {
    const list = byAppointment.get(m.appointmentId) ?? [];
    list.push(m);
    byAppointment.set(m.appointmentId, list);
  }
  const groups: GroupView[] = [];
  for (const [appointmentId, list] of byAppointment) {
    const a = appointments.get(appointmentId);
    if (!a) continue;
    const firstName = firstNameOf(a.display.customerName);
    const events = list
      .filter((m) => EVENT_KINDS.includes(m.kind))
      .sort(byMade);
    const cancellations = list
      .filter((m) => m.kind === "cancellation")
      .sort(byMade);
    const reminders = list.filter((m) => REMINDER_KINDS.includes(m.kind));
    const sameMaking = (event: OutboxMessage, m: OutboxMessage) =>
      m.createdAt === event.createdAt && m.forStart === event.forStart;
    // A reminder with no booking or move beside it is listed after them.
    const others = [
      ...reminders.filter((r) => !events.some((e) => sameMaking(e, r))),
      ...list.filter(
        (m) =>
          !EVENT_KINDS.includes(m.kind) &&
          m.kind !== "cancellation" &&
          !REMINDER_KINDS.includes(m.kind),
      ),
    ];
    const cancelled = a.status === "cancelled";
    const last = events.length - 1;
    const moved = last > 0 && events[last]!.kind === "moved";
    const previousStart = moved ? startOf(events[last - 1]!) : null;

    const view = (
      m: OutboxMessage,
      note: string | null,
      notSent: string | null,
      previous: number | null = null,
    ): MessageView => {
      const due = Date.parse(m.dueAt);
      const state = stateOf(m, now);
      const k = kindOf(m.kind);
      const dueText = dayTime(due, zone, now);
      return {
        id: m.id,
        kind: m.kind,
        kindLabel: k.label,
        icon: k.icon,
        state,
        dueAt: due,
        when:
          state === "sent"
            ? `Sent ${dueText}`
            : state === "scheduled"
              ? `Due ${dueText}`
              : `Was due ${dueText}`,
        dueText,
        firstName,
        note,
        notSent: state === "cancelled" ? notSent : null,
        lines: textOf(m, a, previous, ctx),
        links: m.kind === "cancellation" ? [] : ownLinks(m, ctx.origin),
      };
    };

    const ordered: MessageView[] = [];
    events.forEach((event, i) => {
      const words = dayTime(startOf(event), zone, now);
      ordered.push(
        view(
          event,
          `${event.kind === "moved" ? "To" : "For"} ${words}`,
          null,
          i > 0 ? startOf(events[i - 1]!) : null,
        ),
      );
      const replacedBy =
        i < last ? dayTime(startOf(events[i + 1]!), zone, now) : null;
      for (const r of reminders
        .filter((r) => sameMaking(event, r))
        .sort(byDue)) {
        ordered.push(
          view(
            r,
            i < last ? `For the old time, ${words}` : `For ${words}`,
            i < last
              ? `This message will not be sent. The appointment moved to ${replacedBy}, so this reminder was replaced by a new one.`
              : "This message will not be sent. The appointment was cancelled.",
          ),
        );
      }
    });
    for (const m of [...others.sort(byDue), ...cancellations]) {
      ordered.push(
        view(
          m,
          `For ${dayTime(startOf(m), zone, now)}`,
          "This message will not be sent. The appointment was cancelled.",
        ),
      );
    }

    const startText = dayTime(Date.parse(a.start), zone, now);
    const lead = cancelled
      ? a.cancelledAt
        ? `Cancelled on ${dayTime(Date.parse(a.cancelledAt), zone, now)}. `
        : "Cancelled. "
      : previousStart !== null
        ? `Moved from ${dayTime(previousStart, zone, now)}. `
        : "";
    groups.push({
      appointmentId,
      heading: `${a.display.serviceTypeName} · ${firstName} · ${startText}`,
      subLine: `${lead}In the order the messages were made.`,
      summary: `${a.display.serviceTypeName}, ${firstName}, ${startText}`,
      about: `${a.display.serviceTypeName} on ${startText}`,
      latest: Math.max(
        ...list
          .filter((m) => !REMINDER_KINDS.includes(m.kind))
          .map((m) => Date.parse(m.createdAt)),
        0,
      ),
      messages: ordered,
    });
  }
  return groups.sort(
    (x, y) =>
      y.latest - x.latest || x.appointmentId.localeCompare(y.appointmentId),
  );
}

export type Filter = "all" | MessageState;

export function countsOf(groups: readonly GroupView[]): Record<Filter, number> {
  const all = groups.flatMap((g) => g.messages);
  return {
    all: all.length,
    scheduled: all.filter((m) => m.state === "scheduled").length,
    sent: all.filter((m) => m.state === "sent").length,
    cancelled: all.filter((m) => m.state === "cancelled").length,
  };
}

/** The words of `filter-empty` (manager.md 5.5 for Cancelled; the other two follow its pattern). */
export const filterEmptyWords: Record<
  MessageState,
  { title: string; body: string }
> = {
  cancelled: {
    title: "No cancelled messages",
    body: "A reminder is marked cancelled when its appointment is moved or cancelled. None are cancelled at the moment.",
  },
  scheduled: {
    title: "No scheduled messages",
    body: "A message is scheduled while its time is still ahead. None are scheduled at the moment.",
  },
  sent: {
    title: "No messages sent in this demo",
    body: "A message counts as sent in this demo once its time has passed. None have reached their time yet.",
  },
};
