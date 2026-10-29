// The customer's appointment rules and words (C5): the cutoff includes its boundary (D-0001-22 a), the date line,
// and the view's change-closed, cancelled and notice states (customer.md 6, REQ-BOOK-012.AC-4).
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import type { Dealership } from "../../data/api-problem";
import { CustomerAppointmentView } from "../appointment/CustomerAppointmentView";
import { AppointmentCard } from "./AppointmentCard";
import {
  customerStatus,
  cutoffOf,
  dateLine,
  mayChangeOnline,
  type Appointment,
} from "./customer-appointment";

afterEach(cleanup);

const dealership = {
  id: "dealership-london",
  name: "Test Motors",
  timeZone: "Europe/London",
  phone: "+44 1632 960 123",
  weeklyHours: {},
  dateOverrides: {},
  policies: {
    leadTimeMinutes: 120,
    horizonDays: 60,
    breakMinutes: 15,
    gridMinutes: 15,
  },
} as unknown as Dealership;

function appointment(extra: Partial<Appointment> = {}): Appointment {
  return {
    id: "a1",
    dealershipId: "dealership-london",
    timeZone: "Europe/London",
    customerId: "customer-1",
    vehicleId: "vehicle-1",
    serviceTypeId: "service-full",
    technicianId: "t1",
    serviceBayId: "bay-1",
    courtesyCarId: null,
    transport: "drop_off",
    start: "2026-10-30T10:00:00Z",
    end: "2026-10-30T13:00:00Z",
    status: "confirmed",
    flags: [],
    version: 1,
    createdAt: "2026-10-26T14:02:00Z",
    updatedAt: "2026-10-26T14:02:00Z",
    cancelledAt: null,
    display: {
      serviceTypeName: "Full service",
      vehicle: { make: "Ford", model: "Focus", registration: "AB12 CDE" },
      technicianName: "Test Tech One",
    },
    ...extra,
  } as Appointment;
}

const at = (iso: string) => Date.parse(iso);

describe("the change window (D-0001-22 a)", () => {
  it("is open up to and including start minus the lead time, and closed one minute later", () => {
    const a = appointment();
    expect(cutoffOf(a, dealership)).toBe(at("2026-10-30T08:00:00Z"));
    expect(mayChangeOnline(a, dealership, at("2026-10-30T08:00:00Z"))).toBe(
      true,
    );
    expect(mayChangeOnline(a, dealership, at("2026-10-30T08:01:00Z"))).toBe(
      false,
    );
  });

  it("is closed for a cancelled or a past appointment", () => {
    const cancelled = appointment({ cancelledAt: "2026-10-28T10:41:00Z" });
    expect(customerStatus(cancelled, at("2026-10-28T11:00:00Z"))).toBe(
      "cancelled",
    );
    expect(
      mayChangeOnline(cancelled, dealership, at("2026-10-28T11:00:00Z")),
    ).toBe(false);
    expect(customerStatus(appointment(), at("2026-10-30T13:00:00Z"))).toBe(
      "past",
    );
  });
});

describe("the date line", () => {
  it('reads "Today, Fri 30 Oct" on the day and "Fri 30 Oct" before', () => {
    const start = "2026-10-30T10:00:00Z";
    expect(dateLine(start, "Europe/London", at("2026-10-30T07:00:00Z"))).toBe(
      "Today, Fri 30 Oct",
    );
    expect(dateLine(start, "Europe/London", at("2026-10-28T10:40:00Z"))).toBe(
      "Fri 30 Oct",
    );
  });
});

function show(a: Appointment, now: number, extra = {}) {
  return render(
    <MemoryRouter>
      <CustomerAppointmentView
        appointment={a}
        dealership={dealership}
        now={now}
        {...extra}
      />
    </MemoryRouter>,
  );
}

describe("the customer's appointment view", () => {
  it("before the cutoff: Reschedule, Cancel appointment and the until line, with the technician and no bay (D-0001-26 C)", () => {
    show(appointment(), at("2026-10-28T10:40:00Z"));
    expect(
      screen
        .getAllByRole("link", { name: "Reschedule" })[0]!
        .getAttribute("href"),
    ).toBe("/appointments/a1/reschedule");
    expect(
      screen.getAllByRole("button", { name: "Cancel appointment" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        /^You can change or cancel this online until 08:00 on Fri 30 Oct, which is 2 hours before it starts\. After that, contact Test Motors\./,
      ).length,
    ).toBeGreaterThan(0);
    const terms = [...document.querySelectorAll("dt")].map(
      (d) => d.textContent,
    );
    expect(terms).toEqual([
      "Service",
      "Car",
      "Dealership",
      "Technician",
      "The car",
    ]);
  });

  it("after the cutoff: the info Alert with the dealership and the phone, and no buttons (REQ-BOOK-012.AC-4)", () => {
    show(appointment(), at("2026-10-30T08:01:00Z"));
    expect(
      screen.getByRole("heading", {
        name: "This appointment can no longer be changed online.",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /^It starts in less than 2 hours\. Contact Test Motors to change it\./,
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /^Call \+44 1632 960 123/ })
        .getAttribute("href"),
    ).toBe("tel:+441632960123");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("cancelled: the line, Book a service, no actions, and the D-0001-60 notice when handed one", () => {
    show(
      appointment({ cancelledAt: "2026-10-28T10:41:00Z" }),
      at("2026-10-28T11:00:00Z"),
      { notice: "This appointment was cancelled, so it cannot be moved." },
    );
    expect(
      screen.getByText(
        "Cancelled on Wed 28 Oct, 10:41. The time is free for other customers.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Book a service" })).toBeTruthy();
    expect(
      screen.getByText(
        "This appointment was cancelled, so it cannot be moved.",
      ),
    ).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("the card", () => {
  it("inside the change window says to contact the dealership and has only View details", () => {
    render(
      <MemoryRouter>
        <AppointmentCard
          appointment={appointment()}
          dealership={dealership}
          now={at("2026-10-30T08:30:00Z")}
          first
          onCancel={() => {}}
        />
      </MemoryRouter>,
    );
    expect(
      screen.getByText(
        /^It is too close to the start to change online\. Contact Test Motors\./,
      ),
    ).toBeTruthy();
    const links = screen.getAllByRole("link").map((l) => l.textContent);
    expect(links).toHaveLength(3);
    expect(links[0]).toBe("Today, Fri 30 Oct10:00 to 13:00");
    expect(links[1]).toMatch(/^Call \+44 1632 960 123/);
    expect(links[2]).toBe("View details");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
