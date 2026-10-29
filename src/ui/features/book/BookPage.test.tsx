// The customer's booking screen against a fake API (C2; REQ-BOOK-001, 009, 010, SEC-6, SEC-12).
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../app/App";
import { chooseOption, selectButton } from "../../testing/controls";
import { fakeApi, json, problem, type FakeHandler } from "../../app/fake-api";
import { saveUser } from "../../demo/saved-user";

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
  customerId: "c-aisha",
  registration: "AB12 CDE",
  make: "Ford",
  model: "Focus",
};

const at = (date: string, hhmm: string) => `${date}T${hhmm}:00Z`;
const slotsOn = (date: string) =>
  ["09:00", "10:00", "13:00"].map((t) => {
    const start = at(date, t);
    return {
      start,
      end: new Date(Date.parse(start) + 3 * 3_600_000)
        .toISOString()
        .replace(".000Z", "Z"),
    };
  });

function bookingApi(
  extra: Record<string, FakeHandler> = {},
  vehicles = [focus],
) {
  return fakeApi({
    "GET /me": () =>
      json({
        userId: "u-customer",
        name: "Aisha Rahman",
        role: "customer",
        customerId: "c-aisha",
        dealershipIds: [],
      }),
    "GET /dealerships": () => json([leeds]),
    "GET /service-types": () => json([fullService]),
    "GET /customers/c-aisha/vehicles": () => json(vehicles),
    "GET /dealerships/d-leeds/availability": (request) => {
      const date = new URL(request.url).searchParams.get("date")!;
      return json({
        date,
        timeZone: "Europe/London",
        gridMinutes: 15,
        // Today has only the afternoon left (the notice time).
        slots: date === "2026-10-28" ? slotsOn(date).slice(2) : slotsOn(date),
      });
    },
    ...extra,
  });
}

function open(path: string, api = bookingApi()) {
  render(<App baseUrl={base} fetch={api.fetcher} initialEntries={[path]} />);
  return api;
}

const deepLink = "/book?dealership=d-leeds&service=s-full";
const posts = (api: ReturnType<typeof fakeApi>) =>
  api.calls.filter(
    (c) => c.method === "POST" && c.url.endsWith("/appointments"),
  );

async function chooseTime(name: string) {
  fireEvent.click(await screen.findByRole("radio", { name }));
}
async function chooseCar() {
  await chooseOption(/^Car/, "v-focus");
}
const confirmButton = () =>
  screen.getByRole("button", { name: "Confirm booking" });

beforeEach(() => {
  saveUser("u-customer");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("book", () => {
  it("idle: the title reads Book a service and the three fields say (required)", async () => {
    open("/book");
    await screen.findByRole("heading", { level: 1, name: "Book a service" });
    for (const label of ["Dealership", "Car", "Service"]) {
      expect(
        await screen.findByText(`${label} (required)`, { exact: false }),
      ).toBeTruthy();
    }
    expect(
      screen.getByText(
        "Pick a dealership, a car and a service above. Then we show which days have room.",
      ),
    ).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "Pick a time to confirm" }).length,
    ).toBe(1);
  });

  it("deep-link: fills both fields, says so, titles the service and selects the first day with times", async () => {
    open(deepLink);
    await screen.findByRole("heading", {
      level: 1,
      name: "Choose a time for your full service",
    });
    expect(
      screen.getByText(
        "The dealership and the service were filled in from the dealer's website. Change them if you need to.",
      ),
    ).toBeTruthy();
    const today = await screen.findByRole("radio", {
      name: "Wed 28 Oct, 1 time",
    });
    await waitFor(() => expect((today as HTMLInputElement).checked).toBe(true));
    expect(
      screen.getByRole("radio", { name: "Sun 1 Nov, Closed" }),
    ).toHaveProperty("disabled", true);
    expect(screen.getByText("1 time on Wed 28 Oct")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "13:00 to 16:00" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Previous week" }),
    ).toHaveProperty("title", "You cannot book a day that has passed");
    const previous = screen.getByRole("button", { name: "Previous week" });
    expect(
      document.getElementById(previous.getAttribute("aria-describedby") ?? "")
        ?.textContent,
    ).toBe("You cannot book a day that has passed");
  });

  it("SEC-12.AC-1: an unknown dealership or service in the link is ignored and never shown", async () => {
    const raw = "<script>x</script>";
    open(`/book?dealership=${encodeURIComponent(raw)}&service=nope`);
    await screen.findByRole("heading", { level: 1, name: "Book a service" });
    const dealership = await screen.findByRole("button", {
      name: /^Dealership/,
    });
    const service = selectButton(/^Service/);
    expect(dealership.getAttribute("data-value")).toBe("");
    expect(service.getAttribute("data-value")).toBe("");
    expect(dealership.textContent).toBe("Choose a dealership");
    expect(document.body.textContent).not.toContain("script");
    expect(new XMLSerializer().serializeToString(document.body)).not.toContain(
      "script>x",
    );
    expect(document.title).not.toContain("script");
    expect(
      screen.queryByText(/filled in from the dealer's website/),
    ).toBeNull();
  });

  it("REQ-BOOK-001.AC-1, SEC-7.AC-1: Confirm sends one POST with exactly the five fields and an Idempotency-Key; a second press is ignored", async () => {
    let answer: (r: Response) => void = () => {};
    const api = open(
      deepLink,
      bookingApi({
        "POST /appointments": () =>
          new Promise<Response>((done) => (answer = done)),
      }),
    );
    await chooseCar();
    fireEvent.click(await screen.findByRole("radio", { name: /^Fri 30 Oct/ }));
    await chooseTime("10:00 to 13:00");
    fireEvent.click(screen.getByRole("radio", { name: "Drop it off" }));
    expect(
      screen.getAllByText("Fri 30 Oct, 10:00 to 13:00").length,
    ).toBeGreaterThan(0);
    fireEvent.click(confirmButton());
    await waitFor(() => expect(posts(api)).toHaveLength(1));
    const button = screen.getByRole("button", { name: /Confirming…/ });
    fireEvent.click(button);
    fireEvent.click(button);
    const request = posts(api)[0]!;
    expect(await request.clone().json()).toEqual({
      dealershipId: "d-leeds",
      serviceTypeId: "s-full",
      vehicleId: "v-focus",
      start: "2026-10-30T10:00:00Z",
      transport: "drop_off",
    });
    expect(request.headers.get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
    await act(async () => answer(problem(500, "INTERNAL")));
    expect(posts(api)).toHaveLength(1);
  });

  it("REQ-BOOK-001.AC-2: a missing car and car choice send nothing, list both as links and move focus to the Alert", async () => {
    const api = open(deepLink);
    await chooseTime("13:00 to 16:00");
    fireEvent.click(confirmButton());
    const heading = await screen.findByText(
      "2 things need fixing before we can book this.",
    );
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(
      screen.getByRole("link", { name: "Car: choose which car is coming in." }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", {
        name: "What you will do with the car: choose one.",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText("Car is missing. Choose which car is coming in."),
    ).toBeTruthy();
    expect(
      screen.getByText("Choose what you will do with the car."),
    ).toBeTruthy();
    expect(posts(api)).toHaveLength(0);
    // The typed choices are kept.
    expect(
      (
        screen.getByRole("radio", {
          name: "13:00 to 16:00",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("link", { name: "Car: choose which car is coming in." }),
    );
    expect(document.activeElement).toBe(selectButton(/^Car/));
  });

  it("REQ-BOOK-010.AC-1: the car choice has no default", async () => {
    open(deepLink);
    for (const name of ["Wait on site", "Drop it off"]) {
      expect(
        ((await screen.findByRole("radio", { name })) as HTMLInputElement)
          .checked,
      ).toBe(false);
    }
  });

  it("REQ-BOOK-009.AC-2: a 409 keeps every choice, apologises with the real time, strikes the chip and offers the closest times; a suggestion books nothing", async () => {
    const api = open(
      deepLink,
      bookingApi({
        "POST /appointments": () =>
          problem(409, "SLOT_UNAVAILABLE", {
            reasons: ["TECHNICIAN_BUSY"],
            suggestions: [
              {
                start: at("2026-10-30", "10:15"),
                end: at("2026-10-30", "13:15"),
              },
              {
                start: at("2026-10-31", "10:00"),
                end: at("2026-10-31", "13:00"),
              },
            ],
          }),
      }),
    );
    await chooseCar();
    fireEvent.click(await screen.findByRole("radio", { name: /^Fri 30 Oct/ }));
    await chooseTime("10:00 to 13:00");
    fireEvent.click(screen.getByRole("radio", { name: "Wait on site" }));
    fireEvent.click(confirmButton());
    const heading = await screen.findByText(
      "Sorry, 10:00 on Fri 30 Oct was just taken.",
    );
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(
      screen.getByText(
        "Another customer confirmed that time a moment before you. Nothing was booked for you. We kept your car, service and choice, so you only need a new time.",
      ),
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain("TECHNICIAN_BUSY");
    expect(
      screen.getByRole("radio", { name: "10:00, just taken" }),
    ).toHaveProperty("disabled", true);
    expect(screen.getByText("Just taken")).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "Pick a new time to confirm" }),
    ).toHaveLength(1);
    expect(selectButton(/^Car/).getAttribute("data-value")).toBe("v-focus");
    expect(
      (screen.getByRole("radio", { name: "Wait on site" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    const closest = screen.getByRole("radiogroup", {
      name: "Closest to your time",
    });
    expect(within(closest).getByText("ends 13:15")).toBeTruthy();
    const same = screen.getByRole("radiogroup", {
      name: "Same time, another day",
    });
    expect(within(same).getByText("Sat 31 Oct · ends 13:00")).toBeTruthy();
    // Each group is its own native radio group: its own Tab stop, arrows stay inside it.
    const groupName = (group: HTMLElement) =>
      within(group).getAllByRole("radio")[0]!.getAttribute("name");
    expect(groupName(closest)).not.toBe(groupName(same));
    // The heading takes focus and so is announced once; the Alert is not also a live region.
    expect(heading.closest("[role=alert], [role=status]")).toBeNull();

    fireEvent.click(
      within(closest).getByRole("radio", { name: "10:15 to 13:15" }),
    );
    expect(
      screen.getAllByText("Fri 30 Oct, 10:15 to 13:15").length,
    ).toBeGreaterThan(0);
    expect(confirmButton()).toHaveProperty("disabled", false);
    expect(posts(api)).toHaveLength(1);
  });

  it("conflict-empty: with no suggestions the page says so and gives the dealership's phone", async () => {
    open(
      deepLink,
      bookingApi({
        "POST /appointments": () =>
          problem(409, "SLOT_UNAVAILABLE", {
            reasons: ["BAY_BUSY"],
            suggestions: [],
          }),
      }),
    );
    await chooseCar();
    await chooseTime("13:00 to 16:00");
    fireEvent.click(screen.getByRole("radio", { name: "Wait on site" }));
    fireEvent.click(confirmButton());
    await screen.findByText("There are no other times in the next 14 days.");
    expect(
      screen.getByText("Try another day, or contact Northgate Motors."),
    ).toBeTruthy();
    expect(
      screen
        .getAllByRole("link", { name: /\+44 113 496 0123/ })[0]!
        .getAttribute("href"),
    ).toMatch(/^tel:/);
  });

  it("conflict-too-soon: a 409 TOO_SOON says the time is too soon and the chip says Too soon", async () => {
    open(
      deepLink,
      bookingApi({
        "POST /appointments": () =>
          problem(409, "SLOT_UNAVAILABLE", {
            reasons: ["TOO_SOON"],
            suggestions: [],
          }),
      }),
    );
    await chooseCar();
    await chooseTime("13:00 to 16:00");
    fireEvent.click(screen.getByRole("radio", { name: "Wait on site" }));
    fireEvent.click(confirmButton());
    await screen.findByText("Sorry, 13:00 on Wed 28 Oct is too soon to book.");
    expect(screen.getByRole("radio", { name: "13:00, too soon" })).toBeTruthy();
  });

  it("REQ-BOOK-009.AC-4, AD-5: after a 500, Try again sends the same Idempotency-Key and the choices stay", async () => {
    let first = true;
    const api = open(
      deepLink,
      bookingApi({
        "POST /appointments": () => {
          if (first) {
            first = false;
            return problem(500, "INTERNAL");
          }
          return problem(503, "INTERNAL");
        },
      }),
    );
    await chooseCar();
    await chooseTime("13:00 to 16:00");
    fireEvent.click(screen.getByRole("radio", { name: "Wait on site" }));
    fireEvent.click(confirmButton());
    await screen.findByText("Something went wrong on our side.");
    expect(
      screen.getByText(
        "Nothing was booked. Your choices are still here. Try again; if it keeps happening, quote reference 4bf92f35.",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(posts(api)).toHaveLength(2));
    const [a, b] = posts(api);
    expect(b!.headers.get("Idempotency-Key")).toBe(
      a!.headers.get("Idempotency-Key"),
    );
  });

  it("no network: the title says we could not reach the booking service", async () => {
    open(
      deepLink,
      bookingApi({
        "POST /appointments": () => {
          throw new TypeError("Failed to fetch");
        },
      }),
    );
    await chooseCar();
    await chooseTime("13:00 to 16:00");
    fireEvent.click(screen.getByRole("radio", { name: "Wait on site" }));
    fireEvent.click(confirmButton());
    await screen.findByText("We could not reach the booking service.");
    expect(
      screen.getByText(
        "Nothing was booked. Check your connection and try again. Your choices are still here.",
      ),
    ).toBeTruthy();
  });

  it("SEC-6.AC-3: a customer with no car sees the info Alert with the phone, and no strip", async () => {
    open(deepLink, bookingApi({}, []));
    await screen.findByText("There is no car on your account yet.");
    expect(
      screen.getAllByRole("link", { name: /\+44 113 496 0123/ }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole("radiogroup", { name: "Choose a day" }),
    ).toBeNull();
  });

  it("SEC-6.AC-1: a booking link for another customer shows the customer no-permission block", async () => {
    open("/book?customerId=c-someone-else");
    await screen.findByRole("heading", {
      name: "You cannot do that as Customer.",
    });
    expect(screen.getByRole("link", { name: "Book for myself" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Switch role" })).toBeTruthy();
  });

  it("days-error: a failed day check replaces the strip with what failed and the reference", async () => {
    open(
      deepLink,
      bookingApi({
        "GET /dealerships/d-leeds/availability": () => problem(500, "INTERNAL"),
      }),
    );
    await screen.findByText("We could not check the days.");
    expect(screen.getByText(/Nothing was changed\./)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.getAllByText(/4bf92f35/).length).toBeGreaterThan(0);
  });
});

// The courtesy car (C7, REQ-BOOK-010.AC-1 and AC-3, Q-0001-18): the third choice and the states around it.
/** The availability check answers: a courtesy car is free at every start but `busyAt`. */
const courtesyCheck =
  (busyAt: readonly string[], next = at("2026-10-30", "10:45")) =>
  async (request: Request) => {
    const body = (await request.clone().json()) as {
      start: string;
      transport: string;
    };
    if (body.transport === "courtesy_car" && busyAt.includes(body.start))
      return json({
        available: false,
        reasons: ["COURTESY_CAR_BUSY"],
        suggestions: [
          {
            start: next,
            end: new Date(Date.parse(next) + 3 * 3_600_000)
              .toISOString()
              .replace(".000Z", "Z"),
          },
        ],
      });
    return json({
      available: true,
      technicianId: "t-1",
      serviceBayId: "b-1",
      courtesyCarId: body.transport === "courtesy_car" ? "car-1" : null,
    });
  };
const radio = (name: string | RegExp) =>
  screen.getByRole("radio", { name }) as HTMLInputElement;

describe("book with a courtesy car", () => {
  it("REQ-BOOK-010.AC-1: three choices with no default; the courtesy car is sent and the days are asked with it", async () => {
    const api = open(
      deepLink,
      bookingApi({
        "POST /availability-checks": courtesyCheck([]),
        "POST /appointments": () => problem(500, "INTERNAL"),
      }),
    );
    const legend = await screen.findByText("What will you do with the car?");
    const group = legend.closest("fieldset")!;
    expect(
      within(group)
        .getAllByRole("radio")
        .map((r) => [
          (r as HTMLInputElement).labels?.[0]?.textContent,
          (r as HTMLInputElement).checked,
        ]),
    ).toEqual([
      ["Wait on site", false],
      ["Drop it off", false],
      ["Borrow a courtesy car", false],
    ]);
    await chooseCar();
    fireEvent.click(await screen.findByRole("radio", { name: /^Fri 30 Oct/ }));
    await chooseTime("10:00 to 13:00");
    fireEvent.click(radio("Borrow a courtesy car"));
    await waitFor(() =>
      expect(
        api.calls.some(
          (c) =>
            c.url.includes("/availability?") &&
            new URL(c.url).searchParams.get("transport") === "courtesy_car",
        ),
      ).toBe(true),
    );
    await screen.findByRole("radio", { name: "10:00 to 13:00" });
    fireEvent.click(confirmButton());
    await waitFor(() => expect(posts(api)).toHaveLength(1));
    expect((await posts(api)[0]!.clone().json()).transport).toBe(
      "courtesy_car",
    );
  });

  it("no-courtesy-car: the option is off with its reason, the line names the API's next start, and wait still works", async () => {
    const api = open(
      deepLink,
      bookingApi({
        "POST /availability-checks": courtesyCheck([at("2026-10-30", "10:00")]),
        "POST /appointments": () => problem(500, "INTERNAL"),
      }),
    );
    await chooseCar();
    fireEvent.click(await screen.findByRole("radio", { name: /^Fri 30 Oct/ }));
    await chooseTime("10:00 to 13:00");
    await screen.findByText(
      "No courtesy car is free from 10:00 to 13:00. You can still wait or drop the car off. A courtesy car is free if you start at 10:45.",
    );
    const car = radio(/^Borrow a courtesy car\s*Not available at this time$/);
    expect(car.disabled).toBe(true);
    fireEvent.click(radio("Wait on site"));
    fireEvent.click(confirmButton());
    await waitFor(() => expect(posts(api)).toHaveLength(1));
    expect((await posts(api)[0]!.clone().json()).transport).toBe("wait");
  });

  it("courtesy-cleared: a chosen courtesy car is cleared at a start with none free, and the page says so", async () => {
    open(
      deepLink,
      bookingApi({
        "POST /availability-checks": courtesyCheck([at("2026-10-30", "13:00")]),
      }),
    );
    await chooseCar();
    fireEvent.click(await screen.findByRole("radio", { name: /^Fri 30 Oct/ }));
    await chooseTime("10:00 to 13:00");
    fireEvent.click(radio("Borrow a courtesy car"));
    await chooseTime("13:00 to 16:00");
    await screen.findByText(
      "A courtesy car is not free from 13:00 to 16:00, so we cleared that choice. Please choose again.",
    );
    const car = radio(/^Borrow a courtesy car\s*Not available at this time$/);
    expect(car.disabled).toBe(true);
    expect(car.checked).toBe(false);
    // The cleared note takes the place of the "No courtesy car is free" line.
    expect(screen.queryByText(/^No courtesy car is free/)).toBeNull();
  });

  it("the day tiles and the chips follow the car choice: with the courtesy car, the tile count equals the enabled chips", async () => {
    const enabledChips = () =>
      screen
        .getAllByRole("radio", { name: /^\d\d:\d\d to \d\d:\d\d$/ })
        .filter((r) => !(r as HTMLInputElement).disabled);
    open(
      deepLink,
      bookingApi({
        "POST /availability-checks": courtesyCheck([]),
        // The only courtesy car is out in the afternoon of Fri 30 Oct: 13:00 has no car.
        "GET /dealerships/d-leeds/availability": (request) => {
          const query = new URL(request.url).searchParams;
          const date = query.get("date")!;
          const all =
            date === "2026-10-28" ? slotsOn(date).slice(2) : slotsOn(date);
          const slots =
            query.get("transport") === "courtesy_car" && date === "2026-10-30"
              ? all.filter((s) => s.start !== at(date, "13:00"))
              : all;
          return json({
            date,
            timeZone: "Europe/London",
            gridMinutes: 15,
            slots,
          });
        },
      }),
    );
    await chooseCar();
    fireEvent.click(
      await screen.findByRole("radio", { name: "Fri 30 Oct, 3 times" }),
    );
    await screen.findByRole("radio", { name: "13:00 to 16:00" });
    expect(enabledChips()).toHaveLength(3);
    fireEvent.click(radio("Borrow a courtesy car"));
    const tile = await screen.findByRole("radio", {
      name: "Fri 30 Oct, 2 times",
    });
    expect((tile as HTMLInputElement).checked).toBe(true);
    await waitFor(() =>
      expect(
        screen.queryByRole("radio", { name: "13:00 to 16:00" }),
      ).toBeNull(),
    );
    expect(enabledChips()).toHaveLength(2);
  });

  it("courtesy-cleared on a week only asked with the courtesy car: the strip stays and the clicked chip keeps focus (WCAG 2.4.3)", async () => {
    open(
      deepLink,
      bookingApi({
        "POST /availability-checks": courtesyCheck([at("2026-11-04", "10:00")]),
        // The wait search is slow, so a strip that waits for it would show its loading block.
        "GET /dealerships/d-leeds/availability": async (request) => {
          const query = new URL(request.url).searchParams;
          const date = query.get("date")!;
          if (query.get("transport") === "wait" && date >= "2026-11-04")
            await new Promise((resolve) => setTimeout(resolve, 150));
          const slots =
            date === "2026-10-28" ? slotsOn(date).slice(2) : slotsOn(date);
          return json({
            date,
            timeZone: "Europe/London",
            gridMinutes: 15,
            slots,
          });
        },
      }),
    );
    await chooseCar();
    await screen.findByRole("radio", { name: "Wed 28 Oct, 1 time" });
    fireEvent.click(radio("Borrow a courtesy car"));
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    const chip = await screen.findByRole("radio", { name: "10:00 to 13:00" });
    expect(
      (screen.getByRole("radio", { name: /^Wed 4 Nov/ }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    chip.focus();
    fireEvent.click(chip);
    await screen.findByText(
      "A courtesy car is not free from 10:00 to 13:00, so we cleared that choice. Please choose again.",
    );
    expect(screen.queryByText("Loading the days and times")).toBeNull();
    expect(chip.isConnected).toBe(true);
    expect(document.activeElement).toBe(chip);
    // Once the wait search answers, the chip is still the same element and still has focus.
    await waitFor(
      () =>
        expect(
          screen.getByRole("radio", { name: /^Wed 4 Nov, 3 times/ }),
        ).toBeTruthy(),
      { timeout: 2000 },
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
    expect(chip.isConnected).toBe(true);
    expect(document.activeElement).toBe(chip);
  });

  it("conflict-courtesy: a 409 COURTESY_CAR_BUSY books nothing, keeps the time, clears the choice and lists up to five times with a car", async () => {
    const six = ["10:30", "10:45", "11:00", "11:15", "11:30", "11:45"].map(
      (t) => ({
        start: at("2026-10-30", t),
        end: new Date(Date.parse(at("2026-10-30", t)) + 3 * 3_600_000)
          .toISOString()
          .replace(".000Z", "Z"),
      }),
    );
    const api = open(
      deepLink,
      bookingApi({
        "POST /availability-checks": courtesyCheck([]),
        "POST /appointments": () =>
          problem(409, "SLOT_UNAVAILABLE", {
            reasons: ["COURTESY_CAR_BUSY"],
            suggestions: six,
          }),
      }),
    );
    await chooseCar();
    fireEvent.click(await screen.findByRole("radio", { name: /^Fri 30 Oct/ }));
    await chooseTime("10:00 to 13:00");
    fireEvent.click(radio("Borrow a courtesy car"));
    await screen.findByRole("radio", { name: "10:00 to 13:00" });
    fireEvent.click(confirmButton());
    const heading = await screen.findByText(
      "Sorry, no courtesy car is free from 10:00 to 13:00 any more.",
    );
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(
      screen.getByText(
        "Another customer took the last one a moment before you. Nothing was booked for you. You can still book 10:00 and wait or drop the car off, or pick a time when a courtesy car is free.",
      ),
    ).toBeTruthy();
    const group = screen.getByRole("radiogroup", {
      name: "Closest times with a courtesy car",
    });
    expect(within(group).getAllByRole("radio")).toHaveLength(5);
    const car = radio(/^Borrow a courtesy car\s*Not available at this time$/);
    expect(car.disabled).toBe(true);
    expect(car.checked).toBe(false);
    // The time is still free to wait: it stays chosen and is not struck through.
    expect(radio("10:00 to 13:00").checked).toBe(true);
    expect(screen.queryByText("Just taken")).toBeNull();
    expect(posts(api)).toHaveLength(1);
  });
});

describe("book-confirmed", () => {
  const appointment = {
    id: "ap-1",
    dealershipId: "d-leeds",
    timeZone: "Europe/London",
    customerId: "c-aisha",
    vehicleId: "v-focus",
    serviceTypeId: "s-full",
    technicianId: "t-1",
    serviceBayId: "b-1",
    courtesyCarId: null,
    transport: "drop_off",
    start: "2026-10-30T10:00:00Z",
    end: "2026-10-30T13:00:00Z",
    status: "confirmed",
    flags: [],
    version: 1,
    createdAt: "2026-10-28T10:40:00Z",
    updatedAt: "2026-10-28T10:40:00Z",
    cancelledAt: null,
    display: {
      serviceTypeName: "Full service",
      vehicle: { registration: "AB12 CDE", make: "Ford", model: "Focus" },
    },
  };

  it("REQ-BOOK-003.AC-1, 010.AC-1, 013.AC-1: says You are booked with the time, the facts, the car choice and what happens next, and no bay", async () => {
    open(
      "/book/confirmed/ap-1",
      bookingApi({ "GET /appointments/ap-1": () => json(appointment) }),
    );
    await screen.findByRole("heading", { level: 1, name: "You are booked" });
    expect(screen.getByText("Fri 30 Oct, 10:00 to 13:00")).toBeTruthy();
    expect(screen.getByText("You will drop it off")).toBeTruthy();
    expect(screen.getByText("Full service, about 3 hours")).toBeTruthy();
    expect(screen.queryByText("Service bay")).toBeNull();
    expect(
      screen.getByText(
        /We will send you a confirmation now, and a reminder on the morning of your appointment, at 08:00 on Fri 30 Oct\./,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /online until 08:00 on Fri 30 Oct, which is 2 hours before it starts/,
      ),
    ).toBeTruthy();
    expect(
      screen
        .getAllByRole("link", { name: /\+44 113 496 0123/ })[0]!
        .getAttribute("href"),
    ).toMatch(/^tel:/);
  });

  it("D-0001-26 C: shows a Technician row only when the API sends the name (it hides it from customers until Q-0001-208 is answered)", async () => {
    open(
      "/book/confirmed/ap-1",
      bookingApi({ "GET /appointments/ap-1": () => json(appointment) }),
    );
    await screen.findByRole("heading", { level: 1, name: "You are booked" });
    expect(screen.queryByText("Technician")).toBeNull();
    cleanup();
    open(
      "/book/confirmed/ap-1",
      bookingApi({
        "GET /appointments/ap-1": () =>
          json({
            ...appointment,
            display: { ...appointment.display, technicianName: "Sam Patel" },
          }),
      }),
    );
    await screen.findByRole("heading", { level: 1, name: "You are booked" });
    expect(screen.getByText("Technician")).toBeTruthy();
    expect(screen.getByText("Sam Patel")).toBeTruthy();
    expect(screen.queryByText("Service bay")).toBeNull();
  });

  it("not-found and error states", async () => {
    open(
      "/book/confirmed/nope",
      bookingApi({ "GET /appointments/nope": () => problem(404, "NOT_FOUND") }),
    );
    await screen.findByRole("heading", {
      name: "We cannot find that appointment.",
    });
    cleanup();
    open(
      "/book/confirmed/ap-2",
      bookingApi({ "GET /appointments/ap-2": () => problem(500, "INTERNAL") }),
    );
    await screen.findByRole("heading", {
      name: "We could not show your confirmation.",
    });
    const buttons = screen
      .getAllByRole("link")
      .concat(screen.getAllByRole("button"));
    expect(buttons.map((b) => b.textContent)).toEqual(
      expect.arrayContaining(["Open my appointments", "Try again"]),
    );
  });
});

// Warn early (D-0001-107 C): the chosen time is checked again before Confirm, with the existing availability check.
describe("book: warn early when the chosen time is taken", () => {
  type Check = { start: string; transport: string };
  const free = (body: Check) =>
    json({
      available: true,
      technicianId: "t-1",
      serviceBayId: "b-1",
      courtesyCarId: body.transport === "courtesy_car" ? "car-1" : null,
    });
  const taken = (reasons: string[]) =>
    json({
      available: false,
      reasons,
      suggestions: ["10:15", "10:30", "10:45", "11:00", "11:15", "11:30"].map(
        (t) => ({
          start: at("2026-10-30", t),
          end: new Date(Date.parse(at("2026-10-30", t)) + 3 * 3_600_000)
            .toISOString()
            .replace(".000Z", "Z"),
        }),
      ),
    });
  /** Answers each check with `answer`, and keeps the checks asked with the chosen car choice (`wait`). */
  function checks(
    answer: (body: Check, n: number) => Response | Promise<Response>,
  ) {
    const asked: Check[] = [];
    const handler = async (request: Request) => {
      const body = (await request.clone().json()) as Check;
      if (body.transport !== "courtesy_car") asked.push(body);
      return answer(body, asked.length);
    };
    return { asked, handler };
  }
  // The checks' 30 seconds are fake; waiting for an answer uses the real (unfaked) setTimeout.
  const settle = async () => {
    await act(async () => {
      for (let i = 0; i < 20; i += 1)
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };
  const tick = async (ms: number) => {
    await act(async () => {
      vi.advanceTimersByTime(ms);
      await Promise.resolve();
    });
  };
  const setVisibility = (state: "visible" | "hidden") => {
    Object.defineProperty(document, "visibilityState", {
      value: state,
      configurable: true,
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
  };
  async function chooseAll(car = "Wait on site") {
    await chooseCar();
    fireEvent.click(await screen.findByRole("radio", { name: /^Fri 30 Oct/ }));
    await chooseTime("10:00 to 13:00");
    const choice = radio(car);
    fireEvent.click(choice);
    choice.focus();
    return choice;
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    setVisibility("visible");
  });

  it("D-0001-107: choosing a time sends one check; it repeats every 30 seconds while the tab is visible, stops while hidden, runs once on return, and stops when the page is left", async () => {
    const check = checks((body) => free(body));
    const view = render(
      <App
        baseUrl={base}
        fetch={
          bookingApi({ "POST /availability-checks": check.handler }).fetcher
        }
        initialEntries={[deepLink]}
      />,
    );
    await chooseAll();
    await settle();
    expect(check.asked).toHaveLength(1);
    expect(check.asked[0]).toMatchObject({
      dealershipId: "d-leeds",
      serviceTypeId: "s-full",
      start: at("2026-10-30", "10:00"),
      transport: "wait",
    });
    await tick(29_000);
    expect(check.asked).toHaveLength(1);
    await tick(1_000);
    await settle();
    expect(check.asked).toHaveLength(2);
    await tick(30_000);
    await settle();
    expect(check.asked).toHaveLength(3);
    setVisibility("hidden");
    await tick(90_000);
    expect(check.asked).toHaveLength(3);
    setVisibility("visible");
    await settle();
    expect(check.asked).toHaveLength(4);
    await tick(30_000);
    await settle();
    expect(check.asked).toHaveLength(5);
    view.unmount();
    await tick(90_000);
    expect(check.asked).toHaveLength(5);
  });

  it("D-0001-107, REQ-BOOK-009.AC-2: a taken time shows the conflict apology before Confirm, keeps focus where it was, says it in a polite live region, and stops checking once the time is cleared", async () => {
    const check = checks((body, n) =>
      n === 1 ? free(body) : taken(["TECHNICIAN_BUSY"]),
    );
    const api = open(
      deepLink,
      bookingApi({ "POST /availability-checks": check.handler }),
    );
    const choice = await chooseAll();
    await settle();
    expect(check.asked).toHaveLength(1);
    await tick(30_000);
    const heading = await screen.findByRole("heading", {
      name: "Sorry, 10:00 on Fri 30 Oct was just taken.",
    });
    expect(document.activeElement).toBe(choice);
    expect(heading.getAttribute("tabindex")).toBeNull();
    const live = screen
      .getAllByRole("status")
      .find(
        (s) => s.textContent === "Sorry, 10:00 on Fri 30 Oct was just taken.",
      );
    expect(live).toBeTruthy();
    expect(live!.getAttribute("aria-live") ?? "polite").toBe("polite");
    expect(
      screen.getAllByRole("button", { name: "Pick a new time to confirm" }),
    ).toHaveLength(1);
    expect(
      within(
        screen.getByRole("radiogroup", { name: "Closest to your time" }),
      ).getAllByRole("radio").length,
    ).toBeLessThanOrEqual(5);
    expect(selectButton(/^Car/).getAttribute("data-value")).toBe("v-focus");
    expect(radio("Wait on site").checked).toBe(true);
    expect(screen.getByText("Just taken")).toBeTruthy();
    expect(posts(api)).toHaveLength(0);
    await tick(90_000);
    expect(check.asked).toHaveLength(2);
  });

  it("D-0001-107, D-0001-104 5: when only the courtesy car went, the page shows conflict-courtesy, not the general apology", async () => {
    const check = checks((body) => free(body));
    let carGone = false;
    const handler = async (request: Request) => {
      const body = (await request.clone().json()) as Check;
      if (body.transport === "courtesy_car" && carGone)
        return taken(["COURTESY_CAR_BUSY"]);
      return check.handler(request);
    };
    open(deepLink, bookingApi({ "POST /availability-checks": handler }));
    const choice = await chooseAll("Borrow a courtesy car");
    await waitFor(() =>
      expect(radio("Borrow a courtesy car").checked).toBe(true),
    );
    carGone = true;
    await tick(30_000);
    await screen.findByRole("heading", {
      name: "Sorry, no courtesy car is free from 10:00 to 13:00 any more.",
    });
    expect(screen.queryByText(/was just taken/)).toBeNull();
    // The focused courtesy option went grey: focus moves to the car choice that can still be chosen.
    expect(choice.disabled).toBe(true);
    expect(document.activeElement).toBe(radio("Wait on site"));
    expect(
      within(
        screen.getByRole("radiogroup", {
          name: "Closest times with a courtesy car",
        }),
      ).getAllByRole("radio"),
    ).toHaveLength(5);
    expect(radio("10:00 to 13:00").checked).toBe(true);
    expect(
      radio(/^Borrow a courtesy car\s*Not available at this time$/).checked,
    ).toBe(false);
  });

  it("D-0001-107, WCAG 2.4.3: when the chosen chip itself had focus and is struck through, focus goes to another time of the same group, not to the page", async () => {
    const check = checks((body, n) =>
      n === 1 ? free(body) : taken(["TECHNICIAN_BUSY"]),
    );
    open(deepLink, bookingApi({ "POST /availability-checks": check.handler }));
    await chooseAll();
    radio("10:00 to 13:00").focus();
    await settle();
    await tick(30_000);
    await screen.findByRole("heading", {
      name: "Sorry, 10:00 on Fri 30 Oct was just taken.",
    });
    expect(radio("10:00, just taken").disabled).toBe(true);
    const now = document.activeElement as HTMLInputElement;
    expect(now.type).toBe("radio");
    expect(now.name).toBe("start");
    expect(now.disabled).toBe(false);
  });

  it("D-0001-107: a failed check and a slow check show nothing new, and Confirm still books with its own check", async () => {
    const check = checks((body, n) =>
      n === 1
        ? problem(500, "INTERNAL")
        : new Promise<Response>(() => {
            // Never answers: a slow check.
          }),
    );
    const api = open(
      deepLink,
      bookingApi({
        "POST /availability-checks": check.handler,
        "POST /appointments": () => problem(500, "INTERNAL"),
      }),
    );
    await chooseAll();
    await settle();
    expect(check.asked).toHaveLength(1);
    await tick(30_000);
    await settle();
    expect(check.asked).toHaveLength(2);
    // A slow check is not piled on.
    await tick(30_000);
    expect(check.asked).toHaveLength(2);
    expect(screen.queryByText(/was just taken/)).toBeNull();
    expect(screen.queryByText("Something went wrong on our side.")).toBeNull();
    expect(confirmButton()).toHaveProperty("disabled", false);
    fireEvent.click(confirmButton());
    await waitFor(() => expect(posts(api)).toHaveLength(1));
  });
});
