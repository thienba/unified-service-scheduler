// Warn early when the chosen time is taken (D-0001-107 C). Page A chooses a time and leaves it chosen; page B books
// that time; page A shows the apology at its next check, without pressing Confirm. Page A's clock is Playwright's
// clock, so the 30 seconds pass at once. The contested time comes from the data (the seeded EV check of customer
// A, when Oliver Hughes is busy and Tom Fletcher is the one free EV technician), so the tests work on any weekday.
// With EVIDENCE_DIR set the screenshots at 390 and 1440 and the video are kept.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  checkAnswered,
  posts,
  recordChecks,
  recordPosts,
} from "./customer-support";
import {
  A,
  B,
  LONDON,
  contestedEvStart,
  MANAGER,
  STAFF,
  api,
  beat,
  evidenceDir,
  keepVideo,
  londonDate,
  londonDay,
  londonTime,
  open,
  plusMinutes,
  signInAs,
} from "./demo-support";
import {
  expectNoAxeViolations,
  expectNoSidewaysScroll,
  chooseOption,
  typeDate,
  dateNamed,
  selectNamed,
} from "./support";

const EV = "service-ev-check";
const OLIVER = "tech-lon-ash";
const TOM = "tech-lon-cedar";
const CHECK_MS = 30_000;

interface Appointment {
  id: string;
  start: string;
  end: string;
  serviceTypeId: string;
}

async function freeFor(page: Page, start: string, tech: string) {
  const answer = await api<{ available: boolean }>(
    page,
    STAFF,
    "POST",
    "/availability-checks",
    {
      dealershipId: LONDON,
      serviceTypeId: EV,
      start,
      transport: "wait",
      technicianId: tech,
    },
  );
  expect(answer.status).toBe(200);
  return answer.body.available;
}

/** A start where Oliver Hughes is busy and Tom Fletcher is the one free EV technician, and A's and B's cars are free. */
async function contestedStart(page: Page): Promise<string> {
  const start = await contestedEvStart(page);
  expect(await freeFor(page, start, OLIVER)).toBe(false);
  expect(await freeFor(page, start, TOM)).toBe(true);
  return start;
}

/** A new EV check for customer A on the contested day, away from the contested hour (to be moved onto it). */
async function anotherEvCheck(page: Page, contested: string) {
  for (const minutes of [120, -120, 180, -180, 240, -240, 300]) {
    const start = plusMinutes(contested, minutes);
    const answer = await api<Appointment>(page, A, "POST", "/appointments", {
      dealershipId: LONDON,
      serviceTypeId: EV,
      vehicleId: "vehicle-a",
      start,
      transport: "wait",
    });
    if (answer.status === 201) return answer.body;
  }
  throw new Error("No free start for a second EV check on the contested day.");
}

/** Customer B books the contested time through the API. */
async function bBooks(page: Page, start: string) {
  const answer = await api(page, B, "POST", "/appointments", {
    dealershipId: LONDON,
    serviceTypeId: EV,
    vehicleId: "vehicle-b",
    start,
    transport: "wait",
  });
  expect(answer.status).toBe(201);
}

/** A page signed in as `user`, with Playwright's clock in charge of its timers. */
async function pageFor(
  context: import("@playwright/test").BrowserContext,
  user: string,
  width: number,
  clock: boolean,
) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height: width < 640 ? 844 : 900 });
  if (clock) await page.clock.install();
  await signInAs(page, user);
  await recordPosts(page);
  await recordChecks(page);
  await open(page, "/");
  return page;
}

const apology = (start: string) =>
  `Sorry, ${londonTime(start)} on ${londonDay(start)} was just taken.`;
const timeChip = (start: string) =>
  `${londonTime(start)} to ${londonTime(plusMinutes(start, 60))}`;

async function chooseOnBook(page: Page, start: string, car: string) {
  await page
    .getByRole("radio", { name: new RegExp(`^${londonDay(start)},`) })
    .check();
  await page.getByRole("radio", { name: timeChip(start), exact: true }).check();
  const choice = page.getByRole("radio", { name: car });
  await choice.check();
  await choice.focus();
  return choice;
}

/** The bookings and moves page A had sent (the test's own API calls from the page count too). */
const sent = new WeakMap<Page, number>();
const sentNow = async (page: Page) =>
  (await posts(page, "/appointments")).length +
  (await posts(page, "/reschedule")).length;

/** What every early apology must be: found before Confirm, announced politely, focus left alone. */
async function expectEarly(page: Page, title: string) {
  const heading = page.getByRole("heading", { name: title });
  await expect(heading).toBeVisible();
  await expect(heading).not.toBeFocused();
  await expect(page.getByRole("status").filter({ hasText: title })).toHaveCount(
    1,
  );
  // Confirm was never pressed: no booking or move was sent from the page while the 30 seconds passed.
  expect(await sentNow(page)).toBe(sent.get(page));
}

/** Moves page A's clock by one check period; the apology was not there before it. */
async function nextCheck(page: Page, title: string) {
  await expect(page.getByRole("heading", { name: title })).toHaveCount(0);
  sent.set(page, await sentNow(page));
  await page.clock.runFor(CHECK_MS);
}

async function evidence(page: Page, name: string) {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width < 640 ? 844 : 900 });
    await expectNoSidewaysScroll(page);
    await expectNoAxeViolations(page);
    if (!evidenceDir) continue;
    mkdirSync(path.join(evidenceDir, "shots"), { recursive: true });
    await page.screenshot({
      path: path.join(evidenceDir, "shots", `${name}-${width}.png`),
      fullPage: true,
    });
  }
}

test("D-0001-107, REQ-BOOK-009.AC-2: book: page B books the time page A chose; page A shows the apology at its next check, before Confirm, focus kept", async ({
  context,
}) => {
  const a = await pageFor(context, A, 1440, true);
  const b = await pageFor(context, B, 1440, false);
  const start = await contestedStart(a);
  const link = `/book?dealership=${LONDON}&service=${EV}&date=${londonDate(start)}`;
  await a.goto(link);
  await chooseOption(a.getByRole("button", { name: /^Car/ }), "vehicle-a");
  const choice = await chooseOnBook(a, start, "Wait on site");
  // The check sent when the time was chosen answers first (it found the time free); B books after it.
  await checkAnswered(a, start);

  // Page B books the same time through its own booking page.
  await b.goto(link);
  await chooseOption(b.getByRole("button", { name: /^Car/ }), "vehicle-b");
  await chooseOnBook(b, start, "Wait on site");
  await b.getByRole("button", { name: "Confirm booking" }).click();
  await expect(
    b.getByRole("heading", { level: 1, name: "You are booked" }),
  ).toBeVisible();

  await nextCheck(a, apology(start));
  await expectEarly(a, apology(start));
  await expect(choice).toBeFocused();
  await expect(choice).toBeChecked();
  await expect(a.getByRole("button", { name: /^Car/ })).toHaveAttribute(
    "data-value",
    "vehicle-a",
  );
  await expect(
    a.getByRole("button", { name: "Pick a new time to confirm" }),
  ).toHaveCount(1);
  const closest = a
    .getByRole("radiogroup", { name: "Closest to your time" })
    .getByRole("radio");
  expect(await closest.count()).toBeGreaterThan(0);
  expect(await closest.count()).toBeLessThanOrEqual(5);
  await evidence(a, "early-apology-book");
});

test("D-0001-107: staff book: page B books the time staff chose for a customer; the staff page shows Someone else's apology at its next check", async ({
  context,
}) => {
  const a = await pageFor(context, STAFF, 1440, true);
  const start = await contestedStart(a);
  await a.goto(
    `/book?dealership=${LONDON}&service=${EV}&customerId=customer-a&vehicleId=vehicle-a&date=${londonDate(start)}`,
  );
  const choice = await chooseOnBook(a, start, "Waits on site");
  // The check sent when the time was chosen answers first (it found the time free); B books after it.
  await checkAnswered(a, start);
  await bBooks(a, start);
  await nextCheck(a, apology(start));
  await expectEarly(a, apology(start));
  await expect(
    a.getByText(/^Someone else confirmed that time a moment before you did\./),
  ).toBeVisible();
  await expect(choice).toBeFocused();
  await expect(
    a.getByRole("button", { name: "Pick a new time to confirm" }),
  ).toHaveCount(1);
});

test("D-0001-107, REQ-BOOK-012.AC-3: reschedule: page B books the new time page A chose; page A shows the apology at its next check and the appointment has not changed", async ({
  context,
}) => {
  const a = await pageFor(context, A, 1440, true);
  const start = await contestedStart(a);
  const moving = await anotherEvCheck(a, start);
  await a.goto(`/appointments/${moving.id}/reschedule`);
  await a
    .getByRole("radio", { name: new RegExp(`^${londonDay(start)},`) })
    .check();
  const chip = a.getByRole("radio", { name: timeChip(start), exact: true });
  await chip.check();
  // The check sent when the time was chosen answers first (it found the time free); B books after it.
  await checkAnswered(a, start);
  await bBooks(a, start);
  await nextCheck(a, apology(start));
  await expectEarly(a, apology(start));
  await expect(
    a.getByText(/^Another customer confirmed that time a moment before you\./),
  ).toBeVisible();
  // The chosen chip is redrawn as "Just taken", so focus goes to a time of the same group, not to the page.
  await expect(
    a.getByRole("radio", { name: `${londonTime(start)}, just taken` }),
  ).toBeDisabled();
  await expect
    .poll(() =>
      a.evaluate(() => {
        const now = document.activeElement as HTMLInputElement;
        return `${now.type} ${now.name} ${now.disabled}`;
      }),
    )
    .toBe("radio new-start false");
  await expect(
    a.getByRole("button", { name: "Pick a new time to confirm" }),
  ).toHaveCount(1);
  const closest = a
    .getByRole("radiogroup", { name: "Closest to your time" })
    .getByRole("radio");
  expect(await closest.count()).toBeLessThanOrEqual(5);
  const kept = await api<Appointment>(
    a,
    A,
    "GET",
    `/appointments/${moving.id}`,
  );
  expect(kept.body.start).toBe(moving.start);
  await evidence(a, "early-apology-reschedule");
});

test("D-0001-107: adjust: page B books the start the manager typed; the clash state shows at the next check, before Save, focus kept in the field", async ({
  context,
}) => {
  const a = await pageFor(context, MANAGER, 1440, true);
  const start = await contestedStart(a);
  const moving = await anotherEvCheck(a, start);
  await a.goto(`/appointments/${moving.id}/adjust`);
  await typeDate(dateNamed(a, "Date"), londonDate(start));
  const time = selectNamed(a, "Start time");
  await chooseOption(time, londonTime(start));
  await time.focus();
  // The check sent when the time was chosen answers first (it found the time free); B books after it.
  await checkAnswered(a, start);
  await bBooks(a, start);
  // Save was not pressed, so the early title does not say a change was not saved (D-0001-111).
  const title = "That time is no longer free.";
  await nextCheck(a, title);
  await expect(
    a.getByRole("heading", { name: "That change was not saved." }),
  ).toHaveCount(0);
  await expect(a.getByRole("heading", { name: title })).toBeVisible();
  await expect(a.getByRole("heading", { name: title })).not.toBeFocused();
  await expect(a.getByRole("status").filter({ hasText: title })).toHaveCount(1);
  await expect(time).toBeFocused();
  // A warning, not a refusal: Save stays on and still checks for itself.
  await expect(
    a.getByRole("button", { name: "Save change" }).first(),
  ).toBeEnabled();
  await expect(
    a.getByRole("group", { name: "Closest times that are free" }),
  ).toBeVisible();
  const kept = await api<Appointment>(
    a,
    MANAGER,
    "GET",
    `/appointments/${moving.id}`,
  );
  expect(kept.body.start).toBe(moving.start);
});

test("D-0001-107: a failed check shows nothing new and does not block Confirm, which still runs its own check", async ({
  context,
}) => {
  const a = await pageFor(context, A, 1440, true);
  const start = await contestedStart(a);
  // From the next load, every early check fails (the page's own fetch answers 500 for it, D-0001-64).
  await a.addInitScript(() => {
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const request = input instanceof Request ? input : null;
      const url = new URL(request ? request.url : String(input), location.href);
      if (url.pathname.endsWith("/availability-checks"))
        return new Response(
          JSON.stringify({ status: 500, code: "INTERNAL", title: "INTERNAL" }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      return original(input, init);
    };
  });
  await a.goto(
    `/book?dealership=${LONDON}&service=${EV}&date=${londonDate(start)}`,
  );
  await chooseOption(a.getByRole("button", { name: /^Car/ }), "vehicle-a");
  await chooseOnBook(a, start, "Wait on site");
  await bBooks(a, start);
  const before = (await posts(a, "/appointments")).length;
  await a.clock.runFor(CHECK_MS);
  await expect(a.getByRole("heading", { name: apology(start) })).toHaveCount(0);
  await expect(
    a.getByText(/Something went wrong|could not reach|could not check/),
  ).toHaveCount(0);
  const confirm = a.getByRole("button", { name: "Confirm booking" });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  // Confirm's own check answers 409: the apology after Confirm takes focus as before.
  await expect(a.getByRole("heading", { name: apology(start) })).toBeFocused();
  expect(await posts(a, "/appointments")).toHaveLength(before + 1);
});

test("early warning video: page A has a time chosen, page B books it, page A shows the apology without pressing Confirm", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const size = { width: 1280, height: 800 };
  const context = await browser.newContext({
    viewport: size,
    recordVideo: { dir: testInfo.outputPath("early-video"), size },
  });
  const a = await pageFor(context, A, size.width, true);
  const b = await pageFor(context, B, size.width, false);
  await b.setViewportSize(size);
  const start = await contestedStart(a);
  const link = `/book?dealership=${LONDON}&service=${EV}&date=${londonDate(start)}`;
  await a.goto(link);
  await beat(a);
  await chooseOption(a.getByRole("button", { name: /^Car/ }), "vehicle-a");
  await beat(a);
  await chooseOnBook(a, start, "Wait on site");
  // The check sent when the time was chosen answers first (it found the time free); B books after it.
  await checkAnswered(a, start);
  await beat(a, 1500);
  await b.goto(link);
  await beat(b);
  await chooseOption(b.getByRole("button", { name: /^Car/ }), "vehicle-b");
  await beat(b);
  await chooseOnBook(b, start, "Wait on site");
  await beat(b);
  await b.getByRole("button", { name: "Confirm booking" }).click();
  await expect(
    b.getByRole("heading", { level: 1, name: "You are booked" }),
  ).toBeVisible();
  await beat(b, 1500);
  await nextCheck(a, apology(start));
  await expectEarly(a, apology(start));
  await beat(a, 3000);
  await keepVideo(a, "early-warning-page-a");
  await keepVideo(b, "early-warning-page-b");
  await context.close();
});
