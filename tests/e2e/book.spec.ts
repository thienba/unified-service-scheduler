// The customer's booking and its confirmation in a real browser (C2; REQ-BOOK-001, 002, 003, 007, 009, 010, 011,
// SEC-6, SEC-7, SEC-12, NFR-4, NFR-7). The clock is fixed at Wed 28 Oct 2026, 10:40 in London, so the days and
// times are the same on every run. States are reached by real use of the app and its mock API; the few that real
// use cannot cause on one page (a 500, no answer, a slow answer, a stale count) are faked in the test's own
// `fetch` wrapper (D-0001-58). With EVIDENCE_DIR set, each state is saved as a screenshot there (D-0000-13);
// with VIDEO_DIR set, the video test saves the main flow there.
import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import {
  expectNoAxeViolations,
  expectNoSidewaysScroll,
  interceptApi,
  openApp,
  pickRole,
  problemBody,
  widths,
} from "./support";

const NOW = new Date("2026-10-28T10:40:00Z");
const LONDON = "dealership-london";
const NAME = "Fakeford Motors (demo)";
const DEEP = `/book?dealership=${LONDON}&service=service-full`;

/** Opens the app as Customer A at a fixed time, then the given address. */
async function start(page: Page, width: number, address: string, now = NOW) {
  await page.setViewportSize({ width, height: 900 });
  await page.clock.setFixedTime(now);
  await openApp(page);
  await pickRole(page, "Customer");
  await page.goto(address);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

async function shot(page: Page, state: string, screen = "book") {
  await expectNoAxeViolations(page);
  await expectNoSidewaysScroll(page);
  const dir = process.env["EVIDENCE_DIR"];
  if (!dir) return;
  mkdirSync(path.join(dir, "shots"), { recursive: true });
  const width = page.viewportSize()?.width ?? 0;
  await page.screenshot({
    path: path.join(dir, "shots", `${screen}-${state}-${width}.png`),
    fullPage: true,
  });
}

const day = (page: Page, label: string) =>
  page.getByRole("radio", { name: new RegExp(`^${label},`) });
const chip = (page: Page, name: string) =>
  page.getByRole("radio", { name, exact: true });
const confirm = (page: Page) =>
  page.getByRole("button", { name: "Confirm booking" });

/** Car, Fri 30 Oct, the start, and what happens to the car. */
async function chooseAll(
  page: Page,
  time = "10:00 to 13:00",
  date = "Fri 30 Oct",
  car = "Wait on site",
) {
  await page.getByRole("combobox", { name: /^Car/ }).selectOption("vehicle-a");
  await day(page, date).check();
  await chip(page, time).check();
  await page.getByRole("radio", { name: car }).check();
}

/** Calls the API from inside the page, as a screen would. */
function api(
  page: Page,
  url: string,
  user: string,
  method = "GET",
  body?: unknown,
) {
  return page.evaluate(
    async ({ url, user, method, body }) => {
      const response = await fetch(`/api${url}`, {
        method,
        headers: {
          "X-Demo-User": user,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: response.status, body: await response.json() };
    },
    { url, user, method, body },
  );
}

/** From the `from`-th call to `path` (with `query` in its address) on, answers `status` with `body` (D-0001-58). */
async function answerFrom(
  page: Page | BrowserContext,
  rule: {
    path: string;
    query?: string;
    from: number;
    status: number;
    body: unknown;
  },
) {
  await page.addInitScript((r) => {
    const original = window.fetch.bind(window);
    let count = 0;
    window.fetch = async (input, init) => {
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        location.href,
      );
      if (!url.pathname.endsWith(r.path) || !url.search.includes(r.query ?? ""))
        return original(input, init);
      count += 1;
      if (count < r.from) return original(input, init);
      return new Response(JSON.stringify(r.body), {
        status: r.status,
        headers: {
          "Content-Type": "application/json",
          "X-Trace-Id": "4bf92f35a1b2c3d4e5f60718293a4b5c",
        },
      });
    };
  }, rule);
}

/** The Idempotency-Key of every booking POST, kept by a wrapper the test adds; the first one fails with a 500. */
async function failFirstBooking(page: Page) {
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    const keys: string[] = [];
    (window as unknown as { bookingKeys: string[] }).bookingKeys = keys;
    window.fetch = async (input, init) => {
      const request =
        input instanceof Request ? input : new Request(input, init);
      if (
        request.method === "POST" &&
        new URL(request.url).pathname.endsWith("/appointments")
      ) {
        keys.push(request.headers.get("Idempotency-Key") ?? "");
        if (keys.length === 1)
          return new Response(
            JSON.stringify({
              type: "about:blank",
              title: "INTERNAL",
              status: 500,
              code: "INTERNAL",
              traceId: "4bf92f35a1b2c3d4e5f60718293a4b5c",
            }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
      }
      return original(request);
    };
  });
}

const fri = (hhmm: string) => `2026-10-30T${hhmm}:00Z`;

for (const width of [390, 1440]) {
  test.describe(`at ${width} wide`, () => {
    test("idle, deep-link, time-chosen, then a booking and its confirmation (success, reload)", async ({
      page,
    }) => {
      await start(page, width, "/book");
      await expect(
        page.getByRole("heading", { level: 1, name: "Book a service" }),
      ).toBeVisible();
      for (const label of [
        "Dealership (required)",
        "Car (required)",
        "Service (required)",
      ])
        await expect(page.getByText(label, { exact: true })).toBeVisible();
      await expect(
        page.getByText(
          "Pick a dealership, a car and a service above. Then we show which days have room.",
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Pick a time to confirm" }),
      ).toHaveCount(1);
      await shot(page, "idle");

      await page.goto(DEEP);
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Choose a time for your full service",
        }),
      ).toBeVisible();
      await expect(
        page.getByText(
          "The dealership and the service were filled in from the dealer's website. Change them if you need to.",
        ),
      ).toBeVisible();
      // The first day with times is chosen: today, afternoon only (the notice time).
      await expect(day(page, "Wed 28 Oct")).toBeChecked();
      await expect(day(page, "Sun 1 Nov")).toHaveAccessibleName(
        "Sun 1 Nov, Closed",
      );
      await expect(day(page, "Sun 1 Nov")).toBeDisabled();
      await expect(
        page.getByRole("status").filter({ hasText: /times? on Wed 28 Oct/ }),
      ).toHaveText(/^\d+ times? on Wed 28 Oct$/);
      await expect(
        page.getByRole("heading", { name: /^Afternoon · \d+ times?$/ }),
      ).toBeVisible();
      await expect(page.getByRole("heading", { name: /^Morning/ })).toHaveCount(
        0,
      );
      // REQ-BOOK-011.AC-1: nothing earlier than now plus 2 hours.
      await expect(
        page
          .getByRole("radiogroup", { name: /^Afternoon/ })
          .getByRole("radio")
          .first(),
      ).toHaveAccessibleName("12:45 to 15:45");
      await expect(
        page.getByRole("button", { name: "Previous week" }),
      ).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "Previous week" }),
      ).toHaveAttribute("title", "You cannot book a day that has passed");
      // The reason also reaches screen readers, not only a mouse hover (design.md 8.7).
      await expect(
        page.getByRole("button", { name: "Previous week" }),
      ).toHaveAccessibleDescription("You cannot book a day that has passed");
      await shot(page, "deep-link");

      await chooseAll(page);
      await expect(
        page.getByRole("status").filter({ hasText: /on Fri 30 Oct/ }),
      ).toHaveText(/^\d+ times on Fri 30 Oct$/);
      await expect(chip(page, "10:00 to 13:00")).toBeChecked();
      await expect(
        page.getByText("10:00", { exact: true }).first(),
      ).toBeVisible();
      await expect(
        page.getByText("Fri 30 Oct, 10:00 to 13:00").first(),
      ).toBeVisible();
      // One Confirm in the page, wherever it is drawn (design.md 8.9).
      await expect(confirm(page)).toHaveCount(1);
      await expect(confirm(page)).toBeEnabled();
      await shot(page, "time-chosen");

      const posts: string[] = [];
      page.on("request", (r) => {
        if (r.method() === "POST" && r.url().endsWith("/api/appointments"))
          posts.push(r.postData() ?? "");
      });
      await confirm(page).click();
      await expect(page).toHaveURL(/\/book\/confirmed\/[^/]+$/);
      await expect(
        page.getByRole("heading", { level: 1, name: "You are booked" }),
      ).toBeVisible();
      expect(posts).toHaveLength(1);
      expect(JSON.parse(posts[0]!)).toEqual({
        dealershipId: LONDON,
        serviceTypeId: "service-full",
        vehicleId: "vehicle-a",
        start: fri("10:00"),
        transport: "wait",
      });
      await expect(page.getByText("Fri 30 Oct, 10:00 to 13:00")).toBeVisible();
      await expect(page.getByText("You will wait on site")).toBeVisible();
      await expect(page.getByText("Full service, about 3 hours")).toBeVisible();
      await expect(page.getByText("Service bay")).toHaveCount(0);
      // D-0001-71: the owner sees the technician's name.
      await expect(page.getByText("Technician", { exact: true })).toBeVisible();
      await expect(page.getByText(/^Demo Tech /)).toBeVisible();
      await expect(
        page.getByText(
          /We will send you a confirmation now, and a reminder on the morning of your appointment, at 08:00 on Fri 30 Oct\./,
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "change or cancel this appointment" }),
      ).toBeVisible();
      await expect(
        page.getByRole("main").getByRole("link", { name: /\+44 1632 960 123/ }),
      ).toHaveAttribute("href", /^tel:/);
      await shot(page, "success", "book-confirmed");

      // REQ-BOOK-003.AC-2: a reload shows the same appointment, and it is in the customer's list.
      const id = page.url().split("/").pop()!;
      await page.reload();
      await expect(
        page.getByRole("heading", { level: 1, name: "You are booked" }),
      ).toBeVisible();
      await expect(page.getByText("Fri 30 Oct, 10:00 to 13:00")).toBeVisible();
      const mine = await api(page, "/appointments", "user-customer-a");
      expect(mine.body.map((a: { id: string }) => a.id)).toContain(id);

      // D-0001-71: the appointment page has the Technician row too, and still no bay.
      await page.goto(`/appointments/${id}`);
      await expect(page.getByText("Technician", { exact: true })).toBeVisible();
      await expect(page.getByText(/^Demo Tech /)).toBeVisible();
      await expect(page.getByText("Service bay")).toHaveCount(0);
      await shot(page, "technician-row", "appointment-customer");
    });

    test("confirming: a double press sends one request with one key and books once", async ({
      page,
    }) => {
      await interceptApi(page, { path: "/appointments", delayMs: 2500 });
      await start(page, width, DEEP);
      await chooseAll(page);
      const keys: string[] = [];
      page.on("request", (r) => {
        if (r.method() === "POST" && r.url().endsWith("/api/appointments"))
          keys.push(r.headers()["idempotency-key"] ?? "");
      });
      await confirm(page).click();
      const busy = page.getByRole("button", { name: /Confirming…/ });
      await expect(busy).toBeVisible();
      await busy.click({ force: true });
      await shot(page, "confirming");
      await expect(
        page.getByRole("heading", { level: 1, name: "You are booked" }),
      ).toBeVisible();
      expect(keys).toHaveLength(1);
      const mine = await api(page, "/appointments", "user-customer-a");
      expect(
        mine.body.filter((a: { start: string }) => a.start === fri("10:00")),
      ).toHaveLength(1);
    });

    test("validation: Confirm with the car and the car choice missing sends nothing and lists both", async ({
      page,
    }) => {
      await start(page, width, DEEP);
      await chip(page, "13:00 to 16:00").check();
      let posted = 0;
      page.on("request", (r) => {
        if (r.method() === "POST") posted += 1;
      });
      await confirm(page).click();
      const heading = page.getByText(
        "2 things need fixing before we can book this.",
      );
      await expect(heading).toBeFocused();
      await expect(
        page.getByRole("link", { name: "Car: choose which car is coming in." }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", {
          name: "What you will do with the car: choose one.",
        }),
      ).toBeVisible();
      await expect(
        page.getByText("Car is missing. Choose which car is coming in."),
      ).toBeVisible();
      await expect(
        page.getByText("Choose what you will do with the car."),
      ).toBeVisible();
      await expect(chip(page, "13:00 to 16:00")).toBeChecked();
      expect(posted).toBe(0);
      await shot(page, "validation");
    });

    test("no-vehicle: a customer with no car sees the info Alert and no strip", async ({
      page,
    }) => {
      await interceptApi(page, { path: "/vehicles", status: 200, body: [] });
      await start(page, width, DEEP);
      await expect(
        page.getByText("There is no car on your account yet."),
      ).toBeVisible();
      await expect(
        page.getByRole("main").getByRole("link", { name: /\+44 1632 960 123/ }),
      ).toBeVisible();
      await expect(
        page.getByRole("radiogroup", { name: "Choose a day" }),
      ).toHaveCount(0);
      await shot(page, "no-vehicle");
    });

    test("empty-day: a stale count; the day turns Fully booked and offers the closest times on other days", async ({
      page,
    }) => {
      await answerFrom(page, {
        path: "/availability",
        query: "date=2026-10-30",
        from: 2,
        status: 200,
        body: {
          date: "2026-10-30",
          timeZone: "Europe/London",
          gridMinutes: 15,
          slots: [],
        },
      });
      await answerFrom(page, {
        path: "/availability-checks",
        from: 1,
        status: 200,
        body: {
          available: false,
          reasons: ["TECHNICIAN_BUSY"],
          suggestions: [
            // Nearest first, as the API sends them.
            { start: "2026-10-29T13:00:00Z", end: "2026-10-29T16:00:00Z" },
            { start: "2026-10-31T09:00:00Z", end: "2026-10-31T12:00:00Z" },
            { start: "2026-11-02T08:00:00Z", end: "2026-11-02T11:00:00Z" },
          ],
        },
      });
      await start(page, width, DEEP);
      await expect(day(page, "Fri 30 Oct")).toHaveAccessibleName(/times$/);
      // A click, not check(): the fresh answer turns the day Fully booked (not checked), and check() fails
      // when that answer lands before it reads the radio back. The lines below wait for the outcome.
      await day(page, "Fri 30 Oct").click();
      await expect(
        page.getByRole("heading", { name: "No times left on Fri 30 Oct." }),
      ).toBeVisible();
      await expect(day(page, "Fri 30 Oct")).toHaveAccessibleName(
        "Fri 30 Oct, Fully booked",
      );
      await expect(
        page.getByText(
          "Someone booked the last one a moment ago. These are the closest times on other days:",
        ),
      ).toBeVisible();
      await expect(page.getByText("Sat 31 Oct · ends 12:00")).toBeVisible();
      await shot(page, "empty-day");
      // A suggestion moves the strip to its day, selects it in the grid and fills the summary.
      await page
        .getByRole("radio", { name: "Sat 31 Oct, 09:00 to 12:00" })
        .click();
      await expect(day(page, "Sat 31 Oct")).toBeChecked();
      await expect(chip(page, "09:00 to 12:00")).toBeChecked();
      await expect(
        page.getByText("Sat 31 Oct, 09:00 to 12:00").first(),
      ).toBeVisible();
    });

    test("closed-day, day-too-soon and day-too-far: a link to a day that cannot be booked says why", async ({
      page,
      context,
    }) => {
      await start(page, width, `${DEEP}&date=2026-11-01`);
      await expect(
        page.getByText(`${NAME} is closed on Sun 1 Nov.`),
      ).toBeVisible();
      await expect(
        page.getByText(
          "The link you followed points at a day when the dealership is closed. These are the closest days with times:",
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /^Sat 31 Oct · \d+ times?$/ }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /^Mon 2 Nov · \d+ times?$/ }),
      ).toBeVisible();
      await expect(
        page.getByText("Pick a day above to see the start times."),
      ).toBeVisible();
      await shot(page, "closed-day");
      await page.getByRole("button", { name: /^Mon 2 Nov/ }).click();
      await expect(day(page, "Mon 2 Nov")).toBeChecked();

      await page.goto(`${DEEP}&date=2026-11-30`);
      await expect(
        page.getByText("Mon 30 Nov is too far ahead."),
      ).toBeVisible();
      await expect(
        page.getByText(
          "Bookings open up to 30 days ahead, so the last day you can pick is Fri 27 Nov.",
        ),
      ).toBeVisible();
      await expect(day(page, "Sat 28 Nov")).toHaveAccessibleName(
        "Sat 28 Nov, Too far ahead",
      );
      await expect(day(page, "Sat 28 Nov")).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "Next week" }),
      ).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "Next week" }),
      ).toHaveAttribute("title", "Bookings open up to 30 days ahead");
      // The reason also reaches screen readers, not only a mouse hover (design.md 8.7).
      await expect(
        page.getByRole("button", { name: "Next week" }),
      ).toHaveAccessibleDescription("Bookings open up to 30 days ahead");
      await shot(page, "day-too-far");

      const late = await context.newPage();
      await late.setViewportSize({ width, height: 900 });
      await late.clock.setFixedTime(new Date("2026-10-28T16:10:00Z"));
      await late.goto(`${DEEP}&date=2026-10-28`);
      await expect(
        late.getByText("Wed 28 Oct is too soon to book."),
      ).toBeVisible();
      await expect(
        late.getByText(
          "It is 16:10 in London and bookings need at least 2 hours' notice, so there is no time left today. The next day with times is Thu 29 Oct.",
        ),
      ).toBeVisible();
      await expect(day(late, "Wed 28 Oct")).toHaveAccessibleName(
        "Wed 28 Oct, Too soon",
      );
      await shot(late, "day-too-soon");
    });

    test("conflict: two pages pick the same time; the second gets the apology and only one appointment exists", async ({
      page,
      context,
    }) => {
      await start(page, width, DEEP);
      const other = await context.newPage();
      await other.setViewportSize({ width, height: 900 });
      await other.clock.setFixedTime(NOW);
      await other.goto(DEEP);
      await chooseAll(page);
      await chooseAll(other);
      const before = await day(other, "Fri 30 Oct").getAttribute("aria-label");
      await confirm(page).click();
      await expect(
        page.getByRole("heading", { level: 1, name: "You are booked" }),
      ).toBeVisible();

      await confirm(other).click();
      const heading = other.getByText(
        "Sorry, 10:00 on Fri 30 Oct was just taken.",
      );
      await expect(heading).toBeFocused();
      await expect(
        other.getByText(
          "Another customer confirmed that time a moment before you. Nothing was booked for you. We kept your car, service and choice, so you only need a new time.",
        ),
      ).toBeVisible();
      await expect(
        other.getByRole("radio", { name: "10:00, just taken" }),
      ).toBeDisabled();
      await expect(
        other.getByText("Just taken", { exact: true }),
      ).toBeVisible();
      await expect(
        other.getByRole("button", { name: "Pick a new time to confirm" }),
      ).toHaveCount(1);
      await expect(other.getByRole("combobox", { name: /^Car/ })).toHaveValue(
        "vehicle-a",
      );
      await expect(
        other.getByRole("radio", { name: "Wait on site" }),
      ).toBeChecked();
      await expect(day(other, "Fri 30 Oct")).toBeChecked();
      await expect(day(other, "Fri 30 Oct")).not.toHaveAttribute(
        "aria-label",
        before!,
      );
      const closest = other.getByRole("radiogroup", {
        name: "Closest to your time",
      });
      const items = closest.getByRole("radio");
      expect(await items.count()).toBeGreaterThan(0);
      expect(await items.count()).toBeLessThanOrEqual(5);
      await expect(closest.getByText(/ends \d\d:\d\d/).first()).toBeVisible();
      await expect(other.getByText(/[A-Z_]{6,}/)).toHaveCount(0);
      await shot(other, "conflict");

      // A suggestion selects the time; it books nothing until Confirm.
      await items.first().check();
      await expect(confirm(other)).toBeEnabled();
      await shot(other, "conflict-suggestion-chosen");
      const mine = await api(other, "/appointments", "user-customer-a");
      expect(
        mine.body.filter((a: { start: string }) => a.start === fri("10:00")),
      ).toHaveLength(1);
    });

    test("conflict-empty: no suggestions; the page says so with the phone", async ({
      page,
    }) => {
      await interceptApi(page, {
        path: "/appointments",
        status: 409,
        body: {
          ...problemBody(409, "SLOT_UNAVAILABLE"),
          reasons: ["BAY_BUSY"],
          suggestions: [],
        },
      });
      await start(page, width, DEEP);
      await chooseAll(page);
      await confirm(page).click();
      await expect(
        page.getByText("Sorry, 10:00 on Fri 30 Oct was just taken."),
      ).toBeFocused();
      await expect(
        page.getByText("There are no other times in the next 14 days."),
      ).toBeVisible();
      await expect(
        page.getByText(`Try another day, or contact ${NAME}.`),
      ).toBeVisible();
      await shot(page, "conflict-empty");
    });

    test("conflict-too-soon: the chosen time slips inside the notice time while the page is open", async ({
      page,
    }) => {
      await start(page, width, DEEP);
      await page
        .getByRole("combobox", { name: /^Car/ })
        .selectOption("vehicle-a");
      await chip(page, "12:45 to 15:45").check();
      await page.getByRole("radio", { name: "Drop it off" }).check();
      await page.clock.setFixedTime(new Date("2026-10-28T11:00:00Z"));
      await confirm(page).click();
      await expect(
        page.getByText("Sorry, 12:45 on Wed 28 Oct is too soon to book."),
      ).toBeFocused();
      await expect(
        page.getByText(
          "Bookings need at least 2 hours' notice, and that time is now less than 2 hours away.",
          { exact: false },
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("radio", { name: "12:45, too soon" }),
      ).toBeDisabled();
      await shot(page, "conflict-too-soon");
    });

    test("conflict-too-far: the manager shortens the horizon; every day beyond it reads Too far ahead", async ({
      page,
    }) => {
      await start(page, width, `${DEEP}&date=2026-11-27`);
      await expect(day(page, "Fri 27 Nov")).toBeChecked();
      await page
        .getByRole("combobox", { name: /^Car/ })
        .selectOption("vehicle-a");
      await page
        .getByRole("radiogroup", { name: /^Morning/ })
        .getByRole("radio")
        .first()
        .check();
      await page.getByRole("radio", { name: "Wait on site" }).check();
      const london = (
        await api(page, `/dealerships/${LONDON}`, "user-manager-london")
      ).body;
      const saved = await api(
        page,
        `/dealerships/${LONDON}/settings`,
        "user-manager-london",
        "PUT",
        {
          weeklyHours: london.weeklyHours,
          dateOverrides: london.dateOverrides,
          policies: {
            ...london.policies,
            horizonDays: 21,
            gridMinutes: undefined,
          },
        },
      );
      expect(saved.status).toBe(200);
      await confirm(page).click();
      await expect(
        page.getByText("Sorry, Fri 27 Nov is further ahead than we can book."),
      ).toBeFocused();
      await expect(
        page.getByText(
          "Bookings now open up to 21 days ahead, which is Wed 18 Nov.",
          { exact: false },
        ),
      ).toBeVisible();
      for (const d of ["Wed 25 Nov", "Fri 27 Nov", "Tue 1 Dec"])
        await expect(day(page, d)).toHaveAccessibleName(`${d}, Too far ahead`);
      await expect(
        page.getByText(
          "These days are further ahead than we can book. Choose one of the closest times above, or go back a week.",
        ),
      ).toBeVisible();
      await shot(page, "conflict-too-far");
    });

    test("confirm-error: a 500 keeps the choices; Try again sends the same key and books once", async ({
      page,
    }) => {
      await failFirstBooking(page);
      await start(page, width, DEEP);
      await chooseAll(page);
      await confirm(page).click();
      await expect(
        page.getByText("Something went wrong on our side."),
      ).toBeFocused();
      await expect(
        page.getByText(
          "Nothing was booked. Your choices are still here. Try again; if it keeps happening, quote reference 4bf92f35.",
        ),
      ).toBeVisible();
      await expect(chip(page, "10:00 to 13:00")).toBeChecked();
      await shot(page, "confirm-error");
      await page.getByRole("button", { name: "Try again" }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: "You are booked" }),
      ).toBeVisible();
      const keys = await page.evaluate(
        () => (window as unknown as { bookingKeys: string[] }).bookingKeys,
      );
      expect(keys).toHaveLength(2);
      expect(keys[1]).toBe(keys[0]);
    });

    test("confirm-error with no network says we could not reach the booking service", async ({
      page,
    }) => {
      await interceptApi(page, { path: "/appointments", networkError: true });
      await start(page, width, DEEP);
      await chooseAll(page);
      await confirm(page).click();
      await expect(
        page.getByText("We could not reach the booking service."),
      ).toBeFocused();
      await expect(
        page.getByText(
          "Nothing was booked. Check your connection and try again. Your choices are still here.",
        ),
      ).toBeVisible();
      await shot(page, "confirm-error-offline");
    });

    test("loading, days-error and times-error", async ({ page, context }) => {
      await interceptApi(page, { path: "/availability", delayMs: 4000 });
      await start(page, width, DEEP);
      await expect(page.getByText("Loading the days and times")).toBeAttached();
      await expect(page.locator("[aria-busy=true]")).toBeVisible();
      await shot(page, "loading");

      const failing = await context.newPage();
      await failing.setViewportSize({ width, height: 900 });
      await failing.clock.setFixedTime(NOW);
      await interceptApi(failing, {
        path: "/availability",
        status: 500,
        body: problemBody(500, "INTERNAL"),
      });
      await failing.goto(DEEP);
      await expect(
        failing.getByRole("heading", { name: "We could not check the days." }),
      ).toBeVisible();
      await expect(
        failing.getByText(
          /Nothing was changed\. Try again; if it keeps happening, quote reference 4bf92f35\./,
        ),
      ).toBeVisible();
      await expect(
        failing.getByRole("button", { name: "Try again" }),
      ).toBeVisible();
      await expect(failing.getByText("4bf92f35").first()).toBeVisible();
      await shot(failing, "days-error");

      const times = await context.newPage();
      await times.setViewportSize({ width, height: 900 });
      await times.clock.setFixedTime(NOW);
      await answerFrom(times, {
        path: "/availability",
        query: "date=2026-10-30",
        from: 2,
        status: 500,
        body: problemBody(500, "INTERNAL"),
      });
      await times.goto(DEEP);
      await day(times, "Fri 30 Oct").check();
      await expect(
        times.getByRole("heading", { name: "We could not load the times." }),
      ).toBeVisible();
      await expect(
        times.getByText(
          /so we cannot show the times for Fri 30 Oct\. Nothing was changed\./,
        ),
      ).toBeVisible();
      await shot(times, "times-error");
    });

    test("no-permission: a booking link for another customer", async ({
      page,
    }) => {
      await start(page, width, "/book?customerId=customer-b");
      await expect(
        page.getByRole("heading", { name: "You cannot do that as Customer." }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Book for myself" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Switch role" }),
      ).toBeVisible();
      await shot(page, "no-permission");
    });

    test("book-confirmed loading, error and not-found", async ({
      page,
      context,
    }) => {
      await start(page, width, DEEP);
      await chooseAll(page, "13:00 to 16:00", "Fri 30 Oct", "Drop it off");
      await confirm(page).click();
      await expect(
        page.getByRole("heading", { level: 1, name: "You are booked" }),
      ).toBeVisible();
      await expect(page.getByText("You will drop it off")).toBeVisible();
      const id = page.url().split("/").pop()!;

      const slow = await context.newPage();
      await slow.setViewportSize({ width, height: 900 });
      await slow.clock.setFixedTime(NOW);
      await interceptApi(slow, { path: `/appointments/${id}`, delayMs: 4000 });
      await slow.goto(`/book/confirmed/${id}`);
      await expect(slow.getByText("Loading your confirmation")).toBeAttached();
      await expect(slow.locator("[aria-busy=true]")).toBeVisible();
      await shot(slow, "loading", "book-confirmed");

      const broken = await context.newPage();
      await broken.setViewportSize({ width, height: 900 });
      await broken.clock.setFixedTime(NOW);
      await interceptApi(broken, {
        path: `/appointments/${id}`,
        status: 500,
        body: problemBody(500, "INTERNAL"),
      });
      await broken.goto(`/book/confirmed/${id}`);
      await expect(
        broken.getByRole("heading", {
          name: "We could not show your confirmation.",
        }),
      ).toBeVisible();
      const actions = broken
        .getByRole("main")
        .getByRole("link", { name: "Open my appointments" });
      await expect(actions).toBeVisible();
      await expect(
        broken.getByRole("button", { name: "Try again" }),
      ).toBeVisible();
      await shot(broken, "error", "book-confirmed");

      await page.goto("/book/confirmed/appointment-that-does-not-exist");
      await expect(
        page.getByRole("heading", { name: "We cannot find that appointment." }),
      ).toBeVisible();
      await shot(page, "not-found", "book-confirmed");
    });
  });
}

test("SEC-12.AC-1: a link with a script as the dealership opens with both fields empty and shows none of it", async ({
  page,
}) => {
  await start(
    page,
    1440,
    "/book?dealership=%3Cscript%3Ex%3C%2Fscript%3E&service=nope",
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "Book a service" }),
  ).toBeVisible();
  await expect(page.getByRole("combobox", { name: /^Dealership/ })).toHaveValue(
    "",
  );
  await expect(page.getByRole("combobox", { name: /^Service/ })).toHaveValue(
    "",
  );
  const html = await page.locator("body").innerHTML();
  expect(html).not.toContain("<script>x");
  expect(html).not.toContain("&lt;script&gt;");
  expect(await page.locator("body").innerText()).not.toContain("script");
  expect(await page.title()).not.toContain("script");
});

test("a staff user without a customer chosen sees the shared no-permission block", async ({
  page,
}) => {
  await page.clock.setFixedTime(NOW);
  await openApp(page);
  await pickRole(page, "Staff");
  await page.goto(DEEP);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page.getByRole("radiogroup", { name: "Choose a day" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Switch role" })).toBeVisible();
});

test("NFR-7: no sideways scroll at any width, 44 px targets, the strip scrolls in its own row, one Confirm", async ({
  page,
}) => {
  await start(page, 1440, DEEP);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await expect(day(page, "Wed 28 Oct")).toBeChecked();
    await expectNoSidewaysScroll(page);
    await expect(
      confirm(page).or(
        page.getByRole("button", { name: "Pick a time to confirm" }),
      ),
    ).toHaveCount(1);
    for (const target of [
      chip(page, "13:00 to 16:00"),
      day(page, "Thu 29 Oct"),
      page.getByRole("radio", { name: "Wait on site" }),
      page.getByRole("button", { name: "Next week" }),
    ]) {
      const box = await target.locator("..").boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
    // From 1024 the one Confirm is in the summary panel and there is no ActionBar.
    await expect(
      page
        .getByRole("complementary", { name: "Your booking" })
        .getByRole("button", { name: /confirm/ }),
    ).toHaveCount(width >= 1024 ? 1 : 0);
  }
  // Phone: chips 2 to 3 across.
  await page.setViewportSize({ width: 390, height: 900 });
  const chips = page
    .getByRole("radiogroup", { name: /^Afternoon/ })
    .locator("label");
  const tops = await chips.evaluateAll((labels) =>
    labels.map((l) => l.getBoundingClientRect().top),
  );
  const firstRow = tops.filter((t) => t === tops[0]).length;
  expect(firstRow).toBeGreaterThanOrEqual(2);
  expect(firstRow).toBeLessThanOrEqual(3);
});

/**
 * Presses Tab (or Shift+Tab) until `target` has focus, at most `max` times, so the test fails if the control is
 * not in the Tab order. At every stop on the way, the focused control is checked to be in view and not behind the
 * phone's ActionBar (NFR-4, design.md 10).
 */
async function tabTo(page: Page, target: Locator, back = false, max = 40) {
  for (let presses = 0; presses < max; presses += 1) {
    await page.keyboard.press(back ? "Shift+Tab" : "Tab");
    await expectFocusClearOfBar(page);
    if (await target.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error(`Not reached with ${max} presses of Tab: ${String(target)}`);
}

/** The focused control is on screen and, unless it sits in the ActionBar itself, wholly above the bar. */
async function expectFocusClearOfBar(page: Page) {
  const place = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    // A radio is drawn by its label; the input itself is a see-through layer over it.
    const drawn = el.closest("label") ?? el;
    const box = drawn.getBoundingClientRect();
    const bar = [...document.querySelectorAll<HTMLElement>(".sticky")].find(
      (b) =>
        getComputedStyle(b).bottom === "0px" &&
        getComputedStyle(b).display !== "none",
    );
    return {
      top: box.top,
      bottom: box.bottom,
      inBar: Boolean(bar?.contains(el)),
      barTop: bar ? bar.getBoundingClientRect().top : window.innerHeight,
    };
  });
  if (!place || place.inBar) return;
  expect(place.top).toBeGreaterThanOrEqual(0);
  expect(place.bottom).toBeLessThanOrEqual(place.barTop + 0.5);
}

const focusedIs = (target: Locator) =>
  expect
    .poll(() => target.evaluate((el) => el === document.activeElement))
    .toBe(true);

test("NFR-4: the whole booking can be done with the keyboard, the error links move focus, and focus is never behind the ActionBar", async ({
  page,
}) => {
  await start(page, 390, DEEP);
  await expect(day(page, "Wed 28 Oct")).toBeChecked();

  // The day strip is one Tab stop; the arrow keys move the day.
  await tabTo(page, day(page, "Wed 28 Oct"));
  await page.keyboard.press("ArrowRight");
  await expect(day(page, "Thu 29 Oct")).toBeChecked();

  // The times are one Tab stop per group; Space chooses.
  await page.keyboard.press("Tab");
  await expectFocusClearOfBar(page);
  const firstChip = page.locator(":focus");
  await expect(firstChip).toHaveAttribute("name", "start");
  await expect(firstChip).toHaveAccessibleName(/^\d\d:\d\d to \d\d:\d\d$/);
  await page.keyboard.press("Space");
  await expect(firstChip).toBeChecked();

  // Confirm with the car and the car choice missing: the Alert takes focus and links to each field.
  await tabTo(page, confirm(page));
  await page.keyboard.press("Enter");
  const alert = page.getByRole("heading", {
    name: "2 things need fixing before we can book this.",
  });
  await focusedIs(alert);
  const carLink = page.getByRole("link", {
    name: "Car: choose which car is coming in.",
  });
  await tabTo(page, carLink);
  await page.keyboard.press("Enter");
  const car = page.getByRole("combobox", { name: /^Car/ });
  await focusedIs(car);
  // A closed select takes the first letters of an option as typed.
  await page.keyboard.type("Demo");
  await expect(car).not.toHaveValue("");

  const choiceLink = page.getByRole("link", {
    name: "What you will do with the car: choose one.",
  });
  await tabTo(page, choiceLink, true);
  await page.keyboard.press("Enter");
  const wait = page.getByRole("radio", { name: "Wait on site" });
  await focusedIs(wait);
  await expectFocusClearOfBar(page);
  await page.keyboard.press("Space");
  await expect(wait).toBeChecked();
  // The arrow keys move inside the car choice; the last option is still above the bar.
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("radio", { name: "Drop it off" })).toBeChecked();
  await expectFocusClearOfBar(page);

  await tabTo(page, confirm(page));
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { level: 1, name: "You are booked" }),
  ).toBeVisible();
  await expect(page.getByText("You will drop it off")).toBeVisible();
});

test("video: a customer books end to end, then a second page gets the just-taken apology", async ({
  browser,
}) => {
  const dir = process.env["VIDEO_DIR"];
  test.skip(!dir, "VIDEO_DIR is not set");
  test.setTimeout(120_000);
  const size = { width: 1280, height: 800 };
  const context = await browser.newContext({
    viewport: size,
    recordVideo: { dir: dir!, size },
  });
  const slow = (page: Page) => page.waitForTimeout(900);
  const first = await context.newPage();
  await first.clock.setFixedTime(NOW);
  await openApp(first);
  await pickRole(first, "Customer");
  await first.goto(DEEP);
  await expect(day(first, "Wed 28 Oct")).toBeChecked();
  const second = await context.newPage();
  await second.clock.setFixedTime(NOW);
  await second.goto(DEEP);
  await expect(day(second, "Wed 28 Oct")).toBeChecked();
  // Both pages see 10:00 on Fri 30 Oct as free; the first confirms, then the second.
  for (const page of [first, second]) {
    await page.bringToFront();
    await slow(page);
    await page
      .getByRole("combobox", { name: /^Car/ })
      .selectOption("vehicle-a");
    await slow(page);
    await day(page, "Fri 30 Oct").check();
    await slow(page);
    await chip(page, "10:00 to 13:00").check();
    await slow(page);
    await page.getByRole("radio", { name: "Wait on site" }).check();
    await slow(page);
  }
  await first.bringToFront();
  await confirm(first).click();
  await expect(
    first.getByRole("heading", { level: 1, name: "You are booked" }),
  ).toBeVisible();
  await first.waitForTimeout(2500);
  await second.bringToFront();
  await confirm(second).click();
  await expect(
    second.getByText("Sorry, 10:00 on Fri 30 Oct was just taken."),
  ).toBeVisible();
  await second.waitForTimeout(2500);
  await second
    .getByRole("radiogroup", { name: "Closest to your time" })
    .getByRole("radio")
    .first()
    .check();
  await second.waitForTimeout(2000);
  await context.close();
});
