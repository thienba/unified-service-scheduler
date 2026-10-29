// The staff `book` page against a fake API: the review fixes of C4 (a tapped gap whose look-up is slow or
// fails, the Schedule's cached day after a booking, the phone bar's words, the current tab, the kept service).
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../app/App";
import { fakeApi, json, problem, type FakeHandler } from "../../app/fake-api";
import { saveUser } from "../../demo/saved-user";
import { addressFor, searchAddress } from "./staff-words";

const base = "https://api.test/api";
// Wed 28 Oct 2026, 10:40 in Leeds.
const NOW = new Date("2026-10-28T10:40:00Z");

const leeds = {
  id: "d-leeds",
  name: "Northgate Motors",
  timeZone: "Europe/London",
  phone: "+44 113 496 0123",
  weeklyHours: {
    1: { open: "08:00", close: "18:00" },
    2: { open: "08:00", close: "18:00" },
    3: { open: "08:00", close: "18:00" },
    4: { open: "08:00", close: "18:00" },
    5: { open: "08:00", close: "18:00" },
    6: { open: "09:00", close: "16:00" },
  },
  dateOverrides: {},
  policies: {
    leadTimeMinutes: 120,
    horizonDays: 30,
    breakMinutes: 15,
    gridMinutes: 15,
  },
};
const fullService = {
  id: "s-full",
  name: "Full service",
  durationMinutes: 180,
  requiredSkill: "mechanic",
};
const focus = {
  id: "v-focus",
  customerId: "c-marta",
  registration: "AB12 CDE",
  make: "Ford",
  model: "Focus",
};
const marta = {
  id: "c-marta",
  name: "Marta Kowalska",
  phone: "07700 900123",
  email: null,
  vehicles: [focus],
};
const GAP = "2026-10-30T09:00:00Z";
const schedule = {
  date: "2026-10-30",
  timeZone: "Europe/London",
  technicians: [
    {
      id: "t-birch",
      name: "Demo Tech Birch",
      free: [{ start: GAP, end: "2026-10-30T15:00:00Z" }],
      appointments: [],
    },
  ],
};
const slotsOn = (date: string) =>
  ["09:00", "13:00"].map((t) => ({
    start: `${date}T${t}:00Z`,
    end: `${date}T${String(Number(t.slice(0, 2)) + 3).padStart(2, "0")}:00:00Z`,
  }));

function staffApi(extra: Record<string, FakeHandler> = {}) {
  return fakeApi({
    "GET /dealerships": () => json([leeds]),
    "GET /service-types": () => json([fullService]),
    "GET /customers/c-marta/vehicles": () => json([focus]),
    "POST /customers/search": () => json([marta]),
    "GET /dealerships/d-leeds/availability": (request) => {
      const date = new URL(request.url).searchParams.get("date")!;
      return json({
        date,
        timeZone: "Europe/London",
        gridMinutes: 15,
        slots: date === "2026-10-28" ? [] : slotsOn(date),
      });
    },
    "POST /availability-checks": () =>
      json({ available: true, suggestions: [] }),
    ...extra,
  });
}

const forMarta = "/book?customerId=c-marta&vehicleId=v-focus&service=s-full";
const fromGap = `${forMarta}&start=${encodeURIComponent(GAP)}&technicianId=t-birch`;
const availabilityCalls = (api: ReturnType<typeof fakeApi>) =>
  api.calls.filter((c) => c.url.includes("/availability?"));

beforeEach(() => {
  saveUser("u-staff");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("staff book (C4 review fixes)", () => {
  it("D-0001-20 B, Q-0001-247: while the tapped gap is looked up and when that fails, no times load, nothing says Picked for you and Confirm stays off; Try again brings the technician back", async () => {
    let answer: (response: Response) => void = () => {};
    let asked = 0;
    const api = staffApi({
      "GET /dealerships/d-leeds/schedule": () => {
        asked += 1;
        if (asked === 1)
          return new Promise<Response>((done) => {
            answer = done;
          });
        return json(schedule);
      },
    });
    render(
      <App baseUrl={base} fetch={api.fetcher} initialEntries={[fromGap]} />,
    );
    await screen.findByRole("region", { name: "Booking for" });
    await waitFor(() => expect(asked).toBe(1));
    expect(screen.queryByText("Picked for you")).toBeNull();
    expect(availabilityCalls(api)).toHaveLength(0);
    expect(
      (
        screen.getAllByRole("button", {
          name: "Pick a time to confirm",
        })[0] as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    await act(async () => answer(problem(500, "INTERNAL")));
    expect(
      await screen.findByRole("heading", {
        name: "We could not check the gap you tapped.",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Something went wrong on our side, so we cannot show the technician or their times. Nothing was changed. Try again; if it keeps happening, quote reference 4bf92f35.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Picked for you")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Pick a day" })).toBeNull();
    expect(availabilityCalls(api)).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByText(
        "We only show times with Demo Tech Birch. Choose another technician by pressing Any technician.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("From the gap you tapped.")).toBeTruthy();
    await waitFor(() =>
      expect(availabilityCalls(api).length).toBeGreaterThan(0),
    );
    for (const call of availabilityCalls(api))
      expect(new URL(call.url).searchParams.get("technicianId")).toBe(
        "t-birch",
      );
  });

  it("design.md 8.1: on the staff book page the Book for a customer tab is the current one", async () => {
    const api = staffApi();
    render(
      <App
        baseUrl={base}
        fetch={api.fetcher}
        initialEntries={["/book?customerId=c-marta&vehicleId=v-focus"]}
      />,
    );
    expect(
      await screen.findByText("Choose a service to see times."),
    ).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(
      within(nav)
        .getByRole("link", { name: "Book for a customer" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      within(nav)
        .getByRole("link", { name: "Schedule" })
        .getAttribute("aria-current"),
    ).toBeNull();
  });

  it("after a booking the Schedule's cached days are dropped, so going back never shows the old day first", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const day = ["schedule-day", "d-leeds", "2026-10-30"];
    queryClient.setQueryData(day, schedule);
    const api = staffApi({
      "POST /appointments": () =>
        json(
          {
            id: "ap-1",
            dealershipId: "d-leeds",
            timeZone: "Europe/London",
            customerId: "c-marta",
            vehicleId: "v-focus",
            serviceTypeId: "s-full",
            technicianId: "t-birch",
            serviceBayId: "b-1",
            courtesyCarId: null,
            transport: "wait",
            start: "2026-10-30T13:00:00Z",
            end: "2026-10-30T16:00:00Z",
            status: "confirmed",
            flags: [],
            version: 1,
            createdAt: "2026-10-28T10:40:00Z",
            updatedAt: "2026-10-28T10:40:00Z",
            cancelledAt: null,
            display: {
              serviceTypeName: "Full service",
              vehicle: focus,
              customerName: marta.name,
              technicianName: "Demo Tech Birch",
            },
          },
          201,
        ),
    });
    render(
      <App
        baseUrl={base}
        fetch={api.fetcher}
        queryClient={queryClient}
        initialEntries={[forMarta]}
      />,
    );
    fireEvent.click(await screen.findByRole("radio", { name: /^Fri 30 Oct/ }));
    fireEvent.click(
      await screen.findByRole("radio", { name: "13:00 to 16:00" }),
    );
    fireEvent.click(screen.getByRole("radio", { name: "Waits on site" }));
    fireEvent.click(
      screen.getAllByRole("button", { name: "Confirm booking" })[0]!,
    );
    await waitFor(() => expect(queryClient.getQueryData(day)).toBeUndefined());
  });
});

describe("staff booking addresses", () => {
  it("Change customer and Edit details keep the chosen service, the gap and the dealership; the customer is left out", () => {
    const params = new URLSearchParams(
      "dealership=d-leeds&service=s-full&start=2026-10-30T09%3A00%3A00Z&technicianId=t-birch&customerId=c-marta&vehicleId=v-focus&date=2026-10-30",
    );
    expect(searchAddress(params)).toBe(
      "/book/for-customer?dealership=d-leeds&service=s-full&start=2026-10-30T09%3A00%3A00Z&technicianId=t-birch",
    );
    expect(
      addressFor(new URLSearchParams("service=s-full"), {
        customerId: "c-marta",
        vehicleId: "v-focus",
      }),
    ).toBe("/book?service=s-full&customerId=c-marta&vehicleId=v-focus");
  });
});
