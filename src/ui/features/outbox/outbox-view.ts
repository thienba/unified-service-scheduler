// What the outbox screen shows (manager.md 4.5 and 5.5, REQ-BOOK-013). Pure: the API's messages and
// appointments in, groups of rows out. A message holds ids only (AD-13, SEC-17), so the words of each
// message are made here from the appointment, never stored.
import type { components } from "../../../api/contract/schema";
import type { IconName } from "../../components/Icon";
import { formatDay, formatTime, localDateIn } from "../../format/format";

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

/** A start the screen knows exactly, by its date only, or not at all (see `buildGroups`). */
export type KnownStart = Start | null;
interface Start {
  at: number;
  exact: boolean;
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

const HOUR_MS = 3_600_000;
const EVENT_KINDS = ["confirmation", "moved"];
const REMINDER_KINDS = ["reminder_48h", "reminder_morning"];

const byDue = (a: OutboxMessage, b: OutboxMessage) =>
  Date.parse(a.dueAt) - Date.parse(b.dueAt) || a.id.localeCompare(b.id);

/**
 * The start a reminder was made for. The API sends the due time only (Q-0001-217): 48 hours before is
 * exact; the morning reminder is 08:00 on the day, or 2 hours before a start at or before 08:00, so
 * from 08:00 only the date is known.
 */
function startOfReminder(m: OutboxMessage, zone: string): Start {
  const due = Date.parse(m.dueAt);
  if (m.kind === "reminder_48h") return { at: due + 48 * HOUR_MS, exact: true };
  if (formatTime(due, zone) === "08:00") return { at: due, exact: false };
  return { at: due + 2 * HOUR_MS, exact: true };
}

interface ReminderSet {
  date: string;
  start: Start;
  reminders: OutboxMessage[];
}

/** Cancelled reminders made together share their appointment's day: one set per earlier time. */
function setsOf(cancelled: OutboxMessage[], zone: string): ReminderSet[] {
  const sets: ReminderSet[] = [];
  for (const m of [...cancelled].sort(byDue)) {
    const start = startOfReminder(m, zone);
    const date = localDateIn(start.at, zone);
    const set = sets.find(
      (s) => s.date === date && !s.reminders.some((r) => r.kind === m.kind),
    );
    if (set) {
      set.reminders.push(m);
      if (start.exact) set.start = start;
    } else {
      sets.push({ date, start, reminders: [m] });
    }
  }
  return sets;
}

export function startWords(
  start: KnownStart,
  zone: string,
  now: number,
): string | null {
  if (!start) return null;
  const day = formatDay(start.at, zone, now);
  return start.exact ? `${day}, ${formatTime(start.at, zone)}` : day;
}

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
  start: KnownStart,
  previous: KnownStart,
  ctx: ViewContext,
): string[] {
  const { zone, now, dealershipName } = ctx;
  const first = firstNameOf(a.display.customerName);
  const service = a.display.serviceTypeName;
  const what = `your ${service} at ${dealershipName}`;
  const length = Date.parse(a.end) - Date.parse(a.start);
  const span = (s: KnownStart) =>
    s?.exact
      ? `${formatDay(s.at, zone, now)}, ${formatTime(s.at, zone)} to ${formatTime(s.at + length, zone)}`
      : startWords(s, zone, now);
  const time = start?.exact ? formatTime(start.at, zone) : null;
  switch (m.kind) {
    case "confirmation": {
      const when = span(start);
      return [
        `Hi ${first},`,
        `Your ${service} at ${dealershipName} is booked${when ? ` for ${when}` : ""}. ${transportWords[a.transport] ?? ""}`.trim(),
      ];
    }
    case "reminder_48h":
      return [
        `Hi ${first},`,
        `A reminder: ${what} is on ${start ? formatDay(start.at, zone, now) : "its day"}${time ? ` at ${time}` : ""}.`,
      ];
    case "reminder_morning":
      return [
        `Good morning ${first},`,
        `Your ${service} at ${dealershipName} is today${time ? ` at ${time}` : ""}.`,
      ];
    case "moved": {
      const was = startWords(previous, zone, now);
      return [
        `Hi ${first},`,
        `We have moved ${what} to ${span(start) ?? "a new time"}.${was ? ` It was ${was}.` : ""}`,
      ];
    }
    case "cancellation": {
      const when = startWords(start, zone, now);
      return [
        `Hi ${first},`,
        `Your ${service} at ${dealershipName}${when ? ` on ${when}` : ""} has been cancelled.`,
      ];
    }
    default:
      return [`Hi ${first},`];
  }
}

/**
 * One group per appointment, newest activity first; inside a group the messages in the order they were
 * made: each booking or move, then the reminders it made, and the cancellation last. The API sends no
 * creation time and no "for which start" (Q-0001-217), so both are worked out: a confirmation, a move
 * and a cancellation are due when they are made; reminders still waiting belong to the newest booking
 * or move; cancelled ones to the earlier ones (or to the newest when the appointment was cancelled).
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
    const current: KnownStart = { at: Date.parse(a.start), exact: true };
    const events = list.filter((m) => EVENT_KINDS.includes(m.kind)).sort(byDue);
    const cancellations = list
      .filter((m) => m.kind === "cancellation")
      .sort(byDue);
    const reminders = list.filter((m) => REMINDER_KINDS.includes(m.kind));
    const others = list.filter(
      (m) =>
        !EVENT_KINDS.includes(m.kind) &&
        m.kind !== "cancellation" &&
        !REMINDER_KINDS.includes(m.kind),
    );
    const cancelled = a.status === "cancelled";

    // Which event made which reminders, and the start each event was for.
    const made: OutboxMessage[][] = events.map(() => []);
    const starts: KnownStart[] = events.map(() => null);
    if (events.length > 0) starts[events.length - 1] = current;
    const last = events.length - 1;
    const earlier = cancelled ? events.length : events.length - 1;
    const sets = setsOf(
      reminders.filter((r) => r.status === "cancelled"),
      zone,
    );
    sets.forEach((set, i) => {
      const at = Math.min(i, Math.max(earlier - 1, 0));
      made[at]?.push(...set.reminders);
      if (at < last) starts[at] = set.start;
    });
    if (events.length === 0) {
      others.push(...reminders);
    } else {
      made[last]!.push(...reminders.filter((r) => r.status !== "cancelled"));
    }
    const moved = last > 0 && events[last]!.kind === "moved";
    const previousStart = moved ? (starts[last - 1] ?? null) : null;

    const view = (
      m: OutboxMessage,
      start: KnownStart,
      note: string | null,
      notSent: string | null,
      previous: KnownStart = null,
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
        lines: textOf(m, a, start, previous, ctx),
        links: m.kind === "cancellation" ? [] : ownLinks(m, ctx.origin),
      };
    };

    const ordered: MessageView[] = [];
    events.forEach((event, i) => {
      const start = starts[i] ?? null;
      const words = startWords(start, zone, now);
      ordered.push(
        view(
          event,
          start,
          words ? `${event.kind === "moved" ? "To" : "For"} ${words}` : null,
          null,
          i > 0 ? (starts[i - 1] ?? null) : null,
        ),
      );
      const replacedBy =
        i < last ? startWords(starts[i + 1] ?? null, zone, now) : null;
      for (const r of made[i]!.sort(byDue)) {
        const own = startOfReminder(r, zone);
        const forStart = start ?? own;
        const forWords = startWords(forStart, zone, now);
        ordered.push(
          view(
            r,
            forStart,
            forWords
              ? i < last
                ? `For the old time, ${forWords}`
                : `For ${forWords}`
              : null,
            i < last
              ? `This message will not be sent. The appointment moved to ${replacedBy ?? "a new time"}, so this reminder was replaced by a new one.`
              : "This message will not be sent. The appointment was cancelled.",
          ),
        );
      }
    });
    for (const m of [...others.sort(byDue), ...cancellations]) {
      const words = startWords(current, zone, now);
      ordered.push(
        view(
          m,
          current,
          words ? `For ${words}` : null,
          "This message will not be sent. The appointment was cancelled.",
        ),
      );
    }

    const startText = dayTime(Date.parse(a.start), zone, now);
    const previousWords = startWords(previousStart, zone, now);
    const lead = cancelled
      ? a.cancelledAt
        ? `Cancelled on ${dayTime(Date.parse(a.cancelledAt), zone, now)}. `
        : "Cancelled. "
      : previousWords
        ? `Moved from ${previousWords}. `
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
          .map((m) => Date.parse(m.dueAt)),
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
