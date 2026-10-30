// Staff (and the manager) book for an existing or a new customer in a real browser (C4; REQ-BOOK-014, 001,
// 009, 010, D-0001-20, -29, -30, -31, -53, SEC-4, SEC-6, SEC-10, SEC-11, SEC-13, NFR-4, NFR-7). The clock is
// fixed at Wed 28 Oct 2026, 10:40 in London, so the days are the same on every run whatever today is. States
// are reached by real use of the screens and the mock API; the few that real use cannot cause on one page (a
// 500, a slow answer, a customer with no vehicle, a stale count) are faked in the page's `fetch` (D-0001-64).
// With EVIDENCE_DIR set each state is saved as a screenshot; with VIDEO_DIR set the video test runs.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page, type Request } from "@playwright/test";
import {
  LONDON,
  MANAGER,
  STAFF,
  api,
  book,
  changeShift,
} from "./schedule-data";
import {
  expectNoAxeViolations,
  expectNoSidewaysScroll,
  interceptApi,
  openApp,
  pickRole,
  problemBody,
  widths,
  chooseOption,
  selectNamed,
} from "./support";

const NOW = new Date("2026-10-28T10:40:00Z");
const BEFORE = new Date("2026-10-26T07:00:00Z");
const BIRCH = "tech-lon-birch";
const MARTA = "Marta Kowalska";

async function shot(page: Page, screen: string, state: string) {
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

/** Opens the app as a role at a fixed time, then the address. `seed` runs first, two days earlier. */
async function start(
  page: Page,
  width: number,
  address: string,
  options: {
    role?: "Staff" | "Manager" | "Customer";
    seed?: (page: Page) => Promise<void>;
    /** Fakes in the page's `fetch`, added after the seed so the seed itself goes through. */
    intercept?: (page: Page) => Promise<unknown>;
  } = {},
) {
  await page.setViewportSize({ width, height: 900 });
  if (options.seed) {
    await page.clock.setFixedTime(BEFORE);
    await openApp(page);
    await options.seed(page);
  }
  if (options.intercept) await options.intercept(page);
  await page.clock.setFixedTime(NOW);
  await openApp(page);
  await pickRole(page, options.role ?? "Staff");
  // Customer A is already in use on a first visit, so no toast was shown for it.
  const dismiss = page.getByRole("button", { name: "Dismiss" });
  if (await dismiss.isVisible()) await dismiss.click();
  await page.goto(address);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

/** Marta Kowalska with two cars, booked in by staff before the test starts. */
async function seedMarta(page: Page) {
  const first = await api(page, STAFF, "POST", "/appointments", {
    dealershipId: LONDON,
    serviceTypeId: "service-oil-change",
    start: "2026-11-06T09:00:00Z",
    transport: "wait",
    newCustomer: { name: MARTA, phone: "07700 900123" },
    newVehicle: { registration: "AB12 CDE", make: "Ford", model: "Focus" },
  });
  expect(first.status).toBe(201);
  const customerId = (first.body as { customerId: string }).customerId;
  const second = await api(page, STAFF, "POST", "/appointments", {
    dealershipId: LONDON,
    serviceTypeId: "service-oil-change",
    start: "2026-11-06T11:00:00Z",
    transport: "wait",
    customerId,
    newVehicle: { registration: "MK07 XYZ", make: "Nissan", model: "Micra" },
  });
  expect(second.status).toBe(201);
}

/** Birch is booked 15:30 to 16:30 today, so his afternoon has a free gap before it. */
async function seedBirchGap(page: Page) {
  await book(page, {
    date: "2026-10-28",
    time: "15:30",
    technicianId: BIRCH,
    name: "Ravi Menon",
    make: "Skoda",
    model: "Octavia",
    registration: "GH78 MNO",
  });
}

/**
 * Someone else books 10:00 on the date for a full service: Birch takes it, and Ash cannot (the job would run
 * through Ash's break), so no mechanic is left for 10:00.
 */
async function takeTen(page: Page, date: string) {
  await book(page, {
    date,
    time: "10:00",
    serviceTypeId: "service-full",
    technicianId: BIRCH,
  });
}

const searchField = (page: Page) =>
  page.getByRole("searchbox", { name: "Name, phone or number plate" });
const resultRow = (page: Page, name: string) =>
  page
    .getByRole("group", { name: /found$/ })
    .getByRole("radio", { name: new RegExp(`^${name}`) });
const continueButton = (page: Page) =>
  page.getByRole("button", { name: "Continue", exact: true });
const day = (page: Page, label: string) =>
  page.getByRole("radio", { name: new RegExp(`^${label},`) });
const chip = (page: Page, name: string) =>
  page.getByRole("radio", { name, exact: true });
const confirm = (page: Page) =>
  page.getByRole("button", { name: "Confirm booking" });
const service = (page: Page) => selectNamed(page, "Service (required)");

/** Search for Marta, pick her and her Ford Focus, and continue to the staff `book` page. */
async function pickMarta(page: Page) {
  await searchField(page).fill("Kowal");
  await resultRow(page, MARTA).check();
  await page.getByRole("radio", { name: "Ford Focus, AB12 CDE" }).check();
  await continueButton(page).click();
  await expect(page).toHaveURL(/\/book\?.*customerId=.*vehicleId=/);
}

/** Every POST to /appointments, as JSON, with its Idempotency-Key. */
function watchBookings(page: Page) {
  const sent: { body: Record<string, unknown>; key: string }[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/api/appointments"))
      sent.push({
        body: JSON.parse(r.postData() ?? "{}"),
        key: r.headers()["idempotency-key"] ?? "",
      });
  });
  return sent;
}

const fillNewCustomer = async (
  page: Page,
  values: Partial<Record<string, string>>,
) => {
  const labels: Record<string, string> = {
    name: "Full name (required)",
    phone: "Phone number (required)",
    email: "Email (optional)",
    registration: "Registration (required)",
    make: "Make (required)",
    model: "Model (required)",
    year: "Year (optional)",
  };
  for (const [field, value] of Object.entries(values)) {
    await page
      .getByRole("textbox", { name: labels[field], exact: true })
      .fill(value ?? "");
  }
};

for (const width of [390, 1440]) {
  test.describe(`at ${width} wide`, () => {
    test("book-customer: idle, too-short, results, picked, no-results; Continue opens the staff book page with the pick", async ({
      page,
    }) => {
      await start(page, width, "/book/for-customer", { seed: seedMarta });
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Who is the booking for?",
        }),
      ).toBeVisible();
      await expect(
        page.getByText("Customers you find appear here, as you type."),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Add a new customer" }),
      ).toBeVisible();
      await shot(page, "book-customer", "idle");

      await searchField(page).fill("Ko");
      await expect(
        page.getByText(
          "Keep typing. We search from 3 characters, so the list does not show everyone.",
        ),
      ).toBeVisible();
      // A quiet line, not an error.
      await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
      await shot(page, "book-customer", "too-short");

      await searchField(page).fill("Demo");
      await expect(
        page.getByRole("heading", { name: "3 customers found" }),
      ).toBeVisible();
      await expect(
        page.getByRole("status").filter({ hasText: "3 customers found" }),
      ).toHaveCount(1);
      const a = resultRow(page, "Demo Customer A");
      await expect(a).toBeVisible();
      await expect(
        page.getByText("Phone ending 0101", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Demo Motors Hatch AB00 DMA", { exact: true }),
      ).toBeVisible();
      if (width >= 768) {
        await expect(continueButton(page)).toBeDisabled();
        await expect(
          page.getByText("Choose a customer and a vehicle to continue."),
        ).toBeVisible();
      }
      // Focus stays in the field while the results change (staff.md 5.3).
      await expect(searchField(page)).toBeFocused();
      await shot(page, "book-customer", "results");

      await searchField(page).fill("Kowal");
      await expect(
        page.getByRole("heading", { name: "1 customer found" }),
      ).toBeVisible();
      // Vehicles in a line (in the API's order).
      await expect(resultRow(page, MARTA)).toHaveAccessibleName(
        /Ford Focus AB12 CDE/,
      );
      await expect(resultRow(page, MARTA)).toHaveAccessibleName(
        /Nissan Micra MK07 XYZ/,
      );
      await resultRow(page, MARTA).check();
      await expect(
        page.getByRole("group", { name: "Which vehicle?" }),
      ).toBeVisible();
      await expect(continueButton(page)).toBeDisabled();
      await expect(
        page.getByText("Choose a vehicle to continue.").first(),
      ).toBeVisible();
      await shot(page, "book-customer", "picked");

      await searchField(page).fill("Smithson");
      await expect(
        page.getByRole("heading", { name: "No customer matches “Smithson”." }),
      ).toBeVisible();
      await expect(continueButton(page)).toHaveCount(0);
      await shot(page, "book-customer", "no-results");

      const bookings = watchBookings(page);
      await pickMarta(page);
      const url = new URL(page.url());
      expect([...url.searchParams.keys()].sort()).toEqual([
        "customerId",
        "vehicleId",
      ]);
      await expect(
        page.getByRole("region", { name: "Booking for" }),
      ).toContainText(`${MARTA}Phone ending 0123 · Ford Focus, AB12 CDE`);
      await chooseOption(service(page), "service-full");
      await day(page, "Fri 30 Oct").check();
      await chip(page, "10:00 to 13:00").check();
      await page.getByRole("radio", { name: "Drops the car off" }).check();
      await confirm(page).click();
      await expect(
        page.getByRole("heading", { level: 1, name: `${MARTA} is booked in.` }),
      ).toBeVisible();
      expect(bookings).toHaveLength(1);
      expect(bookings[0]!.body).toEqual({
        dealershipId: LONDON,
        serviceTypeId: "service-full",
        customerId: url.searchParams.get("customerId"),
        vehicleId: url.searchParams.get("vehicleId"),
        start: "2026-10-30T10:00:00Z",
        transport: "drop_off",
      });
    });

    test("book-customer: searching, search-error and results-capped", async ({
      page,
    }) => {
      await start(page, width, "/book/for-customer", {
        intercept: (p) =>
          interceptApi(p, { path: "/customers/search", delayMs: 2500 }),
        seed: async (p) => {
          for (let i = 0; i < 11; i += 1) {
            await book(p, {
              date: i < 6 ? "2026-11-02" : "2026-11-03",
              time: `${String(9 + (i % 6)).padStart(2, "0")}:00`,
              technicianId: i % 2 ? BIRCH : "tech-lon-ash",
              name: `Capped Customer ${i + 1}`,
              registration: `CP${String(10 + i)} ABC`,
            });
          }
        },
      });
      await searchField(page).fill("Capped");
      await expect(page.getByText("Searching…")).toBeVisible();
      await expect(page.locator("[aria-busy=true]")).toHaveCount(1);
      await shot(page, "book-customer", "searching");
      await expect(
        page.getByRole("heading", { name: "10 customers found" }),
      ).toBeVisible({ timeout: 10_000 });
      await expect(resultRow(page, "Capped Customer")).toHaveCount(10);
      await expect(
        page.getByText(
          "Showing the first 10. Type more of the name, phone number or plate to narrow it.",
        ),
      ).toBeVisible();
      await shot(page, "book-customer", "results-capped");
    });

    test("book-customer: search-error shows the reference and Try again", async ({
      page,
    }) => {
      await interceptApi(page, {
        path: "/customers/search",
        status: 500,
        body: problemBody(500, "INTERNAL"),
      });
      await start(page, width, "/book/for-customer");
      await searchField(page).fill("Demo");
      await expect(
        page.getByRole("heading", { name: "Search is not working." }),
      ).toBeVisible();
      await expect(
        page.getByText(
          "We could not search for customers just now. Nothing was changed. Try again; if it keeps happening, quote reference 4bf92f35.",
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Try again" }),
      ).toBeVisible();
      await shot(page, "book-customer", "search-error");
    });

    test("book-customer: no-vehicle, and Add another vehicle opens the vehicle group (not in the approved prototype)", async ({
      page,
    }) => {
      await interceptApi(page, {
        path: "/customers/search",
        status: 200,
        body: [
          {
            id: "customer-ola",
            name: "Ola Kowal",
            phone: "+44 7700 906602",
            email: "ola@example.com",
            vehicles: [],
          },
        ],
      });
      await start(page, width, "/book/for-customer");
      await searchField(page).fill("Ola Kowal");
      await resultRow(page, "Ola Kowal").check();
      await expect(
        page.getByText("Ola Kowal has no vehicle on file."),
      ).toBeVisible();
      await expect(
        page.getByText(
          "A booking needs a vehicle. Add their vehicle below, or choose another customer.",
        ),
      ).toBeVisible();
      await expect(continueButton(page)).toBeDisabled();
      await expect(
        page.getByText("Choose another customer to continue.").first(),
      ).toBeVisible();
      await shot(page, "book-customer", "no-vehicle");
      await page.getByRole("radio", { name: "Add another vehicle" }).check();
      for (const label of [
        "Registration (required)",
        "Make (required)",
        "Model (required)",
        "Year (optional)",
      ])
        await expect(
          page.getByRole("textbox", { name: label, exact: true }),
        ).toBeVisible();
      await continueButton(page).click();
      await expect(
        page.getByText(
          "Registration is missing. Enter the plate, for example AB12 CDE.",
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("textbox", { name: "Registration (required)" }),
      ).toBeFocused();
      await shot(page, "book-customer", "add-vehicle-not-in-prototype");
    });

    test("new-customer, validation and duplicate-hint; nothing is stored until a booking is confirmed", async ({
      page,
    }) => {
      await start(page, width, "/book/for-customer");
      const writes: string[] = [];
      page.on("request", (r) => {
        if (r.method() !== "GET" && !r.url().endsWith("/customers/search"))
          writes.push(`${r.method()} ${r.url()}`);
      });
      // NFR-4: from the keyboard, focus lands on the first field, not on the page.
      await page
        .getByRole("button", { name: "Add a new customer" })
        .press("Enter");
      await expect(page.getByRole("group", { name: "Customer" })).toBeVisible();
      await expect(page.getByRole("group", { name: "Vehicle" })).toBeVisible();
      await expect(
        page.getByRole("textbox", { name: "Full name (required)" }),
      ).toBeFocused();
      await expect(page.getByText("This is a demo.")).toBeVisible();
      await expect(
        page.getByText("Spaces, brackets and + are fine."),
      ).toBeVisible();
      await expect(
        page.getByText(
          "Nothing is saved yet. The customer and the vehicle are saved when you confirm a booking.",
        ),
      ).toBeVisible();
      await shot(page, "book-customer", "new-customer");

      await fillNewCustomer(page, {
        name: MARTA,
        phone: "0123",
        make: "Ford",
        year: "2030",
      });
      await continueButton(page).click();
      await expect(
        page.getByText("4 things need fixing before you can continue."),
      ).toBeVisible();
      for (const line of [
        "Phone number: That phone number looks too short or too long. Use 7 to 15 digits. Spaces, brackets and + are fine.",
        "Registration: Registration is missing. Enter the plate, for example AB12 CDE.",
        "Model: Model is missing. Enter the model, for example Focus.",
        "Year: That year does not look right. Use a year from 1950 to 2027, or leave it empty.",
      ])
        await expect(page.getByRole("link", { name: line })).toBeVisible();
      // The first field to fix takes focus; the values stay.
      await expect(
        page.getByRole("textbox", { name: "Phone number (required)" }),
      ).toBeFocused();
      await expect(
        page.getByRole("textbox", { name: "Full name (required)" }),
      ).toHaveValue(MARTA);
      await page.getByRole("link", { name: /^Model: / }).click();
      await expect(
        page.getByRole("textbox", { name: "Model (required)" }),
      ).toBeFocused();
      await fillNewCustomer(page, {
        name: "",
        email: "marta.example.com",
        registration: "A",
        year: "",
      });
      await expect(page.locator("#field-name-message")).toHaveText(
        "Full name is missing. Enter the customer's first and last name, for example Marta Kowalska.",
      );
      await expect(page.locator("#field-email-message")).toHaveText(
        "That email address is missing an @. Check it, or leave it empty.",
      );
      await expect(page.locator("#field-registration-message")).toHaveText(
        "That registration does not look right. Use 2 to 10 letters or numbers. Spaces are fine.",
      );
      await shot(page, "book-customer", "validation");

      // Customer A's phone number on an otherwise right form: the blue note alone, which does not block.
      await fillNewCustomer(page, {
        name: MARTA,
        phone: "+44 7700 900101",
        email: "",
        registration: "XY12 ZZZ",
        model: "Focus",
      });
      await page.getByRole("textbox", { name: "Email (optional)" }).focus();
      await expect(
        page.getByText("A customer with this phone number already exists."),
      ).toBeVisible();
      await expect(page.getByText(/things? needs? fixing/)).toHaveCount(0);
      await expect(
        page
          .locator('[id$="-message"]')
          .filter({ hasText: /missing|look right|looks too/ }),
      ).toHaveCount(0);
      await expect(
        page.getByText(
          "Demo Customer A, phone ending 0101, has a Demo Motors Hatch. If this is the same person, use their record so they are not saved twice. You can also go on and add a new customer.",
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Use this customer" }),
      ).toBeVisible();
      await shot(page, "book-customer", "duplicate-hint");
      await page
        .getByRole("button", { name: "Keep adding a new customer" })
        .press("Enter");
      await expect(
        page.getByText("A customer with this phone number already exists."),
      ).toHaveCount(0);
      await expect(
        page.getByRole("textbox", { name: "Phone number (required)" }),
      ).toBeFocused();

      // A plate on file shows the vehicle's note.
      await fillNewCustomer(page, { registration: "AB00 DMA" });
      await page.getByRole("textbox", { name: "Make (required)" }).focus();
      await expect(
        page.getByText("A vehicle with this registration is already on file."),
      ).toBeVisible();
      await expect(
        page.getByText(/^It belongs to Demo Customer A, phone ending 0101\./),
      ).toBeVisible();
      expect(writes).toEqual([]);
    });

    test("staff book: idle, time-chosen, validation, confirming and the staff confirmation", async ({
      page,
    }) => {
      await start(page, width, "/book/for-customer", {
        seed: seedMarta,
        intercept: (p) =>
          interceptApi(p, { path: "/appointments", delayMs: 1500 }),
      });
      await pickMarta(page);
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Choose a service and a time",
        }),
      ).toBeVisible();
      await expect(
        page.getByText("Choose a service to see times."),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Choose a service to confirm" }),
      ).toBeDisabled();
      await expect(
        page.getByRole("link", { name: "Change customer" }),
      ).toBeVisible();
      // staff.md 5.4: with no time the phone bar reads "Pick a time", with or without a service.
      if (width < 1024)
        await expect(
          page.getByText("Pick a time", { exact: true }),
        ).toBeVisible();
      await shot(page, "book", "idle");

      await chooseOption(service(page), "service-full");
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Choose a time for a full service",
        }),
      ).toBeVisible();
      await day(page, "Fri 30 Oct").check();
      await chip(page, "10:00 to 13:00").check();
      await confirm(page).click();
      await expect(
        page.getByText("1 thing needs fixing before we can book this."),
      ).toBeFocused();
      await expect(
        page.getByRole("link", {
          name: "Car choice: choose what the customer will do with the car.",
        }),
      ).toBeVisible();
      await expect(
        page.getByText("Choose what the customer will do with the car.", {
          exact: true,
        }),
      ).toBeVisible();
      await shot(page, "book", "validation");

      await expect(
        page.getByRole("group", {
          name: "What will the customer do with the car?",
        }),
      ).toBeVisible();
      await page.getByRole("radio", { name: "Waits on site" }).check();
      await expect(
        page.getByRole("heading", { name: `Booking for ${MARTA}` }),
      ).toBeVisible();
      await expect(page.getByText("Picked for you")).toBeVisible();
      await shot(page, "book", "time-chosen");

      await confirm(page).click();
      await expect(
        page.getByRole("button", { name: /Confirming…/ }),
      ).toBeVisible();
      await shot(page, "book", "confirming");
      await expect(
        page.getByRole("heading", { level: 1, name: `${MARTA} is booked in.` }),
      ).toBeVisible();
      await expect(
        page.getByText("Fri 30 Oct, 10:00 to 13:00. Fakeford Motors (demo)."),
      ).toBeVisible();
      await expect(
        page.getByText(
          "We will send Marta a confirmation and reminders. In this demo they appear in the outbox.",
        ),
      ).toBeVisible();
      await expect(page.getByText(/is now saved/)).toHaveCount(0);
      await shot(page, "book", "confirmed");

      // REQ-BOOK-004.AC-2: the schedule shows it.
      await page
        .getByRole("main")
        .getByRole("link", { name: "Back to schedule" })
        .last()
        .click();
      await expect(page).toHaveURL(/\/schedule/);
      await page.goto("/schedule?date=2026-10-30");
      await expect(page.getByText(/AB12 CDE/).first()).toBeVisible();
    });

    test("a new customer is booked: stored with the vehicle once, found by name, phone and plate", async ({
      page,
    }) => {
      await start(page, width, "/book/for-customer");
      await page.getByRole("button", { name: "Add a new customer" }).click();
      await fillNewCustomer(page, {
        name: "Priya Nair",
        phone: "07700 900456",
        email: "priya@example.com",
        registration: "PN21 XYZ",
        make: "Toyota",
        model: "Yaris",
        year: "2021",
      });
      await continueButton(page).click();
      await expect(page).toHaveURL(/\/book$/);
      await expect(
        page.getByRole("region", { name: "Booking for" }),
      ).toContainText("New customer. Saved when you confirm.");
      await expect(
        page.getByRole("link", { name: "Edit details" }),
      ).toBeVisible();
      // Edit details goes back to the form with every value in place.
      await page.getByRole("link", { name: "Edit details" }).click();
      await expect(
        page.getByRole("textbox", { name: "Registration (required)" }),
      ).toHaveValue("PN21 XYZ");
      await continueButton(page).click();
      const bookings = watchBookings(page);
      await chooseOption(service(page), "service-oil-change");
      await day(page, "Fri 30 Oct").check();
      await chip(page, "09:00 to 10:00").check();
      await page.getByRole("radio", { name: "Waits on site" }).check();
      await confirm(page).click();
      await expect(
        page.getByText(
          "Priya Nair is now saved, so you can find Priya next time.",
        ),
      ).toBeVisible();
      expect(bookings[0]!.body).toMatchObject({
        newCustomer: {
          name: "Priya Nair",
          phone: "07700 900456",
          email: "priya@example.com",
        },
        newVehicle: {
          registration: "PN21 XYZ",
          make: "Toyota",
          model: "Yaris",
          year: 2021,
        },
      });
      for (const text of ["Priya", "07700 900456", "PN21XYZ"]) {
        const found = await api(page, STAFF, "POST", "/customers/search", {
          text,
        });
        const people = (
          found.body as { name: string; vehicles: unknown[] }[]
        ).filter((c) => c.name === "Priya Nair");
        expect(people).toHaveLength(1);
        expect(people[0]!.vehicles).toHaveLength(1);
      }
      await page
        .getByRole("link", { name: "Book another for a customer" })
        .click();
      await expect(searchField(page)).toHaveValue("");
    });

    test("from a tapped gap: from-gap, from-gap-fits, gap-too-short, No times, and Any technician drops the technician", async ({
      page,
    }) => {
      await start(page, width, "/schedule", {
        seed: async (p) => {
          await seedMarta(p);
          await seedBirchGap(p);
          await changeShift(p, BIRCH, "2026-10-29", { kind: "leave" });
        },
      });
      if (width < 1024) {
        await expect(
          page.getByRole("list", { name: /in time order/ }),
        ).toBeVisible();
      }
      const gap = page
        .getByRole("link", {
          name: /^Free, .*, Amara Okafor\. Book this time\.$/,
        })
        .first();
      await gap.click();
      await expect(page).toHaveURL(
        /\/book\/for-customer\?start=2026-10-28T\d\d%3A\d\d%3A00Z&technicianId=tech-lon-birch$/,
      );
      const startAt = new URL(page.url()).searchParams.get("start")!;
      const hhmm = startAt.slice(11, 16);
      await expect(
        page.getByText(`Booking Amara Okafor on Wed 28 Oct, from ${hhmm}.`),
      ).toBeVisible();
      await expect(
        page.getByText(/Amara Okafor is free until 15:\d\d\./),
      ).toBeVisible();
      await shot(page, "book-customer", "from-gap");

      await pickMarta(page);
      await expect(page).toHaveURL(/start=.*technicianId=tech-lon-birch/);
      await expect(
        page.getByText(/^You tapped a free gap, \d\d:\d\d to 15:\d\d\./),
      ).toBeVisible();
      await expect(page.getByText("From the gap you tapped.")).toBeVisible();
      await shot(page, "book", "from-gap");

      await chooseOption(service(page), "service-oil-change");
      await expect(day(page, "Wed 28 Oct")).toBeChecked();
      await expect(
        page.getByRole("radio", { name: new RegExp(`^${hhmm} to `) }),
      ).toBeChecked();
      await expect(
        page.getByText(
          "We only show times with Amara Okafor. Choose another technician by pressing Any technician.",
        ),
      ).toBeVisible();
      // Birch is on leave on Thursday: with a fixed technician the day reads "No times".
      await expect(day(page, "Thu 29 Oct")).toHaveAccessibleName(
        "Thu 29 Oct, No times",
      );
      await shot(page, "book", "from-gap-fits");

      await chooseOption(service(page), "service-full");
      await expect(
        page.getByText(
          `A full service does not fit at ${hhmm} with Amara Okafor.`,
        ),
      ).toBeFocused();
      await expect(
        page.getByText(
          /^Amara Okafor is free for .* and a full service takes about 3 hours\. Pick another service, one of the times below, or any technician\.$/,
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("radiogroup", {
          name: "Closest times with Amara Okafor",
        }),
      ).toBeVisible();
      await expect(
        page
          .getByRole("radiogroup", { name: "Choose a day" })
          .getByRole("radio", { checked: true }),
      ).toHaveCount(0);
      await shot(page, "book", "gap-too-short");

      // "Any technician" drops the technician: the booking does not carry one.
      const bookings = watchBookings(page);
      // Choosing a closest time opens its day with the time chosen.
      await page
        .getByRole("radiogroup", { name: "Closest times with Amara Okafor" })
        .getByRole("radio")
        .first()
        .click();
      await expect(
        page
          .getByRole("radiogroup", { name: "Choose a day" })
          .getByRole("radio", { checked: true }),
      ).toHaveCount(1);
      await page.getByRole("radio", { name: "Waits on site" }).check();
      await page
        .getByRole("button", { name: "Any technician" })
        .first()
        .click();
      await expect(page).not.toHaveURL(/technicianId/);
      await expect(page.getByText("Picked for you")).toBeVisible();
      await expect(page.getByText("From the gap you tapped.")).toHaveCount(0);
      await day(page, "Fri 30 Oct").check();
      await chip(page, "13:00 to 16:00").check();
      await confirm(page).click();
      await expect(
        page.getByRole("heading", { level: 1, name: `${MARTA} is booked in.` }),
      ).toBeVisible();
      expect(bookings[0]!.body).not.toHaveProperty("technicianId");
    });

    test("conflict and conflict-new-customer: everything is kept; after a new time exactly one customer, vehicle and appointment exist", async ({
      page,
    }) => {
      await start(page, width, "/book/for-customer", { seed: seedMarta });
      await pickMarta(page);
      await chooseOption(service(page), "service-full");
      await day(page, "Fri 30 Oct").check();
      await chip(page, "10:00 to 13:00").check();
      await page.getByRole("radio", { name: "Drops the car off" }).check();
      await takeTen(page, "2026-10-30");
      await confirm(page).click();
      await expect(
        page.getByText("Sorry, 10:00 on Fri 30 Oct was just taken."),
      ).toBeFocused();
      await expect(
        page.getByText(
          "Someone else confirmed that time a moment before you did. Nothing was booked. We kept the vehicle, the service and the car choice, so you only need a new time.",
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("radio", { name: "10:00, just taken" }),
      ).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "Pick a new time to confirm" }),
      ).toHaveCount(1);
      await expect(
        page.getByRole("radio", { name: "Drops the car off" }),
      ).toBeChecked();
      await expect(
        page.getByRole("region", { name: "Booking for" }),
      ).toContainText(MARTA);
      await shot(page, "book", "conflict");

      // A new customer: the details are kept and saved once, with the new time.
      await page.goto("/book/for-customer");
      await page.getByRole("button", { name: "Add a new customer" }).click();
      await fillNewCustomer(page, {
        name: "Tomasz Wilk",
        phone: "07700 900789",
        registration: "TW19 ABC",
        make: "Skoda",
        model: "Fabia",
      });
      await continueButton(page).click();
      await chooseOption(service(page), "service-full");
      await day(page, "Mon 2 Nov").check();
      await chip(page, "10:00 to 13:00").check();
      await page.getByRole("radio", { name: "Waits on site" }).check();
      await takeTen(page, "2026-11-02");
      await confirm(page).click();
      await expect(
        page.getByText(
          /Tomasz Wilk is not saved yet\. We kept the details you entered\. They are saved when you confirm a time\.$/,
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("region", { name: "Booking for" }),
      ).toContainText("New customer. Saved when you confirm.");
      await shot(page, "book", "conflict-new-customer");
      await page
        .getByRole("radiogroup", { name: "Closest to your time" })
        .getByRole("radio")
        .first()
        .check();
      await confirm(page).click();
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Tomasz Wilk is booked in.",
        }),
      ).toBeVisible();
      const found = await api(page, STAFF, "POST", "/customers/search", {
        text: "Tomasz",
      });
      const people = found.body as { id: string; vehicles: unknown[] }[];
      expect(people).toHaveLength(1);
      expect(people[0]!.vehicles).toHaveLength(1);
      let theirs = 0;
      for (const date of ["2026-11-02", "2026-11-03", "2026-11-04"]) {
        const list = await api(
          page,
          STAFF,
          "GET",
          `/appointments?dealershipId=${LONDON}&date=${date}`,
        );
        theirs += (list.body as { customerId: string }[]).filter(
          (x) => x.customerId === people[0]!.id,
        ).length;
      }
      expect(theirs).toBe(1);
    });

    test("conflict-empty: a fixed technician with no other time says so and offers any technician", async ({
      page,
    }) => {
      await start(page, width, "/book/for-customer", {
        seed: async (p) => {
          await seedMarta(p);
          await seedBirchGap(p);
        },
        // Every booking answers 409 with no suggestions; the bodies sent are kept for the test.
        intercept: (p) =>
          p.addInitScript(
            (answer) => {
              const original = window.fetch.bind(window);
              const sent: unknown[] = [];
              (window as unknown as { sent: unknown[] }).sent = sent;
              window.fetch = async (input, init) => {
                const request =
                  input instanceof Request ? input : new Request(input, init);
                if (
                  request.method === "POST" &&
                  new URL(request.url).pathname.endsWith("/appointments")
                ) {
                  sent.push(await request.clone().json());
                  return new Response(JSON.stringify(answer), {
                    status: 409,
                    headers: { "Content-Type": "application/json" },
                  });
                }
                return original(request);
              };
            },
            {
              ...problemBody(409, "SLOT_UNAVAILABLE"),
              reasons: ["TECHNICIAN_BUSY"],
              suggestions: [],
            },
          ),
      });
      await page.goto(
        "/book/for-customer?start=2026-10-28T13%3A00%3A00Z&technicianId=tech-lon-birch",
      );
      await pickMarta(page);
      await chooseOption(service(page), "service-oil-change");
      await page.getByRole("radio", { name: "Waits on site" }).check();
      await confirm(page).click();
      await expect(
        page.getByText("Sorry, 13:00 on Wed 28 Oct was just taken."),
      ).toBeFocused();
      // From the gap, the booking carries the technician (D-0001-20 B).
      const sent = await page.evaluate(
        () => (window as unknown as { sent: unknown[] }).sent,
      );
      expect(sent[0]).toMatchObject({
        technicianId: BIRCH,
        start: "2026-10-28T13:00:00Z",
      });
      await expect(
        page.getByText(
          "There are no other times with Amara Okafor in the next 14 days. Try any technician, or pick another day.",
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Try any technician" }),
      ).toBeVisible();
      await shot(page, "book", "conflict-empty");
    });

    test("loading, empty-day, error (Try again sends the same key) and forbidden", async ({
      page,
    }) => {
      await start(page, width, "/book/for-customer", {
        seed: seedMarta,
        intercept: (p) =>
          p.addInitScript(() => {
            // The second ask for Fri 30 Oct finds it emptied (a stale count, state `empty-day`); every booking
            // POST is held for a moment, the first answers 500, the second 403.
            const original = window.fetch.bind(window);
            let friday = 0;
            const keys: string[] = [];
            (window as unknown as { bookingKeys: string[] }).bookingKeys = keys;
            window.fetch = async (input, init) => {
              const request =
                input instanceof Request ? input : new Request(input, init);
              const url = new URL(request.url);
              if (url.pathname.endsWith("/availability")) {
                await new Promise((done) => setTimeout(done, 600));
                if (url.search.includes("date=2026-10-31")) {
                  friday += 1;
                  if (friday >= 2)
                    return new Response(
                      JSON.stringify({
                        date: "2026-10-31",
                        timeZone: "Europe/London",
                        gridMinutes: 15,
                        slots: [],
                      }),
                      { headers: { "Content-Type": "application/json" } },
                    );
                }
              }
              if (
                request.method === "POST" &&
                url.pathname.endsWith("/appointments")
              ) {
                keys.push(request.headers.get("Idempotency-Key") ?? "");
                const status = keys.length === 1 ? 500 : 403;
                return new Response(
                  JSON.stringify({
                    type: "about:blank",
                    title: status === 500 ? "INTERNAL" : "FORBIDDEN",
                    status,
                    code: status === 500 ? "INTERNAL" : "FORBIDDEN",
                    traceId: "4bf92f35a1b2c3d4e5f60718293a4b5c",
                  }),
                  { status, headers: { "Content-Type": "application/json" } },
                );
              }
              return original(request);
            };
          }),
      });
      await pickMarta(page);
      await chooseOption(service(page), "service-full");
      await expect(page.getByText("Loading the days and times")).toBeAttached();
      await shot(page, "book", "loading");
      await day(page, "Sat 31 Oct").check();
      await expect(
        page.getByText("No times left on Sat 31 Oct for a full service."),
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        page.getByText("Try one of the closest times, or pick another day."),
      ).toBeVisible();
      await shot(page, "book", "empty-day");

      await day(page, "Fri 30 Oct").check();
      await chip(page, "10:00 to 13:00").check();
      await page.getByRole("radio", { name: "Waits on site" }).check();
      await confirm(page).click();
      await expect(
        page.getByText("Something went wrong on our side."),
      ).toBeFocused();
      await expect(
        page.getByText(
          "Nothing was booked. Try again; if it keeps happening, quote reference 4bf92f35. We use the same request, so it cannot book twice.",
        ),
      ).toBeVisible();
      await shot(page, "book", "error");
      await page.getByRole("button", { name: "Try again" }).click();
      await expect(
        page.getByText("You cannot book at that dealership."),
      ).toBeFocused();
      await expect(
        page.getByText(
          // The first staff user is the London one.
          "Your account is linked to Fakeford Motors (demo) only. Nothing was booked. Go back to the schedule and carry on from there.",
        ),
      ).toBeVisible();
      const keys = await page.evaluate(
        () => (window as unknown as { bookingKeys: string[] }).bookingKeys,
      );
      expect(keys).toHaveLength(2);
      expect(keys[0]).toBe(keys[1]);
      await shot(page, "book", "forbidden");
    });

    test("no-permission: a customer on /book/for-customer and on a staff /book link; the API refuses them", async ({
      page,
    }) => {
      await start(page, width, "/book/for-customer", { role: "Customer" });
      await expect(
        page.getByText(
          "Only garage staff can book for a customer. Customers book for themselves on the Book page. Switch role, or go to Book a service.",
        ),
      ).toBeVisible();
      await shot(page, "book-customer", "no-permission");
      await page.goto(
        "/book?start=2026-10-28T13%3A00%3A00Z&technicianId=tech-lon-birch",
      );
      await expect(
        page.getByText(/^Only garage staff can book for a customer\./),
      ).toBeVisible();
      await shot(page, "book", "no-permission");
      const before = await api(page, "user-customer-a", "GET", "/appointments");
      for (const body of [
        { technicianId: BIRCH, vehicleId: "vehicle-a" },
        {
          newCustomer: { name: "Someone", phone: "07700 900999" },
          newVehicle: { registration: "ZZ11 ZZZ", make: "Ford", model: "Ka" },
        },
      ]) {
        const answer = await api(
          page,
          "user-customer-a",
          "POST",
          "/appointments",
          {
            dealershipId: LONDON,
            serviceTypeId: "service-oil-change",
            start: "2026-10-30T09:00:00Z",
            transport: "wait",
            ...body,
          },
        );
        expect(answer.status).toBe(403);
      }
      const after = await api(page, "user-customer-a", "GET", "/appointments");
      expect(after.body).toEqual(before.body);
    });
  });
}

test("the manager books for a customer from the Schedule button with the same screens; Back to schedule is theirs; another dealership is 403", async ({
  page,
}) => {
  await start(page, 1440, "/schedule", { role: "Manager", seed: seedMarta });
  // D-0001-54 B: a button on the schedule, the five tabs unchanged.
  await expect(
    page.getByRole("navigation", { name: /main/i }).getByRole("link"),
  ).toHaveCount(5);
  await page
    .getByRole("main")
    .getByRole("link", { name: "Book for a customer" })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Who is the booking for?" }),
  ).toBeVisible();
  const bookings = watchBookings(page);
  await pickMarta(page);
  await chooseOption(service(page), "service-full");
  await day(page, "Fri 30 Oct").check();
  await chip(page, "10:00 to 13:00").check();
  await page.getByRole("radio", { name: "Waits on site" }).check();
  await confirm(page).click();
  await expect(
    page.getByRole("heading", { level: 1, name: `${MARTA} is booked in.` }),
  ).toBeVisible();
  expect(Object.keys(bookings[0]!.body).sort()).toEqual([
    "customerId",
    "dealershipId",
    "serviceTypeId",
    "start",
    "transport",
    "vehicleId",
  ]);
  await page
    .getByRole("main")
    .getByRole("link", { name: "Back to schedule" })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Schedule" }),
  ).toBeVisible();

  // SEC-4.AC-2: a manager of London booking at Saigon gets 403 and nothing is stored.
  const saigon = "dealership-saigon";
  const answer = await api(page, MANAGER, "POST", "/appointments", {
    dealershipId: saigon,
    serviceTypeId: "service-oil-change",
    start: "2026-10-30T03:00:00Z",
    transport: "wait",
    newCustomer: { name: "Wrong Place", phone: "07700 900555" },
    newVehicle: { registration: "WP11 ABC", make: "Ford", model: "Ka" },
  });
  expect(answer.status).toBe(403);
  const found = await api(page, MANAGER, "POST", "/customers/search", {
    text: "Wrong Place",
  });
  expect(found.body).toEqual([]);
});

test("the manager can open the book-customer screen at 390 wide with the button full width under the title", async ({
  page,
}) => {
  await start(page, 390, "/schedule", { role: "Manager" });
  const button = page
    .getByRole("main")
    .getByRole("link", { name: "Book for a customer" });
  await expect(button).toBeVisible();
  const [buttonBox, mainBox] = await Promise.all([
    button.boundingBox(),
    page.getByRole("heading", { level: 1, name: "Schedule" }).boundingBox(),
  ]);
  expect(buttonBox!.y).toBeGreaterThan(mainBox!.y);
  expect(buttonBox!.width).toBeGreaterThan(300);
});

test("D-0001-29 B: Add another vehicle books the new car for the picked customer; no second customer; the car is found next time", async ({
  page,
}) => {
  await start(page, 1440, "/book/for-customer", { seed: seedMarta });
  await searchField(page).fill("Kowal");
  await resultRow(page, MARTA).check();
  await page.getByRole("radio", { name: "Add another vehicle" }).check();
  await fillNewCustomer(page, {
    registration: "NN22 ABC",
    make: "Nissan",
    model: "Note",
    year: "2022",
  });
  await continueButton(page).click();
  await expect(page).toHaveURL(/\/book\?customerId=[^&]+$/);
  await expect(page.getByRole("region", { name: "Booking for" })).toContainText(
    "Phone ending 0123 · Nissan Note, NN22 ABC",
  );
  const bookings = watchBookings(page);
  await chooseOption(service(page), "service-oil-change");
  await day(page, "Fri 30 Oct").check();
  await chip(page, "09:00 to 10:00").check();
  await page.getByRole("radio", { name: "Waits on site" }).check();
  await confirm(page).click();
  await expect(
    page.getByRole("heading", { level: 1, name: `${MARTA} is booked in.` }),
  ).toBeVisible();
  expect(bookings[0]!.body).toMatchObject({
    customerId: expect.any(String),
    newVehicle: {
      registration: "NN22 ABC",
      make: "Nissan",
      model: "Note",
      year: 2022,
    },
  });
  expect(bookings[0]!.body).not.toHaveProperty("newCustomer");
  expect(bookings[0]!.body).not.toHaveProperty("vehicleId");
  const found = await api(page, STAFF, "POST", "/customers/search", {
    text: "Kowal",
  });
  const people = found.body as { vehicles: { registration: string }[] }[];
  expect(people).toHaveLength(1);
  expect(people[0]!.vehicles.map((v) => v.registration).sort()).toEqual([
    "AB12 CDE",
    "MK07 XYZ",
    "NN22 ABC",
  ]);
  await shot(page, "book", "confirmed-added-vehicle-not-in-prototype");
});

test("SEC-10: the search text and phone numbers never appear in the address or in any request address", async ({
  page,
}) => {
  const urls: string[] = [];
  page.on("request", (r: Request) => urls.push(r.url()));
  await start(page, 1440, "/book/for-customer", { seed: seedMarta });
  await searchField(page).fill("Kowal");
  await expect(
    page.getByRole("heading", { name: "1 customer found" }),
  ).toBeVisible();
  await searchField(page).fill("07700 900123");
  await expect(
    page.getByRole("heading", { name: "1 customer found" }),
  ).toBeVisible();
  // Phone numbers on screen are the last four digits only.
  await expect(page.getByText("07700 900123", { exact: false })).toHaveCount(0);
  await expect(page.getByText("Phone ending 0123")).toBeVisible();
  await page.getByRole("button", { name: "Add a new customer" }).click();
  await fillNewCustomer(page, { phone: "07700 900123" });
  await page.getByRole("textbox", { name: "Email (optional)" }).focus();
  await expect(
    page.getByText("A customer with this phone number already exists."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Use this customer" }).click();
  await expect(resultRow(page, MARTA)).toBeChecked();
  await page.getByRole("radio", { name: "Ford Focus, AB12 CDE" }).check();
  await continueButton(page).click();
  for (const url of [...urls, page.url()]) {
    expect(url).not.toMatch(/kowal|Kowal|0123|07700|900123/);
  }
  expect([...new URL(page.url()).searchParams.keys()].sort()).toEqual([
    "customerId",
    "vehicleId",
  ]);
});

test("SEC-13.AC-2: the search text, the pick and the new customer's details are gone after the role is switched", async ({
  page,
}) => {
  await start(page, 1440, "/book/for-customer");
  await searchField(page).fill("Demo");
  await resultRow(page, "Demo Customer A").check();
  await page.getByRole("button", { name: "Add a new customer" }).click();
  await fillNewCustomer(page, { name: "Secret Person", phone: "07700 900321" });
  await pickRole(page, "Customer");
  await pickRole(page, "Staff");
  await page.goto("/book/for-customer");
  await expect(searchField(page)).toHaveValue("");
  await page.getByRole("button", { name: "Add a new customer" }).click();
  await expect(
    page.getByRole("textbox", { name: "Full name (required)" }),
  ).toHaveValue("");
});

test("SEC-11.AC-2: a stored customer whose words are script is shown as text in the results and the panel", async ({
  page,
}) => {
  const payload = "<img src=x onerror=window.__xss=1>";
  await start(page, 1440, "/book/for-customer", {
    seed: async (p) => {
      const answer = await api(p, STAFF, "POST", "/appointments", {
        dealershipId: LONDON,
        serviceTypeId: "service-oil-change",
        start: "2026-11-06T09:00:00Z",
        transport: "wait",
        newCustomer: { name: payload, phone: "07700 900777" },
        newVehicle: {
          registration: "XS55 XSS",
          make: "<script>window.__xss=1</script>",
          model: "<svg onload=window.__xss=1>",
        },
      });
      expect(answer.status).toBe(201);
    },
  });
  await searchField(page).fill("XS55");
  await expect(resultRow(page, payload)).toBeVisible();
  await expect(page.getByText(payload, { exact: true })).toBeVisible();
  await resultRow(page, payload).check();
  await continueButton(page).click();
  await expect(page.getByRole("region", { name: "Booking for" })).toContainText(
    payload,
  );
  await expect(page.getByRole("region", { name: "Booking for" })).toContainText(
    "<script>window.__xss=1</script> <svg onload=window.__xss=1>",
  );
  expect(await page.evaluate(() => "__xss" in window)).toBe(false);
  expect(
    await page.locator("main img, main script, main svg[onload]").count(),
  ).toBe(0);
});

test("NFR-7: no sideways scroll at any width; 56 px rows 8 px apart; two columns from 768; form groups side by side; phone bar and no tab bar", async ({
  page,
}) => {
  await start(page, 1440, "/book/for-customer", { seed: seedMarta });
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/book/for-customer");
    await searchField(page).fill("Demo");
    await expect(
      page.getByRole("heading", { name: "3 customers found" }),
    ).toBeVisible();
    await expectNoSidewaysScroll(page);
    const rows = page.locator(
      '[role=radiogroup] label:has(input[name="customer"])',
    );
    const boxes = await rows.evaluateAll((items) =>
      items.map((i) => i.getBoundingClientRect()),
    );
    for (const box of boxes) expect(box.height).toBeGreaterThanOrEqual(56);
    for (let i = 1; i < boxes.length; i += 1)
      expect(boxes[i]!.top - boxes[i - 1]!.bottom).toBeGreaterThanOrEqual(8);
    const field = await searchField(page).boundingBox();
    const list = await page
      .getByRole("group", { name: /found$/ })
      .boundingBox();
    if (width >= 768) {
      expect(Math.round(field!.width)).toBe(352);
      expect(list!.x).toBeGreaterThan(field!.x + field!.width);
    } else {
      expect(list!.y).toBeGreaterThan(field!.y);
      // The phone: a sticky bar with Continue, and no tab bar.
      await expect(continueButton(page)).toBeVisible();
      await expect(
        page.getByRole("navigation", { name: /tabs|main/i }),
      ).toBeHidden();
    }
    await resultRow(page, "Demo Customer A").check();
    if (width < 768) {
      await expect(
        page.getByText("Demo Motors Hatch AB00 DMA").last(),
      ).toBeVisible();
    }
    await page.getByRole("button", { name: "Add a new customer" }).click();
    await expectNoSidewaysScroll(page);
    const customerBox = await page
      .getByRole("group", { name: "Customer" })
      .boundingBox();
    const vehicleBox = await page
      .getByRole("group", { name: "Vehicle" })
      .boundingBox();
    if (width >= 768) expect(vehicleBox!.x).toBeGreaterThan(customerBox!.x);
    else expect(vehicleBox!.y).toBeGreaterThan(customerBox!.y);
    await page.getByRole("button", { name: "Back to search" }).click();
  }
});

for (const width of [390, 1440] as const) {
  test(`Q-0001-247 at ${width} wide: when the tapped gap cannot be checked, no times show, Confirm stays off and nothing says Picked for you; Try again brings the technician back`, async ({
    page,
  }) => {
    await start(
      page,
      width,
      `/book/for-customer?start=2026-10-30T09%3A00%3A00Z&technicianId=${BIRCH}`,
      {
        seed: seedMarta,
        // The day's schedule fails until the test lets it through.
        intercept: (p) =>
          p.addInitScript(
            (body) => {
              const original = window.fetch.bind(window);
              const flags = window as unknown as {
                letScheduleThrough?: boolean;
              };
              window.fetch = async (input, init) => {
                const url =
                  input instanceof Request ? input.url : String(input);
                if (
                  !flags.letScheduleThrough &&
                  new URL(url, location.href).pathname.endsWith("/schedule")
                )
                  return new Response(JSON.stringify(body), {
                    status: 500,
                    headers: { "Content-Type": "application/json" },
                  });
                return original(input, init);
              };
            },
            problemBody(500, "INTERNAL"),
          ),
      },
    );
    const bookings = watchBookings(page);
    await pickMarta(page);
    await chooseOption(service(page), "service-full");
    await expect(
      page.getByRole("heading", {
        name: "We could not check the gap you tapped.",
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Something went wrong on our side, so we cannot show the technician or their times. Nothing was changed. Try again; if it keeps happening, quote reference 4bf92f35.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pick a day" })).toHaveCount(
      0,
    );
    await expect(page.getByText("Picked for you")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Pick a time to confirm" }),
    ).toBeDisabled();
    await shot(page, "book", "gap-error");

    await page.evaluate(() => {
      (
        window as unknown as { letScheduleThrough?: boolean }
      ).letScheduleThrough = true;
    });
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByText("From the gap you tapped.")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Pick a day" }),
    ).toBeVisible();
    expect(bookings).toEqual([]);
  });
}

test("video: a staff member taps a free gap, finds a customer, picks a car, a service and a time, confirms; then adds a new customer, hits just taken and recovers", async ({
  browser,
}) => {
  const dir = process.env["VIDEO_DIR"];
  test.skip(!dir, "VIDEO_DIR is not set");
  test.setTimeout(180_000);
  const size = { width: 1280, height: 800 };
  const context = await browser.newContext({
    viewport: size,
    recordVideo: { dir: dir!, size },
  });
  const page = await context.newPage();
  const slow = () => page.waitForTimeout(900);
  await page.clock.setFixedTime(BEFORE);
  await openApp(page);
  await seedMarta(page);
  await seedBirchGap(page);
  await page.clock.setFixedTime(NOW);
  await openApp(page);
  await pickRole(page, "Staff");
  await page.getByRole("button", { name: "Dismiss" }).click();
  await page.goto("/schedule");
  await slow();
  await page
    .getByRole("link", {
      name: /^Free, .*, Amara Okafor\. Book this time\.$/,
    })
    .first()
    .click();
  await slow();
  await searchField(page).pressSequentially("Kowal", { delay: 120 });
  await slow();
  await resultRow(page, MARTA).check();
  await slow();
  await page.getByRole("radio", { name: "Ford Focus, AB12 CDE" }).check();
  await slow();
  await continueButton(page).click();
  await slow();
  await chooseOption(service(page), "service-oil-change");
  await slow();
  await page.getByRole("radio", { name: "Waits on site" }).check();
  await slow();
  await confirm(page).click();
  await expect(
    page.getByRole("heading", { level: 1, name: `${MARTA} is booked in.` }),
  ).toBeVisible();
  await page.waitForTimeout(2000);

  await page.getByRole("link", { name: "Book another for a customer" }).click();
  await slow();
  await page.getByRole("button", { name: "Add a new customer" }).click();
  await slow();
  const typeIn = async (label: string, text: string) => {
    await page
      .getByRole("textbox", { name: label, exact: true })
      .pressSequentially(text, { delay: 60 });
  };
  await typeIn("Full name (required)", "Tomasz Wilk");
  await typeIn("Phone number (required)", "07700 900789");
  await typeIn("Registration (required)", "TW19 ABC");
  await typeIn("Make (required)", "Skoda");
  await typeIn("Model (required)", "Fabia");
  await slow();
  await continueButton(page).click();
  await slow();
  await chooseOption(service(page), "service-full");
  await slow();
  await day(page, "Mon 2 Nov").check();
  await slow();
  await chip(page, "10:00 to 13:00").check();
  await slow();
  await page.getByRole("radio", { name: "Drops the car off" }).check();
  await slow();
  // Meanwhile both mechanics are booked at 10:00 by someone else.
  await takeTen(page, "2026-11-02");
  await confirm(page).click();
  await expect(
    page.getByText("Sorry, 10:00 on Mon 2 Nov was just taken."),
  ).toBeVisible();
  await page.waitForTimeout(3000);
  await page
    .getByRole("radiogroup", { name: "Closest to your time" })
    .getByRole("radio")
    .first()
    .check();
  await slow();
  await confirm(page).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Tomasz Wilk is booked in." }),
  ).toBeVisible();
  await page.waitForTimeout(2500);
  await context.close();
});

// D-0001-144: a customer staff add can be picked in "Viewing as", and then sees their own booking. The seeded
// walk-in customer is in the list too.
test("a new customer staff add appears under Viewing as, and picking them shows their appointment", async ({
  page,
}) => {
  await start(page, 1440, "/book/for-customer");
  await page.getByRole("button", { name: "Add a new customer" }).click();
  await fillNewCustomer(page, {
    name: "Nadia Pham",
    phone: "07700 900888",
    registration: "NP22 VTC",
    make: "Mazda",
    model: "CX-5",
  });
  await continueButton(page).click();
  await chooseOption(service(page), "service-oil-change");
  await day(page, "Fri 30 Oct").check();
  await chip(page, "09:00 to 10:00").check();
  await page.getByRole("radio", { name: "Waits on site" }).check();
  await confirm(page).click();
  await expect(
    page.getByText("Nadia Pham is now saved, so you can find Nadia next time."),
  ).toBeVisible();

  await pickRole(page, "Customer");
  const who = selectNamed(page, "Who");
  await who.click();
  const names = await page
    .getByRole("listbox")
    .getByRole("option")
    .allInnerTexts();
  expect(names.map((n) => n.trim())).toEqual([
    "Demo Customer A",
    "Demo Customer B",
    "Demo Walk-in Carol",
    "Nadia Pham",
  ]);
  await shot(page, "viewing-as", "new-customer-listed");
  await page.getByRole("option", { name: "Nadia Pham" }).click();
  await expect(
    page.getByText(/^Now viewing as Customer, Nadia Pham/),
  ).toBeVisible();
  await page.getByRole("link", { name: "My appointments" }).first().click();
  await expect(page.getByRole("main")).toContainText("Oil and filter change");
  await expect(page.getByRole("main")).toContainText("NP22 VTC");
  await shot(page, "my-appointments", "new-customer");
});

// D-0001-142: a browser stops an idle service worker, and MSW's worker then forgets this tab, so calls go past
// it to the host. The page must heal itself: lists still load and a booking is made once. Chromium only, where
// the DevTools protocol can stop the worker the way the browser does.
test("after the browser stops the mock worker, services, days and a booking still work, with one booking made", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Stopping a worker needs Chromium's DevTools protocol",
  );
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("ServiceWorker.enable");
  const stopWorker = () => cdp.send("ServiceWorker.stopAllWorkers");
  const missed: string[] = [];
  page.on("response", (r) => {
    if (r.url().includes("/api/") && !r.fromServiceWorker())
      missed.push(new URL(r.url()).pathname);
  });
  // A read still in flight when the worker stops wakes it up and heals it, and the booking then has nothing to
  // miss. So the worker stops for the booking only once nothing is in flight.
  const inFlight = new Set<Request>();
  page.on("request", (r) => {
    if (r.url().includes("/api/")) inFlight.add(r);
  });
  page.on("requestfinished", (r) => inFlight.delete(r));
  page.on("requestfailed", (r) => inFlight.delete(r));

  await start(page, 1440, "/book/for-customer");
  await page.getByRole("button", { name: "Add a new customer" }).click();
  await fillNewCustomer(page, {
    name: "Heal Test",
    phone: "07700 900777",
    registration: "HT21 ABC",
    make: "Honda",
    model: "Civic",
  });
  await stopWorker();
  await continueButton(page).click();
  await service(page).click();
  await expect(page.getByRole("option")).toHaveCount(3);
  await page.keyboard.press("Escape");

  await stopWorker();
  await chooseOption(service(page), "service-oil-change");
  await expect(day(page, "Fri 30 Oct")).toBeVisible();
  await expect(page.getByText("We could not check the days.")).toHaveCount(0);
  await day(page, "Fri 30 Oct").check();
  await chip(page, "09:00 to 10:00").check();
  await page.getByRole("radio", { name: "Waits on site" }).check();

  const bookings = watchBookings(page);
  await expect.poll(() => inFlight.size).toBe(0);
  await stopWorker();
  await confirm(page).click();
  await expect(
    page.getByText("Heal Test is now saved, so you can find Heal next time."),
  ).toBeVisible();

  // The calls really went past the worker, and were sent again. Which read misses first depends on what is
  // already cached (a search can still be in flight), so only the booking is named.
  expect(missed).toContain("/api/appointments");
  expect(missed.length).toBeGreaterThan(1);
  // A retried booking keeps its key, and the customer and the car are stored once.
  expect(new Set(bookings.map((b) => b.key)).size).toBe(1);
  const found = await api(page, STAFF, "POST", "/customers/search", {
    text: "HT21ABC",
  });
  const people = (found.body as { name: string; vehicles: unknown[] }[]).filter(
    (c) => c.name === "Heal Test",
  );
  expect(people).toHaveLength(1);
  expect(people[0]!.vehicles).toHaveLength(1);
});
