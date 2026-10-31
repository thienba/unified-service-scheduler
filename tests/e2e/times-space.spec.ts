// The times hold their space while they load (D-0001-149). At 390 wide the car choice sits below the times; when
// the times arrive it must not move far, or a press on it that spans that moment ends on another element and no
// click fires. The answers of the availability calls are held by a gate in the page's own `fetch`, so the test
// decides when the times arrive. (`page.route` cannot see calls the service worker answers.)
import { expect, test, type Page } from "@playwright/test";
import { LONDON, STAFF, api, book } from "./schedule-data";
import {
  chooseOption,
  expectNoAxeViolations,
  expectNoSidewaysScroll,
  openApp,
  pickRole,
  selectNamed,
} from "./support";

// Saturday 00:30 in London: today is the first open day, a whole one with no bookings, and so is the next
// Saturday. On a Saturday the hours and the technicians' shifts end together, so the hours say how many times
// the day has (see Q-0001-150).
const NOW = new Date("2026-10-31T00:30:00Z");
// Monday 06:00 in London: a weekday, where the shifts end before closing, so the hours count 2 starts too many.
const WEEKDAY = new Date("2026-10-26T06:00:00Z");
const WIDTH = 390;
const MOVE = 24;

declare global {
  interface Window {
    gateOpen: () => void;
    gateClose: () => void;
  }
}

/** Before the page's code runs: while the gate is closed, availability calls wait for it to open. */
async function addGate(page: Page) {
  await page.addInitScript(() => {
    let gate: Promise<void> | null = null;
    let open = () => {};
    window.gateClose = () => {
      gate ??= new Promise<void>((resolve) => (open = resolve));
    };
    window.gateOpen = () => {
      open();
      gate = null;
    };
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (gate && url.includes("/availability")) await gate;
      return original(input, init);
    };
  });
}

const closeGate = (page: Page) => page.evaluate(() => window.gateClose());
const openGate = (page: Page) => page.evaluate(() => window.gateOpen());

const carChoice = (page: Page) =>
  page.getByRole("radio", { name: /^Waits? on site$/ });
const aTime = (page: Page) =>
  page.getByRole("radio", { name: /^\d\d:\d\d to \d\d:\d\d$/ }).first();
const service = (page: Page) => selectNamed(page, "Service (required)");

/** The room under the last time, inside the times section: none when the area fits its content. */
async function leftover(page: Page) {
  return page.evaluate(() => {
    const section = document.querySelector(
      "section[aria-labelledby=times-title]",
    );
    const last = [...(section?.querySelectorAll("label") ?? [])].pop();
    return section && last
      ? section.getBoundingClientRect().bottom -
          last.getBoundingClientRect().bottom
      : 999;
  });
}

type Who = "customer" | "staff";

/** Opens the booking page on the open day with the car chosen, and the gate closed. */
async function openBook(
  page: Page,
  who: Who,
  options: { now?: Date; width?: number; busy?: boolean } = {},
) {
  await page.setViewportSize({ width: options.width ?? WIDTH, height: 900 });
  await addGate(page);
  await page.clock.setFixedTime(options.now ?? NOW);
  await openApp(page);
  if (options.busy) {
    // Both mechanics are booked most of Monday 26 Oct, so few times are left.
    for (const [technicianId, times] of [
      ["tech-lon-ash", ["08:00", "09:15", "10:30", "13:00", "14:15", "15:30"]],
      [
        "tech-lon-birch",
        ["09:00", "10:15", "11:30", "12:45", "14:00", "15:15", "16:30"],
      ],
    ] as const)
      for (const time of times)
        await book(page, {
          date: "2026-10-26",
          time,
          technicianId,
          registration: `BK${time.replace(":", "")} ${technicianId.slice(8, 11).toUpperCase()}`,
        });
  }
  if (who === "customer") {
    await pickRole(page, "Customer");
    await page.goto(`/book?dealership=${LONDON}`);
    await chooseOption(page.getByRole("button", { name: /^Car/ }), "vehicle-a");
    return;
  }
  const made = await api(page, STAFF, "POST", "/appointments", {
    dealershipId: LONDON,
    serviceTypeId: "service-oil-change",
    start: "2026-11-06T09:00:00Z",
    transport: "wait",
    newCustomer: { name: "Marta Kowalska", phone: "07700 900123" },
    newVehicle: { registration: "AB12 CDE", make: "Ford", model: "Focus" },
  });
  expect(made.status).toBe(201);
  await pickRole(page, "Staff");
  const dismiss = page.getByRole("button", { name: "Dismiss" });
  if (await dismiss.isVisible()) await dismiss.click();
  await page.goto("/book/for-customer");
  await page
    .getByRole("searchbox", { name: "Name, phone or number plate" })
    .fill("Kowal");
  await page
    .getByRole("group", { name: /found$/ })
    .getByRole("radio", { name: /^Marta Kowalska/ })
    .check();
  await page.getByRole("radio", { name: "Ford Focus, AB12 CDE" }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/book\?.*customerId=.*vehicleId=/);
  await expect(service(page)).toBeVisible();
}

/** Reports how far the car choice's place on the page moved from now until `stop()` is called. */
async function watchPlace(page: Page) {
  await page.evaluate(() => {
    const top = () => {
      const radio = [...document.querySelectorAll("input[type=radio]")].find(
        (r) =>
          /^Waits? on site$/.test(
            (r as HTMLInputElement).labels?.[0]?.textContent?.trim() ?? "",
          ),
      );
      return radio ? radio.getBoundingClientRect().top + scrollY : null;
    };
    const seen: number[] = [];
    let running = true;
    const tick = () => {
      const now = top();
      if (now !== null) seen.push(now);
      if (running) requestAnimationFrame(tick);
    };
    tick();
    (window as unknown as { stopWatch: () => number }).stopWatch = () => {
      running = false;
      return seen.length ? Math.max(...seen) - Math.min(...seen) : -1;
    };
  });
  return () =>
    page.evaluate(() =>
      (window as unknown as { stopWatch: () => number }).stopWatch(),
    );
}

/** Two frames with no change in the page's height. */
const settled = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done())),
      ),
  );

for (const who of ["customer", "staff"] as const) {
  test.describe(`${who} at ${WIDTH} wide`, () => {
    test("from choosing the service until the times show, the car choice moves at most 24 px; the loading look and states are kept", async ({
      page,
    }) => {
      await openBook(page, who);
      await closeGate(page);
      await chooseOption(service(page), "service-oil-change");
      // The loading status is still said to a screen reader, and the page does not scroll sideways.
      await expect(
        page
          .getByRole("status")
          .filter({ hasText: "Loading the days and times" }),
      ).toBeAttached();
      await expect(carChoice(page)).toBeVisible();
      await page.waitForTimeout(400);
      await expectNoSidewaysScroll(page);
      const stop = await watchPlace(page);
      await openGate(page);
      await expect(aTime(page)).toBeVisible();
      await settled(page);
      expect(await stop()).toBeLessThanOrEqual(MOVE);
      await expectNoAxeViolations(page);
    });

    test("a press on the car choice that spans the arrival of the times chooses it", async ({
      page,
    }) => {
      await openBook(page, who);
      await closeGate(page);
      await chooseOption(service(page), "service-oil-change");
      const radio = carChoice(page);
      await radio.scrollIntoViewIfNeeded();
      const box = (await radio.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await openGate(page);
      await expect(aTime(page)).toBeVisible();
      await settled(page);
      await page.mouse.up();
      await expect(radio).toBeChecked();
    });

    test("choosing the courtesy car or the next week while times load does not move the car choice", async ({
      page,
    }) => {
      await openBook(page, who);
      await chooseOption(service(page), "service-oil-change");
      await expect(aTime(page)).toBeVisible();
      await settled(page);
      for (const change of [
        () => page.getByRole("radio", { name: /courtesy car/i }).check(),
        () => page.getByRole("button", { name: "Next week" }).click(),
      ]) {
        await closeGate(page);
        const stop = await watchPlace(page);
        await change();
        await page.waitForTimeout(400);
        await openGate(page);
        await expect(aTime(page)).toBeVisible();
        await settled(page);
        expect(await stop()).toBeLessThanOrEqual(MOVE);
      }
    });

    for (const busy of [false, true]) {
      const day = busy ? "a day with many bookings" : "a weekday";
      test(`D-0001-150: on ${day}, scrolled up, a press that spans the arrival chooses the car choice and it does not move; the area fits after the release or a cancel`, async ({
        page,
      }) => {
        await openBook(page, who, { now: WEEKDAY, busy });
        for (const end of ["up", "cancel", "blur"] as const) {
          await page.reload();
          await expect(service(page)).toBeVisible();
          await closeGate(page);
          await chooseOption(service(page), "service-oil-change");
          const radio = carChoice(page);
          await radio.scrollIntoViewIfNeeded();
          await page.evaluate(() => scrollBy(0, -250));
          const box = (await radio.boundingBox())!;
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await openGate(page);
          await expect(aTime(page)).toBeVisible();
          await settled(page);
          expect(Math.abs((await radio.boundingBox())!.y - box.y)).toBeLessThan(
            1,
          );
          if (end === "cancel")
            await page.evaluate(() =>
              window.dispatchEvent(new PointerEvent("pointercancel")),
            );
          if (end === "blur")
            await page.evaluate(() => window.dispatchEvent(new Event("blur")));
          if (end === "up") await page.mouse.up();
          await expect.poll(() => leftover(page)).toBeLessThan(2);
          if (end === "up") await expect(radio).toBeChecked();
          else await page.mouse.up();
        }
      });
    }

    test("at 320 wide the loading state does not scroll sideways", async ({
      page,
    }) => {
      await openBook(page, who, { width: 320 });
      await closeGate(page);
      await chooseOption(service(page), "service-oil-change");
      await page.waitForTimeout(400);
      await expectNoSidewaysScroll(page);
      await openGate(page);
      await expect(aTime(page)).toBeVisible();
    });
  });
}
