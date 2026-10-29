// The courtesy car in booking (C7; REQ-BOOK-010.AC-1/2/3, REQ-BOOK-009.AC-2, Q-0001-18, D-0001-24, NFR-4, NFR-7).
// The clock is fixed at Wed 28 Oct 2026, 10:40 in London, and the seed books relative to that day, so the days
// and times are the same on every run whatever today's weekday is. London has one courtesy car, "Car 1"
// (D-0001-70). Every state is reached by real use: the only car is booked first through the API, or by a second
// page. With EVIDENCE_DIR set, each state is saved as a screenshot there (D-0000-13); with VIDEO_DIR set, the
// video test saves its flow there.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { LONDON, STAFF, api } from "./schedule-data";
import {
  expectNoAxeViolations,
  expectNoSidewaysScroll,
  openApp,
  pickRole,
  widths,
} from "./support";

const NOW = new Date("2026-10-28T10:40:00Z");
const DEEP = `/book?dealership=${LONDON}&service=service-full`;
const STAFF_BOOK = `${DEEP}&customerId=customer-a&vehicleId=vehicle-a`;
const fri = (hhmm: string) => `2026-10-30T${hhmm}:00Z`;
const CAR = "Borrow a courtesy car";
const CAR_OFF = /^Borrow a courtesy car\s+Not available at this time$/;
const STAFF_CAR_OFF = /^Borrows a courtesy car\s+Not available at this time$/;

async function start(
  page: Page,
  width: number,
  address: string,
  role: "Customer" | "Staff" = "Customer",
  before?: (page: Page) => Promise<void>,
) {
  await page.setViewportSize({ width, height: 900 });
  await page.clock.setFixedTime(NOW);
  await openApp(page);
  if (before) await before(page);
  await pickRole(page, role);
  if (role === "Staff")
    await page.getByRole("button", { name: "Dismiss" }).click();
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
const option = (page: Page, name: string | RegExp) =>
  page.getByRole("radio", { name, exact: typeof name === "string" });

/** London staff book the only courtesy car for a one-hour EV check with Tom Fletcher on Fri 30 Oct. */
async function takeTheCar(page: Page, time: string) {
  const answer = await api(page, STAFF, "POST", "/appointments", {
    dealershipId: LONDON,
    serviceTypeId: "service-ev-check",
    start: fri(time),
    transport: "courtesy_car",
    technicianId: "tech-lon-cedar",
    newCustomer: {
      name: "Ravi Menon",
      phone: "0161 496 0456",
      email: "ravi@example.com",
    },
    newVehicle: { registration: "GH78 MNO", make: "Skoda", model: "Octavia" },
  });
  expect(answer.status).toBe(201);
}

/** The customer's car and Fri 30 Oct. */
async function carAndDay(page: Page) {
  await page.getByRole("combobox", { name: /^Car/ }).selectOption("vehicle-a");
  await day(page, "Fri 30 Oct").check();
}

/** The availability asks of the page, with their transport. */
function watchSearches(page: Page) {
  const asked: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.endsWith("/availability"))
      asked.push(url.searchParams.get("transport") ?? "");
  });
  return asked;
}

for (const width of [390, 1440]) {
  test.describe(`at ${width} wide`, () => {
    test("REQ-BOOK-010.AC-1/2: three choices, no default; a courtesy car is stored and shown on the confirmation, the appointment and the staff schedule", async ({
      page,
    }) => {
      await start(page, width, DEEP);
      const legend = page.getByRole("group", {
        name: "What will you do with the car?",
      });
      await expect(legend.getByRole("radio")).toHaveCount(3);
      for (const name of ["Wait on site", "Drop it off", CAR])
        await expect(option(page, name)).not.toBeChecked();
      await carAndDay(page);
      await chip(page, "10:00 to 13:00").check();
      await option(page, "Drop it off").check();
      await shot(page, "time-chosen");

      const asked = watchSearches(page);
      await option(page, CAR).check();
      await expect.poll(() => asked.includes("courtesy_car")).toBe(true);
      await expect(chip(page, "10:00 to 13:00")).toBeChecked();
      await expect(option(page, CAR)).toBeChecked();
      await shot(page, "courtesy-chosen");

      await confirm(page).click();
      await expect(
        page.getByRole("heading", { level: 1, name: "You are booked" }),
      ).toBeVisible();
      await expect(
        page.getByText("You will borrow a courtesy car"),
      ).toBeVisible();
      await shot(page, "courtesy-car", "book-confirmed");

      const mine = await api(page, "user-customer-a", "GET", "/appointments");
      const booked = (
        mine.body as { id: string; start: string; transport: string }[]
      ).find((a) => a.start === fri("10:00"))!;
      expect(booked.transport).toBe("courtesy_car");
      await page.goto(`/appointments/${booked.id}`);
      await expect(
        page.getByText("You will borrow a courtesy car"),
      ).toBeVisible();
      await shot(page, "courtesy-car", "appointment");

      await pickRole(page, "Staff");
      await page.getByRole("button", { name: "Dismiss" }).click();
      await page.goto("/schedule?date=2026-10-30");
      await expect(
        page
          .getByRole("button", { name: /, Courtesy car, Car 1$/ })
          .or(page.getByText("Courtesy car, Car 1", { exact: true }))
          .first(),
      ).toBeVisible();
      await shot(page, "courtesy-car", "schedule");
    });

    test("no-courtesy-car: the car is booked from 09:45; at 10:00 the option is off with its reason and the API's next start; waiting still books", async ({
      page,
    }) => {
      await start(page, width, DEEP, "Customer", (p) => takeTheCar(p, "09:45"));
      await carAndDay(page);
      await chip(page, "10:00 to 13:00").check();
      await expect(
        page.getByText(
          "No courtesy car is free from 10:00 to 13:00. You can still wait or drop the car off. A courtesy car is free if you start at 10:45.",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(option(page, CAR_OFF)).toBeDisabled();
      await expect(page.getByText("Not available at this time")).toBeVisible();
      await option(page, "Wait on site").check();
      await shot(page, "no-courtesy-car");

      // 10:45, the start the line names, passes the check with a courtesy car.
      const check = await api(
        page,
        "user-customer-a",
        "POST",
        "/availability-checks",
        {
          dealershipId: LONDON,
          serviceTypeId: "service-full",
          start: fri("10:45"),
          transport: "courtesy_car",
        },
      );
      expect((check.body as { available: boolean }).available).toBe(true);

      await confirm(page).click();
      await expect(
        page.getByRole("heading", { level: 1, name: "You are booked" }),
      ).toBeVisible();
      await expect(page.getByText("You will wait on site")).toBeVisible();
    });

    test("courtesy-cleared: with the car chosen, someone books it for 11:00; picking 11:30 clears the choice and says so", async ({
      page,
    }) => {
      await start(page, width, DEEP);
      await carAndDay(page);
      await option(page, CAR).check();
      await expect(chip(page, "11:30 to 14:30")).toBeVisible();
      // The list on this page is now out of date: the only car goes from 11:00 to 12:00.
      await takeTheCar(page, "11:00");
      await chip(page, "11:30 to 14:30").check();
      await expect(
        page.getByText(
          "A courtesy car is not free from 11:30 to 14:30, so we cleared that choice. Please choose again.",
        ),
      ).toBeVisible();
      await expect(option(page, CAR_OFF)).toBeDisabled();
      await expect(option(page, CAR_OFF)).not.toBeChecked();
      await expect(page.getByText(/^No courtesy car is free/)).toHaveCount(0);
      await expect(chip(page, "11:30 to 14:30")).toBeChecked();
      await shot(page, "courtesy-cleared");
    });

    test("conflict-courtesy: two pages want the only car at 10:00; the second gets the apology, nothing is booked and every offered time has a car", async ({
      page,
      context,
    }) => {
      await start(page, width, DEEP);
      const other = await context.newPage();
      await other.setViewportSize({ width, height: 900 });
      await other.clock.setFixedTime(NOW);
      await other.goto(DEEP);
      await carAndDay(other);
      await chip(other, "10:00 to 13:00").check();
      await option(other, CAR).check();
      await expect(option(other, CAR)).toBeChecked();

      // The first page takes the car with a one-hour EV check at 10:00: the time stays free to wait.
      await page.goto(`/book?dealership=${LONDON}&service=service-ev-check`);
      await carAndDay(page);
      await chip(page, "10:00 to 11:00").check();
      await option(page, CAR).check();
      await confirm(page).click();
      await expect(
        page.getByRole("heading", { level: 1, name: "You are booked" }),
      ).toBeVisible();

      const before = await api(
        other,
        "user-customer-a",
        "GET",
        "/appointments",
      );
      await confirm(other).click();
      const heading = other.getByText(
        "Sorry, no courtesy car is free from 10:00 to 13:00 any more.",
      );
      await expect(heading).toBeFocused();
      await expect(
        other.getByText(
          "Another customer took the last one a moment before you. Nothing was booked for you. You can still book 10:00 and wait or drop the car off, or pick a time when a courtesy car is free.",
        ),
      ).toBeVisible();
      await expect(option(other, CAR_OFF)).toBeDisabled();
      await expect(option(other, CAR_OFF)).not.toBeChecked();
      await expect(chip(other, "10:00 to 13:00")).toBeChecked();
      await expect(other.getByText("Just taken", { exact: true })).toHaveCount(
        0,
      );
      const group = other.getByRole("radiogroup", {
        name: "Closest times with a courtesy car",
      });
      const items = group.getByRole("radio");
      const count = await items.count();
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThanOrEqual(5);
      await shot(other, "conflict-courtesy");

      // Nothing was booked, and each offered start passes the check with a courtesy car.
      const after = await api(other, "user-customer-a", "GET", "/appointments");
      expect((after.body as unknown[]).length).toBe(
        (before.body as unknown[]).length,
      );
      for (let i = 0; i < count; i++) {
        const start = await items.nth(i).getAttribute("value");
        const check = await api(
          other,
          "user-customer-a",
          "POST",
          "/availability-checks",
          {
            dealershipId: LONDON,
            serviceTypeId: "service-full",
            start,
            transport: "courtesy_car",
          },
        );
        expect((check.body as { available: boolean }).available).toBe(true);
      }

      // Waiting at 10:00 still books.
      await option(other, "Wait on site").check();
      await confirm(other).click();
      await expect(
        other.getByRole("heading", { level: 1, name: "You are booked" }),
      ).toBeVisible();
    });

    test("courtesy-note: a courtesy car appointment is only offered times with a car, and its car choice stays the same", async ({
      page,
    }) => {
      await start(page, width, DEEP);
      await carAndDay(page);
      await chip(page, "10:00 to 13:00").check();
      await option(page, CAR).check();
      await confirm(page).click();
      await expect(
        page.getByRole("heading", { level: 1, name: "You are booked" }),
      ).toBeVisible();
      const id = page.url().split("/").pop()!;
      // The car is busy from 14:00 to 15:00 on Fri 30 Oct.
      await takeTheCar(page, "14:00");

      const asked = watchSearches(page);
      await page.goto(`/appointments/${id}/reschedule`);
      await expect(
        page.getByText(
          "Your appointment includes a courtesy car, so we only show times when one is free.",
        ),
      ).toBeVisible();
      await day(page, "Fri 30 Oct").check();
      // The screen asks each day with the appointment's own car choice.
      await expect.poll(() => asked.length).toBeGreaterThan(0);
      expect(asked.every((t) => t === "courtesy_car")).toBe(true);
      // The chips are exactly the starts with a free car; some starts free to wait are left out.
      const search = (transport: string) =>
        api(
          page,
          "user-customer-a",
          "GET",
          `/dealerships/${LONDON}/availability?serviceTypeId=service-full&date=2026-10-30&transport=${transport}&appointmentId=${id}`,
        ).then((a) =>
          (a.body as { slots: { start: string }[] }).slots.map((s) => s.start),
        );
      const withCar = await search("courtesy_car");
      const waiting = await search("wait");
      expect(
        waiting.filter((s) => !withCar.includes(s)).length,
      ).toBeGreaterThan(0);
      const shown = await page
        .getByRole("region", { name: "Pick a start time" })
        .or(
          page.locator("section", {
            has: page.getByRole("heading", { name: "Pick a start time" }),
          }),
        )
        .first()
        .getByRole("radio", { disabled: false })
        .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
      // The appointment's own start is the disabled "Your time" chip.
      expect(shown.sort()).toEqual(
        withCar.filter((s) => s !== fri("10:00")).sort(),
      );
      const summary = page.getByRole("complementary", {
        name: "Moving your appointment",
      });
      await expect(
        summary.getByText("You will borrow a courtesy car"),
      ).toBeVisible();
      await expect(summary.getByRole("radio")).toHaveCount(0);
      await page
        .getByRole("radio", { name: /^\d\d:\d\d to \d\d:\d\d$/ })
        .last()
        .check();
      await shot(page, "courtesy-note", "reschedule");
    });

    test("staff: the same option in the third person, the summary says Borrows a courtesy car, and a 409 says someone else took the last one", async ({
      page,
      context,
    }) => {
      await start(page, width, STAFF_BOOK, "Staff");
      const group = page.getByRole("group", {
        name: "What will the customer do with the car?",
      });
      await expect(group.getByRole("radio")).toHaveCount(3);
      await day(page, "Fri 30 Oct").check();
      await chip(page, "10:00 to 13:00").check();
      await option(page, "Borrows a courtesy car").check();
      await expect(option(page, "Borrows a courtesy car")).toBeChecked();
      await expect(
        page
          .getByRole("complementary", { name: /^Booking for/ })
          .getByText("Borrows a courtesy car"),
      ).toBeVisible();
      await shot(page, "courtesy-chosen", "book-staff");

      // A second page takes the car with an EV check at 10:00.
      const other = await context.newPage();
      await other.clock.setFixedTime(NOW);
      await openApp(other);
      await takeTheCar(other, "10:00");
      await other.close();

      await confirm(page).click();
      const heading = page.getByText(
        "Sorry, no courtesy car is free from 10:00 to 13:00 any more.",
      );
      await expect(heading).toBeFocused();
      await expect(
        page.getByText(
          "Someone else took the last one a moment before you. Nothing was booked. You can still book 10:00 and the customer can wait or drop the car off, or pick a time when a courtesy car is free.",
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("radiogroup", {
          name: "Closest times with a courtesy car",
        }),
      ).toBeVisible();
      await expect(option(page, STAFF_CAR_OFF)).toBeDisabled();
      await shot(page, "conflict-courtesy", "book-staff");
    });
  });
}

test("NFR-7: at every width the three options are rows of at least 44 px, 8 px apart, with no sideways scroll", async ({
  page,
}) => {
  await start(page, 1440, DEEP);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    const rows = page
      .getByRole("group", { name: "What will you do with the car?" })
      .locator("label > span");
    await expect(rows).toHaveCount(3);
    const boxes = await rows.evaluateAll((els) =>
      els.map((e) => e.getBoundingClientRect()),
    );
    for (const box of boxes) expect(box.height).toBeGreaterThanOrEqual(44);
    for (let i = 1; i < boxes.length; i++)
      expect(
        Math.round(boxes[i]!.top - boxes[i - 1]!.bottom),
      ).toBeGreaterThanOrEqual(8);
    await expectNoSidewaysScroll(page);
  }
});

test("video: a customer chooses a courtesy car, sees it greyed out for a busy time, then gets the no-car-left apology", async ({
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
  const slow = (page: Page) => page.waitForTimeout(1000);
  const first = await context.newPage();
  await first.clock.setFixedTime(NOW);
  await openApp(first);
  // The only car is out from 14:00 to 15:00 on Fri 30 Oct.
  await takeTheCar(first, "14:00");
  await pickRole(first, "Customer");
  await first.goto(`/book?dealership=${LONDON}&service=service-ev-check`);
  const second = await context.newPage();
  await second.clock.setFixedTime(NOW);
  await second.goto(DEEP);
  await expect(day(second, "Wed 28 Oct")).toBeChecked();
  await slow(second);
  await second
    .getByRole("combobox", { name: /^Car/ })
    .selectOption("vehicle-a");
  await slow(second);
  await day(second, "Fri 30 Oct").check();
  await slow(second);
  await chip(second, "13:00 to 16:00").check();
  await expect(option(second, CAR_OFF)).toBeDisabled();
  await second.waitForTimeout(2500);
  await chip(second, "10:00 to 13:00").check();
  await expect(option(second, CAR)).toBeEnabled();
  await slow(second);
  await option(second, CAR).check();
  await second.waitForTimeout(1500);

  // Meanwhile the first page takes the car at 10:00.
  await first.bringToFront();
  await carAndDay(first);
  await chip(first, "10:00 to 11:00").check();
  await option(first, CAR).check();
  await slow(first);
  await confirm(first).click();
  await expect(
    first.getByRole("heading", { level: 1, name: "You are booked" }),
  ).toBeVisible();
  await first.waitForTimeout(1500);

  await second.bringToFront();
  await slow(second);
  await confirm(second).click();
  await expect(
    second.getByText(
      "Sorry, no courtesy car is free from 10:00 to 13:00 any more.",
    ),
  ).toBeVisible();
  await second.waitForTimeout(3000);
  await second
    .getByRole("radiogroup", { name: "Closest times with a courtesy car" })
    .getByRole("radio")
    .first()
    .check();
  await second.waitForTimeout(2000);
  await context.close();
});
