// The manager's adjust words and parts (C6; manager.md 5.1, 5.2; design.md 8.18, 8.26).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChangeSummary } from "../../components/ChangeSummary";
import { SuggestionFillGroup } from "../../components/SuggestionFillGroup";
import type { Dealership } from "../../data/api-problem";
import { FormSummary } from "../../forms/FormSummary";
import { AppointmentReadSide } from "../appointment/AppointmentReadSide";
import { ManagerAppointmentView } from "../appointment/ManagerAppointmentView";
import { DetailPanel } from "../schedule/DetailPanel";
import type { ScheduleDay } from "../schedule/schedule-model";
import {
  afterCancelText,
  groupByDay,
  ledeText,
  rowName,
  stripTitle,
} from "../flagged/flagged-model";
import {
  changeOf,
  clashText,
  editRows,
  fieldProblems,
  flaggedStatus,
  reasonText,
  savedRows,
  savedText,
  technicianOption,
  valuesOf,
  type Appointment,
} from "./adjust-model";

afterEach(cleanup);

const NOW = Date.parse("2026-10-28T08:00:00Z");

const dealership = {
  id: "d1",
  name: "Test Motors",
  timeZone: "Europe/London",
  weeklyHours: {},
  dateOverrides: {},
  policies: {
    leadTimeMinutes: 120,
    horizonDays: 30,
    breakMinutes: 15,
    gridMinutes: 15,
  },
} as unknown as Dealership;

function appointment(extra: Partial<Appointment> = {}): Appointment {
  return {
    id: "a1",
    dealershipId: "d1",
    timeZone: "Europe/London",
    customerId: "c1",
    vehicleId: "v1",
    serviceTypeId: "service-full",
    technicianId: "t1",
    serviceBayId: "b1",
    courtesyCarId: null,
    transport: "drop_off",
    start: "2026-10-30T09:15:00Z",
    end: "2026-10-30T12:15:00Z",
    status: "confirmed",
    flags: [],
    version: 1,
    createdAt: "2026-10-26T14:02:00Z",
    updatedAt: "2026-10-26T14:02:00Z",
    cancelledAt: null,
    display: {
      serviceTypeName: "Full service",
      vehicle: { make: "Vauxhall", model: "Corsa", registration: "CD34 FGH" },
      technicianName: "Maya Okafor",
      serviceBayName: "Bay 1",
      customerName: "Marta Kowalska",
    },
    ...extra,
  };
}

const flagged = (): Appointment =>
  appointment({
    flags: [
      {
        kind: "outside_shift",
        since: "2026-10-28T07:00:00Z",
        reason: "Ends after Maya's shift, 12:00",
      },
      {
        kind: "outside_opening_hours",
        since: "2026-10-28T07:30:00Z",
        reason: "Ends after closing time, 12:00",
      },
    ],
  });

describe("adjust words (manager.md 5.1)", () => {
  it("starts from the appointment's own date and time, with Same as now", () => {
    expect(valuesOf(appointment())).toEqual({
      date: "2026-10-30",
      time: "09:15",
      technicianId: "",
      serviceBayId: "",
    });
  });

  it("finds a past date and a start off the quarter hour, and names each field (validation)", () => {
    const problems = fieldProblems(
      { date: "2026-10-27", time: "09:10", technicianId: "", serviceBayId: "" },
      "2026-10-28",
      15,
    );
    expect(problems.map((p) => p.message)).toEqual([
      "That date has passed. Choose today or a later date.",
      "Use a time on the quarter hour, for example 09:15.",
    ]);
    expect(
      fieldProblems(
        { date: "", time: "", technicianId: "", serviceBayId: "" },
        "2026-10-28",
        15,
      ).map((p) => p.name),
    ).toEqual(["date", "time"]);
    expect(fieldProblems(valuesOf(appointment()), "2026-10-28", 15)).toEqual(
      [],
    );
  });

  it("sends only what differs, and nothing when nothing does (D-0001-48 g)", () => {
    const a = appointment();
    expect(changeOf(a, valuesOf(a), a.start)).toBeNull();
    expect(changeOf(a, valuesOf(a), "2026-11-02T09:00:00Z")).toEqual({
      start: "2026-11-02T09:00:00Z",
    });
    expect(
      changeOf(a, { ...valuesOf(a), technicianId: "t2" }, a.start),
    ).toEqual({ technicianId: "t2" });
  });

  it("writes a clash in words, never a code, with the notice and horizon in numbers (D-0001-45 A)", () => {
    const a = appointment();
    expect(clashText(["TECHNICIAN_BUSY"], a, dealership)).toBe(
      "Every technician who can do this job is busy then. The appointment is still at 09:15 with Maya Okafor in bay 1.",
    );
    expect(reasonText("TOO_SOON", dealership)).toBe(
      "bookings need at least 2 hours notice",
    );
    expect(reasonText("BEYOND_HORIZON", dealership)).toBe(
      "bookings open up to 30 days ahead",
    );
    expect(clashText(["BAY_BUSY", "COURTESY_CAR_BUSY"], a, dealership)).toMatch(
      /^Every service bay is in use then and no courtesy car is free then\./,
    );
  });

  it("says who was picked only when the system chose someone else (D-0001-33 A)", () => {
    const before = appointment();
    const after = appointment({
      start: "2026-11-02T09:00:00Z",
      end: "2026-11-02T12:00:00Z",
      technicianId: "t2",
      serviceBayId: "b3",
      display: {
        ...before.display,
        technicianName: "Tomas Havel",
        serviceBayName: "Bay 3",
      },
    });
    expect(savedText(before, after, { technicianId: "t2" }, NOW)).toBe(
      "The appointment is now Mon 2 Nov, 09:00 to 12:00 with Tomas Havel in bay 3. Maya Okafor was busy then, so Tomas Havel was picked. The customer has a new message in the outbox.",
    );
    expect(savedText(before, after, {}, NOW)).not.toMatch(/was busy then/);
    expect(
      savedText(before, { ...before, serviceBayId: "b3" }, {}, NOW),
    ).not.toMatch(/outbox/);
    expect(savedRows(before, after, NOW).map((r) => r.tag)).toEqual([
      "Changed",
      "Changed",
      "Changed",
    ]);
  });

  it("tags changed values Changed, and refused ones Refused", () => {
    const a = appointment();
    const moved = { ...valuesOf(a), date: "2026-11-02", time: "09:00" };
    const changed = editRows(
      a,
      moved,
      "2026-11-02T09:00:00Z",
      180,
      { technician: undefined, bay: undefined },
      false,
      NOW,
    );
    expect(changed.map((r) => [r.after, r.tag])).toEqual([
      ["Mon 2 Nov, 09:00 to 12:00", "Changed"],
      ["Maya Okafor, or another free technician", "Changed"],
      ["Bay 1, or another free bay", "Changed"],
    ]);
    const refused = editRows(
      a,
      moved,
      "2026-11-02T09:00:00Z",
      180,
      { technician: undefined, bay: undefined },
      true,
      NOW,
    );
    expect(refused.map((r) => r.tag)).toEqual([
      "Refused",
      undefined,
      undefined,
    ]);
    expect(
      editRows(
        a,
        valuesOf(a),
        a.start,
        180,
        { technician: undefined, bay: undefined },
        false,
        NOW,
      ).map((r) => r.tag),
    ).toEqual([undefined, undefined, undefined]);
  });

  it("names the flag kinds in the phone bar, and the technician's day in the select", () => {
    expect(flaggedStatus(flagged())).toBe(
      "Flagged: outside the shift and outside opening hours",
    );
    const t = {
      id: "t2",
      name: "Tomas Havel",
      skills: ["mechanic"],
      onLeave: false,
      shift: { start: "2026-10-30T08:00:00Z", end: "2026-10-30T17:00:00Z" },
      break: null,
      free: [],
    };
    expect(technicianOption(t, "Europe/London")).toBe(
      "Tomas Havel · works 08:00 to 17:00",
    );
    expect(technicianOption({ ...t, onLeave: true }, "Europe/London")).toBe(
      "Tomas Havel · on leave this day",
    );
    expect(technicianOption({ ...t, shift: null }, "Europe/London")).toBe(
      "Tomas Havel · not working this day",
    );
  });
});

describe("flagged words (manager.md 5.2)", () => {
  it("groups by day with a count, and writes the lede, the strip and the live message", () => {
    const a = appointment();
    const b = appointment({
      id: "a2",
      start: "2026-10-31T14:30:00Z",
      end: "2026-10-31T15:30:00Z",
    });
    const c = appointment({
      id: "a3",
      start: "2026-10-31T15:00:00Z",
      end: "2026-10-31T16:00:00Z",
    });
    expect(
      groupByDay([a, b, c], NOW).map((g) => [
        g.heading,
        g.count,
        g.appointments.length,
      ]),
    ).toEqual([
      ["Fri 30 Oct", "1 booking", 1],
      ["Sat 31 Oct", "2 bookings", 2],
    ]);
    expect(ledeText(1)).toMatch(
      /^1 booking needs a new time, or to be cancelled\./,
    );
    expect(stripTitle(4)).toBe("4 bookings need a new time");
    expect(stripTitle(1)).toBe("1 booking needs a new time");
    expect(afterCancelText(3)).toBe(
      "Appointment cancelled. 3 flagged bookings left.",
    );
    expect(rowName(a, NOW)).toBe(
      "Full service for Marta Kowalska, Fri 30 Oct 09:15",
    );
  });
});

describe("ChangeSummary (design.md 8.26)", () => {
  it("is a table with Now and After the change, and a tag in words beside the arrow", () => {
    render(
      <ChangeSummary
        rows={[
          {
            label: "Time",
            now: "Fri 30 Oct, 09:15",
            after: "Fri 30 Oct, 13:30",
            tag: "Refused",
          },
          { label: "Bay", now: "Bay 1", after: "Bay 1" },
        ]}
        footnote="Nothing was changed. Your entries are still in the form."
      />,
    );
    expect(
      screen.getByRole("complementary", { name: "What changes" }),
    ).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Now" })).toBeTruthy();
    expect(
      screen.getByRole("columnheader", { name: "After the change" }),
    ).toBeTruthy();
    expect(screen.getByRole("rowheader", { name: "Time" })).toBeTruthy();
    expect(screen.getByText("Refused")).toBeTruthy();
  });
});

describe("SuggestionGroup in fill mode (design.md 8.18)", () => {
  it("is a group of aria-pressed buttons that fill the form and save nothing", () => {
    const onPick = vi.fn();
    render(
      <SuggestionFillGroup
        title="Closest times that are free"
        items={[
          { start: "2026-11-02T09:00:00Z", end: "2026-11-02T12:00:00Z" },
          { start: "2026-11-02T09:15:00Z", end: "2026-11-02T12:15:00Z" },
        ]}
        pressed="2026-11-02T09:15:00Z"
        onPick={onPick}
        startLabel={(i) => i.slice(11, 16)}
        endLabel={(i) => i.slice(11, 16)}
      />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.getAttribute("aria-pressed"))).toEqual([
      "false",
      "true",
    ]);
    fireEvent.click(buttons[0]!);
    expect(onPick).toHaveBeenCalledWith({
      start: "2026-11-02T09:00:00Z",
      end: "2026-11-02T12:00:00Z",
    });
    expect(
      screen.getByText(
        "Choosing a time fills in the form. It does not save anything.",
      ),
    ).toBeTruthy();
  });
});

describe("the manager's parts of other screens (manager.md 4.1)", () => {
  const show = (a: Appointment) =>
    render(
      <MemoryRouter>
        <ManagerAppointmentView
          appointment={a}
          dealership={dealership}
          now={NOW}
        />
      </MemoryRouter>,
    );

  it("appointment: Adjust, Cancel appointment and See the messages sent", () => {
    show(appointment());
    expect(
      screen.getByRole("link", { name: "Adjust" }).getAttribute("href"),
    ).toBe("/appointments/a1/adjust");
    expect(
      screen.getByRole("button", { name: "Cancel appointment" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "See the messages sent" })
        .getAttribute("href"),
    ).toBe("/manage/outbox?appointmentId=a1");
  });

  it("appointment-flagged: the panel with Move this appointment and no second Adjust", () => {
    show(flagged());
    expect(
      screen.getByRole("heading", { name: "This booking no longer fits" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /^Ends after Maya's shift, 12:00\. Ends after closing time, 12:00\. It is still booked/,
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Move this appointment" }),
    ).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Adjust" })).toBeNull();
  });

  it("a cancelled appointment has no Adjust and no Cancel", () => {
    show(
      appointment({ cancelledAt: "2026-10-28T07:00:00Z", status: "cancelled" }),
    );
    expect(screen.queryByRole("link", { name: "Adjust" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Cancel appointment" }),
    ).toBeNull();
  });

  it("schedule detail panel: Adjust for the manager, Move for a flagged block, nothing for staff", () => {
    const day = {
      date: "2026-10-30",
      timeZone: "Europe/London",
      opening: null,
      nextOpenDate: null,
      technicians: [],
      serviceBays: [],
      appointments: [],
    } as unknown as ScheduleDay;
    const { unmount } = render(
      <MemoryRouter>
        <DetailPanel day={day} appointment={appointment()} manager now={NOW} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Adjust" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open appointment" })).toBeTruthy();
    unmount();
    const { unmount: again } = render(
      <MemoryRouter>
        <DetailPanel day={day} appointment={flagged()} manager now={NOW} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Move" })).toBeTruthy();
    again();
    render(
      <MemoryRouter>
        <DetailPanel day={day} appointment={flagged()} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("link", { name: "Move" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Adjust" })).toBeNull();
  });

  it("schedule detail panel: no Adjust or Move once the appointment has ended (Q-0001-245)", () => {
    const day = {
      date: "2026-10-30",
      timeZone: "Europe/London",
      opening: null,
      nextOpenDate: null,
      technicians: [],
      serviceBays: [],
      appointments: [],
    } as unknown as ScheduleDay;
    const later = Date.parse("2026-10-30T12:15:00Z");
    const { unmount } = render(
      <MemoryRouter>
        <DetailPanel
          day={day}
          appointment={appointment()}
          manager
          now={later}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("link", { name: "Adjust" })).toBeNull();
    expect(screen.getByRole("link", { name: "Open appointment" })).toBeTruthy();
    unmount();
    render(
      <MemoryRouter>
        <DetailPanel day={day} appointment={flagged()} manager now={later} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("link", { name: "Move" })).toBeNull();
  });

  it("the cancelled note takes focus when the cancel was made on the page (WCAG 2.4.3)", () => {
    render(
      <MemoryRouter>
        <AppointmentReadSide
          appointment={appointment({
            cancelledAt: "2026-10-28T07:00:00Z",
            status: "cancelled",
          })}
          dealership={dealership}
          now={NOW}
          audience="garage"
          focusCancelled
        />
      </MemoryRouter>,
    );
    expect(document.activeElement).toBe(
      screen.getByRole("heading", {
        name: /^This appointment was cancelled on /,
      }),
    );
  });
});

describe("FormSummary (design.md 8.6)", () => {
  it("links a problem to its field, and lists one with no field as text", () => {
    render(
      <FormSummary
        action="check this change"
        problems={[
          { name: "technicianId", message: "Choose another technician." },
          { name: "version", message: "Reload the appointment.", link: false },
        ]}
      />,
    );
    expect(
      screen
        .getByRole("link", { name: "Choose another technician." })
        .getAttribute("href"),
    ).toBe("#field-technicianId");
    expect(screen.getByText("Reload the appointment.")).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "Reload the appointment." }),
    ).toBeNull();
  });
});
