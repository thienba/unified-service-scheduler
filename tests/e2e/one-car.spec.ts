// One car, one appointment at a time (D-0001-146), on the screens. The times come from the data: customer A's
// seeded EV check holds A's car from `seeded.start` for an hour. A second car is added for customer A, so the same
// customer has a car that is busy then and a car that is free then. With EVIDENCE_DIR set the screenshots at 390 and
// 1440 are kept in `<EVIDENCE_DIR>/shots`.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { posts, recordPosts } from "./customer-support";
import {
  A,
  LONDON,
  MANAGER,
  STAFF,
  api,
  evidenceDir,
  londonDate,
  londonDay,
  londonTime,
  open,
  plusMinutes,
  signInAs,
} from "./demo-support";
import {
  chooseOption,
  dateNamed,
  expectNoAxeViolations,
  expectNoSidewaysScroll,
  selectNamed,
  typeDate,
} from "./support";

const EV = "service-ev-check";
const CHECK_MS = 30_000;
const APOLOGY = "This car already has an appointment at that time.";

interface Booked {
  id: string;
  start: string;
  end: string;
  vehicleId: string;
  serviceTypeId: string;
}

/** Customer A's seeded EV check. */
async function seededCheck(page: Page): Promise<Booked> {
  const mine = await api<Booked[]>(page, A, "GET", "/appointments");
  const seeded = mine.body.find((a) => a.serviceTypeId === EV);
  if (!seeded) throw new Error("The seed has no EV check for customer A.");
  return seeded;
}

/** Staff add a second car to customer A with an EV check three hours after the seeded one; returns that car's id. */
async function secondCar(page: Page, seeded: Booked): Promise<string> {
  const answer = await api<Booked>(page, STAFF, "POST", "/appointments", {
    dealershipId: LONDON,
    serviceTypeId: EV,
    customerId: "customer-a",
    newVehicle: { registration: "TW02 CAR", make: "Demo Motors", model: "Van" },
    start: plusMinutes(seeded.start, 180),
    transport: "wait",
  });
  expect(answer.status).toBe(201);
  return answer.body.vehicleId;
}

const timeChip = (start: string) =>
  `${londonTime(start)} to ${londonTime(plusMinutes(start, 60))}`;
const chip = (page: Page, start: string) =>
  page.getByRole("radio", { name: timeChip(start), exact: true });
const dayTile = (page: Page, start: string) =>
  page.getByRole("radio", { name: new RegExp(`^${londonDay(start)},`) });
const bookAddress = (seeded: Booked, extra = "") =>
  `/book?dealership=${LONDON}&service=${EV}&date=${londonDate(seeded.start)}${extra}`;
const carButton = (page: Page) => page.getByRole("button", { name: /^Car/ });

/** The number in a day tile's name: "Sat 31 Oct, 12 times". */
async function timesOn(page: Page, start: string): Promise<number> {
  const name = (await dayTile(page, start).getAttribute("aria-label")) ?? "";
  const found = /(\d+) times?/.exec(name);
  if (!found) throw new Error(`No count in the day tile "${name}".`);
  return Number(found[1]);
}

async function pageFor(
  context: BrowserContext,
  user: string,
  width: number,
  clock = false,
) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height: width < 640 ? 844 : 900 });
  if (clock) await page.clock.install();
  await signInAs(page, user);
  await recordPosts(page);
  await open(page, "/");
  return page;
}

async function evidence(page: Page, name: string) {
  await expectNoSidewaysScroll(page);
  await expectNoAxeViolations(page);
  if (!evidenceDir) return;
  mkdirSync(path.join(evidenceDir, "shots"), { recursive: true });
  const width = page.viewportSize()?.width ?? 0;
  await page.screenshot({
    path: path.join(evidenceDir, "shots", `${name}-${width}.png`),
    fullPage: true,
  });
}

for (const width of [390, 1440]) {
  test.describe(`at ${width} wide`, () => {
    test("book: the busy car does not see its time, the other car does, and a forced confirm gets the apology with the closest times", async ({
      context,
    }) => {
      const page = await pageFor(context, A, width);
      const seeded = await seededCheck(page);
      const other = await secondCar(page, seeded);
      await page.goto(bookAddress(seeded));

      // The car with the appointment: its time is gone, and so is the time that only overlaps it.
      await chooseOption(carButton(page), "vehicle-a");
      await dayTile(page, seeded.start).check();
      const free = plusMinutes(seeded.start, 60);
      await expect(chip(page, free)).toBeVisible();
      await expect(chip(page, seeded.start)).toHaveCount(0);
      await expect(chip(page, plusMinutes(seeded.start, 30))).toHaveCount(0);
      await expect(chip(page, plusMinutes(seeded.start, -30))).toHaveCount(0);
      // Touching times stay: a car needs no rest between two appointments.
      await expect(chip(page, plusMinutes(seeded.start, -60))).toBeVisible();
      const busyCount = await timesOn(page, seeded.start);
      await evidence(page, "book-car-busy");

      // The other car of the same customer sees it, and the day counts follow the car.
      await chooseOption(carButton(page), other);
      await expect(chip(page, seeded.start)).toBeVisible();
      expect(await timesOn(page, seeded.start)).toBeGreaterThan(busyCount);

      // Someone books the same car for a time that overlaps the chosen one before Confirm is pressed.
      await chip(page, seeded.start).check();
      await page.getByRole("radio", { name: "Wait on site" }).check();
      const held = await api(page, STAFF, "POST", "/appointments", {
        dealershipId: LONDON,
        serviceTypeId: EV,
        customerId: "customer-a",
        vehicleId: other,
        start: plusMinutes(seeded.start, 30),
        transport: "wait",
      });
      expect(held.status).toBe(201);
      await page.getByRole("button", { name: "Confirm booking" }).click();
      const heading = page.getByRole("heading", { name: APOLOGY });
      await expect(heading).toBeVisible();
      await expect(heading).toBeFocused();
      await expect(
        page.getByText(/Another customer confirmed that time/),
      ).toHaveCount(0);
      await expect(
        page.getByText(/Nothing was booked.*Nothing was booked/),
      ).toHaveCount(0);
      const closest = page
        .getByRole("radiogroup", { name: "Closest to your time" })
        .getByRole("radio");
      expect(await closest.count()).toBeGreaterThan(0);
      expect(await closest.count()).toBeLessThanOrEqual(5);
      // Nothing was booked by the refused confirm: the two bookings for this car are the staff ones.
      const mine = await api<Booked[]>(page, A, "GET", "/appointments");
      expect(mine.body.filter((a) => a.vehicleId === other)).toHaveLength(2);
      await evidence(page, "book-forced-confirm");
    });

    test("staff book: the chips follow the car the staff chose", async ({
      context,
    }) => {
      const page = await pageFor(context, STAFF, width);
      const seeded = await seededCheck(page);
      const other = await secondCar(page, seeded);
      await page.goto(
        bookAddress(seeded, "&customerId=customer-a&vehicleId=vehicle-a"),
      );
      await dayTile(page, seeded.start).check();
      await expect(chip(page, plusMinutes(seeded.start, 60))).toBeVisible();
      await expect(chip(page, seeded.start)).toHaveCount(0);
      await evidence(page, "staff-book-car-busy");

      await page.goto(
        bookAddress(seeded, `&customerId=customer-a&vehicleId=${other}`),
      );
      await dayTile(page, seeded.start).check();
      await expect(chip(page, seeded.start)).toBeVisible();
    });

    test("reschedule: the car's other appointment hides its time, the appointment itself does not block", async ({
      context,
    }) => {
      const page = await pageFor(context, A, width);
      const seeded = await seededCheck(page);
      const moving = await api<Booked>(page, A, "POST", "/appointments", {
        dealershipId: LONDON,
        serviceTypeId: EV,
        vehicleId: "vehicle-a",
        start: plusMinutes(seeded.start, 300),
        transport: "wait",
      });
      expect(moving.status).toBe(201);
      await page.goto(`/appointments/${moving.body.id}/reschedule`);
      await dayTile(page, seeded.start).check();
      await expect(chip(page, plusMinutes(seeded.start, 60))).toBeVisible();
      await expect(chip(page, seeded.start)).toHaveCount(0);
      await expect(chip(page, plusMinutes(seeded.start, -30))).toHaveCount(0);
      // The moving appointment does not block itself: its own neighbours stay on offer.
      await expect(chip(page, plusMinutes(seeded.start, 285))).toBeVisible();
      await evidence(page, "reschedule-car-busy");
    });

    test("adjust: saving a time that overlaps the car's other appointment says so and changes nothing", async ({
      context,
    }) => {
      const page = await pageFor(context, MANAGER, width);
      const seeded = await seededCheck(page);
      const second = await api<Booked>(page, A, "POST", "/appointments", {
        dealershipId: LONDON,
        serviceTypeId: EV,
        vehicleId: "vehicle-a",
        start: plusMinutes(seeded.start, 300),
        transport: "wait",
      });
      expect(second.status).toBe(201);
      await page.goto(`/appointments/${second.body.id}/adjust`);
      await typeDate(dateNamed(page, "Date"), londonDate(seeded.start));
      await chooseOption(
        selectNamed(page, "Start time"),
        londonTime(seeded.start),
      );
      await page.getByRole("button", { name: "Save change" }).first().click();
      const title = page.getByRole("heading", {
        name: "That change was not saved.",
      });
      await expect(title).toBeVisible();
      await expect(page.getByText(new RegExp(`^${APOLOGY}`))).toBeVisible();
      await evidence(page, "adjust-car-busy");
      const kept = await api<Booked>(
        page,
        MANAGER,
        "GET",
        `/appointments/${second.body.id}`,
      );
      expect(kept.body.start).toBe(second.body.start);
    });
  });
}

test("book: the 30-second early warning says the car is busy before Confirm is pressed", async ({
  context,
}) => {
  const page = await pageFor(context, A, 1440, true);
  const seeded = await seededCheck(page);
  const other = await secondCar(page, seeded);
  await page.goto(bookAddress(seeded));
  await chooseOption(carButton(page), other);
  await dayTile(page, seeded.start).check();
  await chip(page, seeded.start).check();
  await page.getByRole("radio", { name: "Wait on site" }).check();
  // Someone books the same car for an overlapping time; the page learns of it at its next check.
  const held = await api(page, STAFF, "POST", "/appointments", {
    dealershipId: LONDON,
    serviceTypeId: EV,
    customerId: "customer-a",
    vehicleId: other,
    start: plusMinutes(seeded.start, 30),
    transport: "wait",
  });
  expect(held.status).toBe(201);
  await expect(page.getByRole("heading", { name: APOLOGY })).toHaveCount(0);
  const sent = (await posts(page, "/appointments")).length;
  await page.clock.runFor(CHECK_MS);
  const heading = page.getByRole("heading", { name: APOLOGY });
  await expect(heading).toBeVisible();
  await expect(heading).not.toBeFocused();
  await expect(
    page.getByRole("status").filter({ hasText: APOLOGY }),
  ).toHaveCount(1);
  // Confirm was never pressed: no booking was sent from the page while the 30 seconds passed.
  expect(await posts(page, "/appointments")).toHaveLength(sent);
  await evidence(page, "book-early-warning");
});

/** Customer A's second EV check, three hours after the seeded one, to be moved or adjusted. */
async function movingCheck(page: Page, seeded: Booked): Promise<Booked> {
  const moving = await api<Booked>(page, A, "POST", "/appointments", {
    dealershipId: LONDON,
    serviceTypeId: EV,
    vehicleId: "vehicle-a",
    start: plusMinutes(seeded.start, 300),
    transport: "wait",
  });
  expect(moving.status).toBe(201);
  return moving.body;
}

/** Staff book customer A's car for a time that overlaps `start`, behind the open page's back. */
async function makeCarBusy(page: Page, start: string) {
  const held = await api(page, STAFF, "POST", "/appointments", {
    dealershipId: LONDON,
    serviceTypeId: EV,
    customerId: "customer-a",
    vehicleId: "vehicle-a",
    start: plusMinutes(start, 30),
    transport: "wait",
  });
  expect(held.status).toBe(201);
}

test("reschedule: the 30-second early warning says the car is busy before Confirm is pressed", async ({
  context,
}) => {
  const page = await pageFor(context, A, 1440, true);
  const seeded = await seededCheck(page);
  const moving = await movingCheck(page, seeded);
  await page.goto(`/appointments/${moving.id}/reschedule`);
  const wanted = plusMinutes(seeded.start, 60);
  await dayTile(page, wanted).check();
  await chip(page, wanted).check();
  await makeCarBusy(page, wanted);
  await expect(page.getByRole("heading", { name: APOLOGY })).toHaveCount(0);
  const sent = (await posts(page, "/reschedule")).length;
  await page.clock.runFor(CHECK_MS);
  const heading = page.getByRole("heading", { name: APOLOGY });
  await expect(heading).toBeVisible();
  await expect(heading).not.toBeFocused();
  expect(await posts(page, "/reschedule")).toHaveLength(sent);
});

test("adjust: the 30-second early warning says the car is busy before Save is pressed", async ({
  context,
}) => {
  const page = await pageFor(context, MANAGER, 1440, true);
  const seeded = await seededCheck(page);
  const moving = await movingCheck(page, seeded);
  await page.goto(`/appointments/${moving.id}/adjust`);
  const wanted = plusMinutes(seeded.start, 60);
  await typeDate(dateNamed(page, "Date"), londonDate(wanted));
  await chooseOption(selectNamed(page, "Start time"), londonTime(wanted));
  await makeCarBusy(page, wanted);
  await expect(page.getByText(new RegExp(`^${APOLOGY}`))).toHaveCount(0);
  await page.clock.runFor(CHECK_MS);
  await expect(page.getByText(new RegExp(`^${APOLOGY}`))).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "That time is no longer free." }),
  ).toBeVisible();
});
