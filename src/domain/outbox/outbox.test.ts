import { describe, expect, it } from "vitest";
import type { Appointment } from "../model";
import {
  messageLinks,
  messagesForBooking,
  messagesForCancel,
  messagesForMove,
  reminderTimes,
} from "./index";

const utc = (text: string) => Date.parse(text);

const appointment = (start: number, timeZone: string, version = 1) =>
  ({ id: "a1", start, timeZone, version }) as Appointment;

describe("reminderTimes", () => {
  it("Q-0001-21 A: 48 hours before, and 08:00 on the day in the dealership's zone", () => {
    expect(reminderTimes(utc("2026-11-05T10:00:00Z"), "Europe/London")).toEqual(
      {
        reminder48h: utc("2026-11-03T10:00:00Z"),
        morning: utc("2026-11-05T08:00:00Z"),
      },
    );
  });

  it("D-0001-22 d: a start at 07:30, or exactly 08:00, is reminded 2 hours before", () => {
    expect(
      reminderTimes(utc("2026-11-05T07:30:00Z"), "Europe/London").morning,
    ).toBe(utc("2026-11-05T05:30:00Z"));
    expect(
      reminderTimes(utc("2026-11-05T08:00:00Z"), "Europe/London").morning,
    ).toBe(utc("2026-11-05T06:00:00Z"));
    expect(
      reminderTimes(utc("2026-11-05T08:01:00Z"), "Europe/London").morning,
    ).toBe(utc("2026-11-05T08:00:00Z"));
  });

  it("REQ-BOOK-013.AC-2, DST: Monday 2026-10-26 10:00 London, after the clocks went back, has its 48-hour reminder at 11:00 London time and its morning reminder at 08:00 London time", () => {
    const times = reminderTimes(utc("2026-10-26T10:00:00Z"), "Europe/London");
    expect(times.reminder48h).toBe(utc("2026-10-24T10:00:00Z"));
    expect(times.morning).toBe(utc("2026-10-26T08:00:00Z"));
  });

  it("REQ-BOOK-013.AC-2, DST: Monday 2026-03-30 10:00 London, after the clocks went forward, has its morning reminder at 08:00 London time", () => {
    // 10:00 BST is 09:00Z; 08:00 BST is 07:00Z.
    const times = reminderTimes(utc("2026-03-30T09:00:00Z"), "Europe/London");
    expect(times.morning).toBe(utc("2026-03-30T07:00:00Z"));
  });

  it("REQ-BOOK-013.AC-2, S4: an Asia/Ho_Chi_Minh appointment gets its reminders in that zone, whatever the browser's zone", () => {
    // 10:00 at UTC+7 is 03:00Z; 08:00 at UTC+7 is 01:00Z.
    const times = reminderTimes(
      utc("2026-11-05T03:00:00Z"),
      "Asia/Ho_Chi_Minh",
    );
    expect(times.morning).toBe(utc("2026-11-05T01:00:00Z"));
    expect(times.reminder48h).toBe(utc("2026-11-03T03:00:00Z"));
  });
});

describe("messages for an event", () => {
  const start = utc("2026-11-05T10:00:00Z");
  const booked = utc("2026-11-02T09:00:00Z");

  it("REQ-BOOK-013.AC-1: a booking makes a confirmation and the reminders ahead, with keys appointmentId:kind:version", () => {
    expect(
      messagesForBooking(appointment(start, "Europe/London"), booked),
    ).toEqual([
      {
        appointmentId: "a1",
        kind: "confirmation",
        dedupeKey: "a1:confirmation:1",
        dueAt: booked,
        createdAt: booked,
        forStart: start,
      },
      {
        appointmentId: "a1",
        kind: "reminder_48h",
        dedupeKey: "a1:reminder_48h:1",
        dueAt: utc("2026-11-03T10:00:00Z"),
        createdAt: booked,
        forStart: start,
      },
      {
        appointmentId: "a1",
        kind: "reminder_morning",
        dedupeKey: "a1:reminder_morning:1",
        dueAt: utc("2026-11-05T08:00:00Z"),
        createdAt: booked,
        forStart: start,
      },
    ]);
  });

  it("Q-0001-21 A: reminders whose time has passed are skipped", () => {
    const kinds = (now: string, at: string) =>
      messagesForBooking(appointment(utc(at), "Europe/London"), utc(now)).map(
        (m) => m.kind,
      );
    expect(kinds("2026-11-02T09:00:00Z", "2026-11-03T10:00:00Z")).toEqual([
      "confirmation",
      "reminder_morning",
    ]);
    expect(kinds("2026-11-02T09:00:00Z", "2026-11-02T15:00:00Z")).toEqual([
      "confirmation",
    ]);
    // A reminder due exactly now has passed.
    expect(kinds("2026-11-03T08:00:00Z", "2026-11-03T10:00:00Z")).toEqual([
      "confirmation",
    ]);
  });

  it("D-0001-17: a move makes a moved message and new reminders under the new version", () => {
    const keys = messagesForMove(
      appointment(start, "Europe/London", 2),
      booked,
    ).map((m) => m.dedupeKey);
    expect(keys).toEqual([
      "a1:moved:2",
      "a1:reminder_48h:2",
      "a1:reminder_morning:2",
    ]);
  });

  it("D-0001-79: a message says when it was made and which start it was made for", () => {
    const moved = messagesForMove(
      appointment(start, "Europe/London", 2),
      booked,
    );
    expect(moved.map((m) => [m.createdAt, m.forStart])).toEqual([
      [booked, start],
      [booked, start],
      [booked, start],
    ]);
  });

  it("REQ-BOOK-013.AC-3: a cancel makes one cancellation message", () => {
    expect(
      messagesForCancel(appointment(start, "Europe/London", 2), booked),
    ).toEqual([
      {
        appointmentId: "a1",
        kind: "cancellation",
        dedupeKey: "a1:cancellation:2",
        dueAt: booked,
        createdAt: booked,
        forStart: start,
      },
    ]);
  });

  it("SEC-17.AC-2: the links are fixed paths plus the appointment id", () => {
    expect(messageLinks("a1")).toEqual({
      cancel: "/appointments/a1/cancel",
      reschedule: "/appointments/a1/reschedule",
    });
  });
});
