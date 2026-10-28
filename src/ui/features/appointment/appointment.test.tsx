// The read side of the `appointment` page (C3, staff.md 5.2): what staff, managers and customers see.
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import type { Dealership } from "../../data/api-problem";
import type { Appointment } from "./AppointmentReadSide";
import { CustomerAppointmentView } from "./CustomerAppointmentView";
import { ManagerAppointmentView } from "./ManagerAppointmentView";
import { StaffAppointmentView } from "./StaffAppointmentView";

afterEach(cleanup);

const NOW = Date.parse("2026-10-28T08:00:00Z");

const dealership = {
  id: "dealership-london",
  name: "Test Motors",
  timeZone: "Europe/London",
  weeklyHours: {},
  dateOverrides: {},
  policies: {
    leadTimeMinutes: 120,
    horizonDays: 60,
    breakMinutes: 15,
    gridMinutes: 15,
  },
} as unknown as Dealership;

function appointment(
  extra: Partial<Appointment> = {},
  display: Partial<Appointment["display"]> = {},
): Appointment {
  return {
    id: "a1",
    dealershipId: "dealership-london",
    timeZone: "Europe/London",
    customerId: "customer-1",
    vehicleId: "vehicle-1",
    serviceTypeId: "service-full",
    technicianId: "t1",
    serviceBayId: "bay-1",
    courtesyCarId: "car-2",
    transport: "courtesy_car",
    start: "2026-10-28T09:15:00Z",
    end: "2026-10-28T12:15:00Z",
    status: "confirmed",
    flags: [],
    version: 1,
    createdAt: "2026-10-26T14:02:00Z",
    updatedAt: "2026-10-26T14:02:00Z",
    cancelledAt: null,
    display: {
      serviceTypeName: "Full service",
      vehicle: { make: "Vauxhall", model: "Corsa", registration: "CD34 FGH" },
      technicianName: "Test Tech One",
      serviceBayName: "Bay 1",
      customerName: "Jan Testperson",
      courtesyCarName: "Car 2",
      ...display,
    },
    ...extra,
  };
}

function show(View: typeof StaffAppointmentView, a: Appointment, now = NOW) {
  return render(
    <MemoryRouter>
      <View appointment={a} dealership={dealership} now={now} />
    </MemoryRouter>,
  );
}

const terms = () =>
  [...document.querySelectorAll("dt")].map((d) => d.textContent);

describe("the staff view (REQ-BOOK-005.AC-3, D-0001-19 A, D-0001-32 A)", () => {
  it("shows the time as the title, the badges and a flat facts list with the customer's name only", () => {
    show(StaffAppointmentView, appointment());
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Wed 28 Oct, 09:15 to 12:15",
      }),
    ).toBeTruthy();
    expect(screen.getByText("Confirmed")).toBeTruthy();
    expect(terms()).toEqual([
      "Customer",
      "Vehicle",
      "Service",
      "Dealership",
      "Technician",
      "Bay",
      "Car choice",
      "Booked",
    ]);
    expect(screen.getByText("Courtesy car, Car 2")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/@|phone/i);
  });

  it("has no Cancel, Reschedule or Adjust, not even disabled, and says who can", () => {
    show(StaffAppointmentView, appointment());
    expect(
      screen.queryAllByRole("button", { name: /cancel|reschedule|adjust/i }),
    ).toHaveLength(0);
    expect(
      screen.getByRole("heading", { name: "Need to change or cancel this?" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Staff cannot move or cancel appointments. Ask the garage manager, or the customer can do it from their own account until 2 hours before the start.",
      ),
    ).toBeTruthy();
  });

  it("offers to book another visit for the customer by first name, with ids only in the address", () => {
    show(StaffAppointmentView, appointment());
    expect(
      screen
        .getByRole("link", { name: "Book another visit for Jan" })
        .getAttribute("href"),
    ).toBe(
      "/book?dealership=dealership-london&customerId=customer-1&vehicleId=vehicle-1",
    );
  });

  it("shows the flag panel above the facts with the reason in words", () => {
    show(
      StaffAppointmentView,
      appointment({
        flags: [
          {
            kind: "outside_shift",
            since: "2026-10-27T10:00:00Z",
            reason: "Ends after Test's shift, 13:00",
          },
        ],
      }),
    );
    const panel = screen.getByRole("heading", {
      name: "Flagged: Ends after Test's shift, 13:00",
    });
    expect(panel).toBeTruthy();
    expect(
      screen.getByText(
        "It is still booked and still holds its technician and bay. The garage manager can move it from the Flagged list.",
      ),
    ).toBeTruthy();
  });

  it("shows a cancelled appointment with the note and What next?, and no change panel", () => {
    show(
      StaffAppointmentView,
      appointment({
        status: "cancelled",
        cancelledAt: "2026-10-27T16:05:00Z",
      }),
    );
    expect(
      screen.getByText("Cancelled", { selector: "*:not(dt)" }),
    ).toBeTruthy();
    expect(
      screen.getByText("This appointment was cancelled on Tue 27 Oct, 16:05."),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "What next?" })).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Need to change or cancel this?" }),
    ).toBeNull();
  });

  it("says Past once the end has gone", () => {
    show(
      StaffAppointmentView,
      appointment(),
      Date.parse("2026-10-28T13:00:00Z"),
    );
    expect(screen.getByText("Past")).toBeTruthy();
  });
});

describe("the other roles' read side", () => {
  it("the manager sees the same facts as staff", () => {
    show(ManagerAppointmentView, appointment());
    expect(terms()).toContain("Customer");
    expect(terms()).toContain("Bay");
  });

  it("the customer sees no Customer, no Bay and no staff panel (D-0001-26 C)", () => {
    show(
      CustomerAppointmentView,
      appointment(
        {},
        {
          technicianName: undefined,
          serviceBayName: undefined,
          customerName: undefined,
        },
      ),
    );
    expect(terms()).not.toContain("Customer");
    expect(terms()).not.toContain("Bay");
    expect(
      screen.queryByRole("heading", { name: "Need to change or cancel this?" }),
    ).toBeNull();
  });
});

describe("stored text is shown as text (SEC-11.AC-2)", () => {
  it.each([
    '<img src=x onerror="window.__xss=1">',
    '"><script>window.__xss=1</script>',
  ])("draws %s literally", (text) => {
    const { container } = show(
      StaffAppointmentView,
      appointment(
        {},
        {
          customerName: text,
          vehicle: { make: text, model: text, registration: text },
        },
      ),
    );
    expect(container.querySelectorAll("img, script")).toHaveLength(0);
    expect(container.textContent).toContain(text);
    expect((window as { __xss?: number }).__xss).toBeUndefined();
  });
});
