// What the outbox screen shows, worked out from the API's answer (C7, REQ-BOOK-013, AD-9). `npm run test:tz` runs
// this file under UTC and Pacific/Kiritimati too: the words must not change with the machine's zone.
import { describe, expect, it } from "vitest";
import {
  buildGroups,
  countsOf,
  firstNameOf,
  stateOf,
  type Appointment,
  type OutboxMessage,
} from "../../src/ui/features/outbox/outbox-view";

const London = "Europe/London";
const origin = "https://app.test";
const now = Date.parse("2026-10-28T12:00:00Z");
const ctx = { zone: London, now, dealershipName: "Northgate Motors", origin };

function appointment(over: Partial<Appointment> = {}): Appointment {
  return {
    id: "ap-1",
    dealershipId: "d-1",
    timeZone: London,
    customerId: "c-1",
    vehicleId: "v-1",
    serviceTypeId: "s-1",
    technicianId: "t-1",
    serviceBayId: "b-1",
    courtesyCarId: null,
    transport: "drop_off",
    start: "2026-11-02T09:00:00Z",
    end: "2026-11-02T12:00:00Z",
    status: "confirmed",
    flags: [],
    version: 1,
    createdAt: "2026-10-26T14:02:00Z",
    updatedAt: "2026-10-26T14:02:00Z",
    cancelledAt: null,
    display: {
      serviceTypeName: "Full service",
      vehicle: { registration: "AB12 CDE", make: "Ford", model: "Focus" },
      customerName: "Marta Kowalska",
    },
    ...over,
  };
}

let n = 0;
function msg(
  kind: string,
  dueAt: string,
  status: OutboxMessage["status"] = "pending",
  appointmentId = "ap-1",
  made = dueAt,
  forStart = "2026-11-02T09:00:00Z",
): OutboxMessage {
  n += 1;
  return {
    id: `m-${String(100 - n)}`,
    appointmentId,
    dealershipId: "d-1",
    kind,
    dueAt,
    createdAt: made,
    forStart,
    status,
    links: {
      cancel: `${origin}/appointments/${appointmentId}`,
      reschedule: `${origin}/appointments/${appointmentId}/reschedule`,
    },
  };
}

const one = (messages: OutboxMessage[], a = appointment()) =>
  buildGroups(messages, new Map([[a.id, a]]), ctx);

describe("times in the dealership's zone, across a clock change", () => {
  it("a message due at 2026-10-24T10:00:00Z for a London dealership shows 11:00", () => {
    const [group] = one([msg("confirmation", "2026-10-24T10:00:00Z")]);
    expect(group!.messages[0]!.when).toBe("Sent Sat 24 Oct, 11:00");
  });
  it("the morning reminder of Monday 2026-03-30 10:00 (BST) shows 08:00", () => {
    const a = appointment({
      start: "2026-03-30T09:00:00Z",
      end: "2026-03-30T10:00:00Z",
    });
    const [group] = buildGroups(
      [
        msg(
          "reminder_morning",
          "2026-03-30T07:00:00Z",
          "pending",
          "ap-1",
          "2026-03-20T09:00:00Z",
          "2026-03-30T09:00:00Z",
        ),
      ],
      new Map([[a.id, a]]),
      { ...ctx, now: Date.parse("2026-03-20T12:00:00Z") },
    );
    expect(group!.messages[0]!.when).toBe("Due Mon 30 Mar, 08:00");
    expect(group!.heading).toBe("Full service · Marta · Mon 30 Mar, 10:00");
  });
});

describe("states", () => {
  it("pending and ahead is Scheduled, pending and passed is Sent in this demo, cancelled stays Cancelled", () => {
    expect(stateOf(msg("reminder_48h", "2026-10-29T09:00:00Z"), now)).toBe(
      "scheduled",
    );
    expect(stateOf(msg("confirmation", "2026-10-28T11:00:00Z"), now)).toBe(
      "sent",
    );
    expect(
      stateOf(msg("reminder_48h", "2026-10-27T09:00:00Z", "cancelled"), now),
    ).toBe("cancelled");
    expect(
      stateOf(msg("confirmation", "2026-10-30T09:00:00Z", "sent"), now),
    ).toBe("sent");
  });
});

describe("one booking, moved once (the prototype's AP-1042)", () => {
  const a = appointment();
  const oldStart = "2026-10-30T09:15:00Z";
  const booked = "2026-10-26T14:02:00Z";
  const movedAt = "2026-10-28T10:38:00Z";
  const messages = [
    msg("reminder_morning", "2026-11-02T08:00:00Z", "pending", "ap-1", movedAt),
    msg("moved", movedAt),
    msg("confirmation", booked, "pending", "ap-1", booked, oldStart),
    msg("reminder_48h", "2026-10-31T09:00:00Z", "pending", "ap-1", movedAt),
    msg(
      "reminder_morning",
      "2026-10-30T08:00:00Z",
      "cancelled",
      "ap-1",
      booked,
      oldStart,
    ),
    msg(
      "reminder_48h",
      "2026-10-28T09:15:00Z",
      "cancelled",
      "ap-1",
      booked,
      oldStart,
    ),
  ];
  const [group] = one(messages, a);

  it("lists the messages in the order they were made", () => {
    expect(group!.messages.map((m) => m.kindLabel)).toEqual([
      "Confirmation",
      "Reminder, 48 hours before",
      "Reminder, morning of the appointment",
      "Moved to a new time",
      "Reminder, 48 hours before",
      "Reminder, morning of the appointment",
    ]);
  });
  it("names the old time on the group and on the old reminders, and the new one on the move", () => {
    expect(group!.heading).toBe("Full service · Marta · Mon 2 Nov, 09:00");
    expect(group!.subLine).toBe(
      "Moved from Fri 30 Oct, 09:15. In the order the messages were made.",
    );
    expect(group!.messages.map((m) => m.note)).toEqual([
      "For Fri 30 Oct, 09:15",
      "For the old time, Fri 30 Oct, 09:15",
      "For the old time, Fri 30 Oct, 09:15",
      "To Mon 2 Nov, 09:00",
      "For Mon 2 Nov, 09:00",
      "For Mon 2 Nov, 09:00",
    ]);
  });
  it("no reminder for the old time is still Scheduled; the confirmation keeps its state (D-0001-50 B)", () => {
    const old = group!.messages.filter((m) =>
      m.note?.startsWith("For the old time"),
    );
    expect(old.map((m) => m.state)).toEqual(["cancelled", "cancelled"]);
    expect(group!.messages[0]!.state).toBe("sent");
    expect(old[0]!.notSent).toBe(
      "This message will not be sent. The appointment moved to Mon 2 Nov, 09:00, so this reminder was replaced by a new one.",
    );
  });
  it("writes the message text from the appointment, as text, with the API's own-origin links only", () => {
    const moved = group!.messages[3]!;
    expect(moved.lines).toEqual([
      "Hi Marta,",
      "We have moved your Full service at Northgate Motors to Mon 2 Nov, 09:00 to 12:00. It was Fri 30 Oct, 09:15.",
    ]);
    expect(moved.links).toEqual([
      {
        label: "Change the time",
        href: `${origin}/appointments/ap-1/reschedule`,
      },
      { label: "Cancel", href: `${origin}/appointments/ap-1` },
    ]);
    expect(group!.messages[0]!.lines[1]).toBe(
      "Your Full service at Northgate Motors is booked for Fri 30 Oct, 09:15 to 12:15. You are dropping the car off.",
    );
  });
  it("counts each state", () => {
    expect(countsOf([group!])).toEqual({
      all: 6,
      scheduled: 2,
      sent: 2,
      cancelled: 2,
    });
  });
});

describe("a booking moved twice (D-0001-79)", () => {
  const first = "2026-10-30T09:15:00Z";
  const second = "2026-11-02T09:00:00Z";
  const third = "2026-11-04T11:00:00Z";
  const made1 = "2026-10-26T14:02:00Z";
  const made2 = "2026-10-27T10:00:00Z";
  const made3 = "2026-10-28T10:38:00Z";
  const a = appointment({ start: third, end: "2026-11-04T14:00:00Z" });
  // Sent in no useful order; the old morning reminders are for 09:00 and 09:15, 08:00 shows only the time of the start.
  const messages = [
    msg(
      "reminder_48h",
      "2026-11-02T11:00:00Z",
      "pending",
      "ap-1",
      made3,
      third,
    ),
    msg("moved", made3, "pending", "ap-1", made3, third),
    msg(
      "reminder_morning",
      "2026-11-04T08:00:00Z",
      "pending",
      "ap-1",
      made3,
      third,
    ),
    msg(
      "reminder_morning",
      "2026-11-02T08:00:00Z",
      "cancelled",
      "ap-1",
      made2,
      second,
    ),
    msg("moved", made2, "pending", "ap-1", made2, second),
    msg(
      "reminder_48h",
      "2026-10-31T09:00:00Z",
      "cancelled",
      "ap-1",
      made2,
      second,
    ),
    msg(
      "reminder_morning",
      "2026-10-30T08:00:00Z",
      "cancelled",
      "ap-1",
      made1,
      first,
    ),
    msg("confirmation", made1, "pending", "ap-1", made1, first),
    msg(
      "reminder_48h",
      "2026-10-28T09:15:00Z",
      "cancelled",
      "ap-1",
      made1,
      first,
    ),
  ];
  const [group] = one(messages, a);

  it("lists each move with the reminders it made, in the order they were made", () => {
    expect(group!.messages.map((m) => m.kindLabel)).toEqual([
      "Confirmation",
      "Reminder, 48 hours before",
      "Reminder, morning of the appointment",
      "Moved to a new time",
      "Reminder, 48 hours before",
      "Reminder, morning of the appointment",
      "Moved to a new time",
      "Reminder, 48 hours before",
      "Reminder, morning of the appointment",
    ]);
  });
  it("names the old time after each move, exactly, even for a morning reminder", () => {
    expect(group!.subLine).toBe(
      "Moved from Mon 2 Nov, 09:00. In the order the messages were made.",
    );
    expect(group!.messages.map((m) => m.note)).toEqual([
      "For Fri 30 Oct, 09:15",
      "For the old time, Fri 30 Oct, 09:15",
      "For the old time, Fri 30 Oct, 09:15",
      "To Mon 2 Nov, 09:00",
      "For the old time, Mon 2 Nov, 09:00",
      "For the old time, Mon 2 Nov, 09:00",
      "To Wed 4 Nov, 11:00",
      "For Wed 4 Nov, 11:00",
      "For Wed 4 Nov, 11:00",
    ]);
    expect(group!.messages[6]!.lines[1]).toBe(
      "We have moved your Full service at Northgate Motors to Wed 4 Nov, 11:00 to 14:00. It was Mon 2 Nov, 09:00.",
    );
    expect(group!.messages[2]!.lines[1]).toBe(
      "Your Full service at Northgate Motors is today at 09:15.",
    );
  });
});

describe("a cancelled booking", () => {
  const a = appointment({
    id: "ap-2",
    start: "2026-10-29T14:00:00Z",
    end: "2026-10-29T15:00:00Z",
    status: "cancelled",
    cancelledAt: "2026-10-28T10:15:00Z",
    display: {
      serviceTypeName: "Inspection",
      vehicle: { registration: "X", make: "Y", model: "Z" },
      customerName: "Noor",
    },
  });
  const start = "2026-10-29T14:00:00Z";
  const messages = [
    msg(
      "cancellation",
      "2026-10-28T10:15:00Z",
      "pending",
      "ap-2",
      undefined,
      start,
    ),
    msg(
      "reminder_morning",
      "2026-10-29T08:00:00Z",
      "cancelled",
      "ap-2",
      "2026-10-27T16:30:00Z",
      start,
    ),
    msg(
      "confirmation",
      "2026-10-27T16:30:00Z",
      "pending",
      "ap-2",
      undefined,
      start,
    ),
  ];
  const [group] = buildGroups(messages, new Map([[a.id, a]]), ctx);

  it("keeps the cancelled reminder in the list, lists the Cancelled message last, and says why it is not sent", () => {
    expect(group!.subLine).toBe(
      "Cancelled on Wed 28 Oct, 10:15. In the order the messages were made.",
    );
    expect(group!.messages.map((m) => [m.kindLabel, m.state])).toEqual([
      ["Confirmation", "sent"],
      ["Reminder, morning of the appointment", "cancelled"],
      ["Cancelled", "sent"],
    ]);
    expect(group!.messages[1]!.notSent).toBe(
      "This message will not be sent. The appointment was cancelled.",
    );
    expect(group!.messages[2]!.links).toEqual([]);
    expect(group!.messages[2]!.lines[1]).toBe(
      "Your Inspection at Northgate Motors on Thu 29 Oct, 14:00 has been cancelled.",
    );
  });
});

describe("safety and real data", () => {
  it("a link to another origin, or one that is not an address, is never a link (SEC-11, SEC-17.AC-2)", () => {
    const m = msg("confirmation", "2026-10-26T14:02:00Z");
    m.links = {
      cancel: "https://evil.test/appointments/ap-1",
      reschedule: "javascript:alert(1)",
    };
    const [group] = one([m]);
    expect(group!.messages[0]!.links).toEqual([]);
  });
  it("shows the first name only, and the newest group first", () => {
    expect(firstNameOf("  Bartholomew Wojciechowski ")).toBe("Bartholomew");
    expect(firstNameOf(undefined)).toBe("the customer");
    const older = appointment({ id: "ap-old" });
    const newer = appointment({ id: "ap-new" });
    const groups = buildGroups(
      [
        msg("confirmation", "2026-10-20T09:00:00Z", "pending", "ap-old"),
        msg("confirmation", "2026-10-27T09:00:00Z", "pending", "ap-new"),
      ],
      new Map([
        [older.id, older],
        [newer.id, newer],
      ]),
      ctx,
    );
    expect(groups.map((g) => g.appointmentId)).toEqual(["ap-new", "ap-old"]);
  });
  it("leaves out a message whose appointment did not come back", () => {
    expect(
      buildGroups(
        [msg("confirmation", "2026-10-27T09:00:00Z")],
        new Map(),
        ctx,
      ),
    ).toEqual([]);
  });
});
