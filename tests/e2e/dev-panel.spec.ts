// The dev panel in a real browser (C7): numbers equal to the API, logs with references, the privacy promise,
// reset, every state at 390 and 1440 with axe, and no sideways scroll (NFR-4, NFR-6, NFR-7, SEC-10, AD-17).
// The telemetry is counted per tab, so every request is sent from the tab that then opens the panel, and the
// panel is reached by its footer link (a reload would clear the numbers).
import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { Telemetry } from "../../src/ui/features/dev/telemetry";
import {
  expectNoAxeViolations,
  expectNoSidewaysScroll,
  interceptApi,
  openApp,
  pickRole,
  problemBody,
  widths,
} from "./support";

const LONDON = "dealership-london";
const EV_CHECK = "service-ev-check";
const OIL = "service-oil-change";
const CANARY = {
  name: "Zz Canary Name",
  phone: "+0 000 0000",
  email: "canary@example.invalid",
  registration: "ZZ00 CNR",
};
/** Where the screenshots go: the ticket's evidence folder when the run names it. */
const shots =
  process.env["EVIDENCE_DIR"] ??
  path.resolve("test-results/evidence/dev-panel");

interface Answer<T = unknown> {
  status: number;
  traceId: string | null;
  body: T;
}

type Id = { id: string };
type Refusal = { code: string; reasons: string[] };

/** Calls the API from inside the page, as the app's own code would, so the call is counted in this tab. */
async function api<T = unknown>(
  page: Page,
  url: string,
  options: { user: string; method?: string; body?: unknown },
): Promise<Answer<T>> {
  return (await page.evaluate(
    async ({ url, options }) => {
      const response = await fetch(`/api${url}`, {
        method: options.method ?? "GET",
        headers: {
          "X-Demo-User": options.user,
          ...(options.method === "POST" && url === "/appointments"
            ? { "Idempotency-Key": crypto.randomUUID() }
            : {}),
          ...(options.body ? { "Content-Type": "application/json" } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      const text = await response.text();
      return {
        status: response.status,
        traceId: response.headers.get("X-Trace-Id"),
        body: text ? JSON.parse(text) : null,
      };
    },
    { url, options },
  )) as Answer<T>;
}

const booking = (start: string, extra: Record<string, unknown> = {}) => ({
  dealershipId: LONDON,
  serviceTypeId: EV_CHECK,
  start,
  transport: "wait",
  vehicleId: "vehicle-a",
  ...extra,
});

/** The next Sunday in London: the dealership is closed, so a day search finds no free time. */
function nextSunday(): string {
  const day = new Date();
  for (;;) {
    day.setUTCDate(day.getUTCDate() + 1);
    const local = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      weekday: "short",
    }).format(day);
    if (local === "Sun")
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/London",
      }).format(day);
  }
}

const londonDate = (instant: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(
    new Date(instant),
  );

interface Story {
  contested: string;
  booked: Answer<Id>;
  refused: Answer<Refusal>;
  canary: Answer<Id>;
}

/**
 * The real use the ticket asks for, from this tab: one customer booking, a second booking for the same time
 * (409 SLOT_UNAVAILABLE), one day search with no free time, one failed call, and a staff booking for a new
 * customer with the canary details of SEC-10.
 */
async function tellTheStory(page: Page): Promise<Story> {
  const mine = await api<{ start: string }[]>(page, "/appointments", {
    user: "user-customer-a",
  });
  const contested = mine.body[0]!.start;
  // Cedar is the one free EV technician then: the first booking takes them, the second is refused.
  const booked = await api<Id>(page, "/appointments", {
    user: "user-customer-a",
    method: "POST",
    body: booking(contested),
  });
  expect(booked.status).toBe(201);
  const refused = await api<Refusal>(page, "/appointments", {
    user: "user-customer-b",
    method: "POST",
    body: booking(contested, { vehicleId: "vehicle-b" }),
  });
  expect(refused.status).toBe(409);
  expect(refused.body.code).toBe("SLOT_UNAVAILABLE");
  const empty = await api<{ slots: unknown[] }>(
    page,
    `/dealerships/${LONDON}/availability?serviceTypeId=${OIL}&date=${nextSunday()}&transport=wait`,
    { user: "user-customer-a" },
  );
  expect(empty.body.slots).toEqual([]);
  const missing = await api(page, "/appointments/no-such-appointment", {
    user: "user-customer-a",
  });
  expect(missing.status).toBe(404);
  const later = new Date(new Date(contested).getTime() + 3 * 3_600_000)
    .toISOString()
    .replace(".000Z", "Z");
  const canary = await api<Id>(page, "/appointments", {
    user: "user-staff-london",
    method: "POST",
    body: {
      dealershipId: LONDON,
      serviceTypeId: OIL,
      start: later,
      transport: "wait",
      newCustomer: {
        name: CANARY.name,
        phone: CANARY.phone,
        email: CANARY.email,
      },
      newVehicle: { registration: CANARY.registration, make: "M", model: "M" },
    },
  });
  expect(canary.status).toBe(201);
  return { contested, booked, refused, canary };
}

/** Opens the panel from the footer link, inside the same tab. */
async function openPanel(page: Page) {
  await page
    .getByRole("contentinfo")
    .getByRole("link", { name: "Dev panel" })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Dev panel" }),
  ).toBeVisible();
}

async function start(page: Page) {
  await openApp(page);
  await pickRole(page, "Manager");
  // The role toast would cover the page in the screenshots.
  await page.getByRole("button", { name: "Dismiss" }).click();
}

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 1024;

/** The whole page; a dialog's states only the window, where the dialog sits. */
async function shot(page: Page, state: string, fullPage = true) {
  mkdirSync(shots, { recursive: true });
  const width = page.viewportSize()!.width;
  await page.screenshot({
    path: path.join(shots, `dev-panel-${state}-${width}.png`),
    fullPage,
  });
}

/** Shows Numbers or Logs: the switch below 1024, both columns from 1024. */
async function show(page: Page, part: "Numbers" | "Logs") {
  if (isPhone(page))
    await page
      .getByRole("group", { name: "Show", exact: true })
      .getByRole("button", { name: part })
      .click();
}

const lines = (page: Page) =>
  page.getByRole("list", { name: "Log lines" }).getByRole("listitem");

test("after a booking, a 409 and an empty search the numbers equal the API's, and the 409 line carries the reference the customer saw", async ({
  page,
}) => {
  await start(page);
  const story = await tellTheStory(page);
  await openPanel(page);

  const telemetry = (
    await api<Telemetry>(page, "/_demo/telemetry", {
      user: "user-manager-london",
    })
  ).body;
  const value = (name: string) =>
    telemetry.counters
      .filter((c) => c.name === name)
      .reduce((n, c) => n + c.value, 0);
  expect(value("appointments_confirmed_total")).toBe(2);
  expect(value("appointment_conflicts_total")).toBe(1);
  const empty = value("availability_search_empty_total");
  expect(empty).toBeGreaterThanOrEqual(1);

  const numbers = page.getByRole("region", { name: "Numbers" });
  const metric = (name: string) =>
    numbers.getByRole("heading", { level: 3, name }).locator("..");
  await expect(metric("Bookings confirmed")).toContainText(
    "2 bookings1 by customers, 1 by staff.",
  );
  await expect(
    metric("Times refused because they were just taken"),
  ).toContainText("1 refused (409)");
  await expect(
    metric("Times refused because they were just taken"),
  ).toContainText(/: 1\.$/);
  await expect(metric("Searches that found no free time")).toContainText(
    `${empty} ${empty === 1 ? "search" : "searches"}`,
  );
  await expect(metric("Time to find free times")).toContainText(
    /Day search\d+ search(es)? · middle \d+\sms · slowest 5% from \d+\smsTarget: under 50\sms (Within|Over) target/,
  );

  // The reference of the 409 is the first 8 characters of its trace id: what the "just taken" screen shows.
  const reference = story.refused.traceId!.slice(0, 8);
  await show(page, "Logs");
  await page
    .getByRole("searchbox", { name: "Find a reference" })
    .fill(reference);
  const total = await lines(page).count();
  await expect(
    page.getByRole("status").filter({ hasText: / of \d+ lines$/ }),
  ).toHaveText(new RegExp(`^${total} of \\d+ lines$`));
  const line = lines(page).filter({ hasText: "appointment.book409" });
  await expect(line).toHaveCount(1);
  await expect(line).toContainText(
    `POST /appointments · slot_unavailable · ${story.refused.body.reasons.join(", ")} · reference ${reference}`,
  );
  await line.locator("summary").click();
  const json = line.getByRole("region", {
    name: `Log line as JSON, reference ${reference}`,
  });
  const shown = JSON.parse((await json.textContent())!);
  expect(shown).toMatchObject({
    msg: "appointment.book",
    status: 409,
    traceId: story.refused.traceId,
  });
  expect(
    Object.keys(shown).every((k) =>
      [
        "ts",
        "level",
        "msg",
        "traceId",
        "route",
        "method",
        "status",
        "durationMs",
        "dealershipId",
        "actorRole",
        "outcome",
        "code",
        "reasons",
        "appointmentId",
        "technicianId",
        "serviceBayId",
        "candidates",
      ].includes(k),
    ),
  ).toBe(true);
  await expect(
    line.getByRole("button", { name: `Copy reference ${reference}` }),
  ).toBeVisible();

  // Show only this trace: every line of the trace, the booking's child steps included.
  await page.getByRole("searchbox", { name: "Find a reference" }).fill("");
  await line.getByRole("button", { name: "Show only this trace" }).click();
  await expect(
    page.getByRole("searchbox", { name: "Find a reference" }),
  ).toHaveValue(reference);
  await expect(lines(page).filter({ hasText: "step.check" })).toHaveCount(1);
  await expect(lines(page).filter({ hasText: "step.suggest" })).toHaveCount(1);
  for (const text of await lines(page).allTextContents())
    expect(text).toContain(`reference ${reference}`);
});

test("no name, phone, email or registration of the canary booking appears anywhere on the page, opened JSON included; typed text stays text", async ({
  page,
}) => {
  await start(page);
  await tellTheStory(page);
  await openPanel(page);
  await show(page, "Logs");
  await expect(
    page.getByText(
      "No names, phone numbers, emails or registrations are ever logged.",
      { exact: false },
    ),
  ).toHaveCount(1);
  await page.evaluate(() =>
    document.querySelectorAll("details").forEach((d) => (d.open = true)),
  );
  const everything = await page.evaluate(
    () => document.documentElement.outerHTML,
  );
  for (const value of Object.values(CANARY))
    expect(everything).not.toContain(value);
  expect(everything).not.toMatch(/Canary/i);

  const xss = '<img src=x onerror="window.__xss=1">';
  await page.getByRole("searchbox", { name: "Find a reference" }).fill(xss);
  await expect(
    page.getByRole("searchbox", { name: "Find a reference" }),
  ).toHaveValue(xss);
  await expect(page.locator("main img")).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as { __xss?: number }).__xss),
  ).toBeUndefined();
});

test("reset: the dialog starts on Keep my data, the reset empties what this browser made, and the seed is back", async ({
  page,
}) => {
  await start(page);
  const story = await tellTheStory(page);
  const day = `/appointments?dealershipId=${LONDON}&date=${londonDate(story.contested)}`;
  const schedule = async () =>
    (await api<Id[]>(page, day, { user: "user-staff-london" })).body.map(
      (a) => a.id,
    );
  const before = await schedule();
  expect(before).toContain(story.booked.body.id);
  await openPanel(page);
  const linesBefore = await lines(page).count();

  await page.getByRole("button", { name: "Reset demo data" }).click();
  const dialog = page.getByRole("dialog", { name: "Reset all demo data?" });
  await expect(
    dialog.getByRole("button", { name: "Keep my data" }),
  ).toBeFocused();
  await dialog.getByRole("button", { name: "Reset demo data" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByText("Demo data reset. The starting data is loaded again."),
  ).toBeVisible();
  await expect(page.getByText("Demo data is back to the start.")).toBeVisible();
  // The tab's own lines stay, and the reset adds its own.
  expect(await lines(page).count()).toBeGreaterThan(linesBefore);

  const after = await schedule();
  expect(after).not.toContain(story.booked.body.id);
  expect(after).not.toContain(story.canary.body.id);
  const myAppointments = await api<
    { id: string; start: string; status: string }[]
  >(page, "/appointments", {
    user: "user-customer-a",
  });
  expect(myAppointments.body.map((a) => a.id)).not.toContain(
    story.booked.body.id,
  );
  expect(myAppointments.body).toContainEqual(
    expect.objectContaining({ start: story.contested, status: "confirmed" }),
  );
  // SEC-13.AC-4 through the screen once: no canary customer, and the outbox holds the seed's messages only.
  const found = await api(page, "/customers/search", {
    user: "user-staff-london",
    method: "POST",
    body: { text: "Canary" },
  });
  expect(found.body).toEqual([]);
  const outbox = await api(page, `/outbox?dealershipId=${LONDON}`, {
    user: "user-manager-london",
  });
  expect(JSON.stringify(outbox.body)).not.toMatch(/Canary|ZZ00 CNR/);
  expect(JSON.stringify(outbox.body)).not.toContain(story.booked.body.id);
});

test("a failed reset says so inside the dialog and keeps it open", async ({
  page,
}) => {
  await interceptApi(page, {
    path: "/_demo/reset",
    status: 500,
    body: problemBody(500, "INTERNAL"),
  });
  await start(page);
  await openPanel(page);
  await page.getByRole("button", { name: "Reset demo data" }).click();
  const dialog = page.getByRole("dialog", { name: "Reset all demo data?" });
  await dialog.getByRole("button", { name: "Reset demo data" }).click();
  await expect(
    dialog.getByRole("heading", { name: "We could not reset the demo data" }),
  ).toBeVisible();
  await expect(
    dialog.getByText(
      "Nothing was changed. Try again; if it keeps happening, quote reference 4bf92f35.",
    ),
  ).toBeVisible();
});

test("on a phone the switch shows Numbers or Logs, one at a time; from 1024 both columns show", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  await tellTheStory(page);
  await openPanel(page);
  const numbers = page.getByRole("region", { name: "Numbers" });
  const logs = page.getByRole("region", { name: "Recent requests" });
  await expect(numbers).toBeVisible();
  await expect(logs).toBeHidden();
  await show(page, "Logs");
  await expect(numbers).toBeHidden();
  await expect(logs).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(numbers).toBeVisible();
  await expect(logs).toBeVisible();
  const [left, right] = await Promise.all([
    numbers.boundingBox(),
    logs.boundingBox(),
  ]);
  expect(left!.x).toBeLessThan(right!.x);
  expect(left!.width / right!.width).toBeGreaterThan(0.6);
  expect(left!.width / right!.width).toBeLessThan(0.8);
});

test("no sideways scroll at 320, 390, 768, 1024 and 1440, with the logs open", async ({
  page,
}) => {
  await start(page);
  await tellTheStory(page);
  await openPanel(page);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await show(page, "Logs");
    await page.evaluate(() =>
      document.querySelectorAll("details").forEach((d) => (d.open = true)),
    );
    await expectNoSidewaysScroll(page);
  }
});

for (const width of [390, 1440]) {
  test.describe(`every state at ${width}, with axe`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("metrics, logs, problems, reset-dialog, resetting and reset-done", async ({
      page,
    }) => {
      await interceptApi(page, { path: "/_demo/reset", delayMs: 1500 });
      await start(page);
      await tellTheStory(page);
      await openPanel(page);

      await show(page, "Numbers");
      await expectNoAxeViolations(page);
      await shot(page, "metrics");

      await show(page, "Logs");
      await lines(page).first().locator("summary").click();
      await expectNoAxeViolations(page);
      await shot(page, "logs");

      await page.getByRole("button", { name: "Problems only" }).click();
      for (const text of await lines(page).locator("summary").allTextContents())
        expect(text).toMatch(/UTC(info|error)\S+?[45]\d\d(POST|GET| · )/);
      await expectNoAxeViolations(page);
      await shot(page, "problems");
      await page.getByRole("button", { name: "All lines" }).click();

      await page.getByRole("button", { name: "Reset demo data" }).click();
      const dialog = page.getByRole("dialog", { name: "Reset all demo data?" });
      await expect(dialog).toBeVisible();
      await expectNoAxeViolations(page);
      await shot(page, "reset-dialog", false);

      await dialog.getByRole("button", { name: "Reset demo data" }).click();
      await expect(dialog.getByText("Resetting…")).toBeVisible();
      await expect(
        dialog.getByRole("button", { name: "Keep my data" }),
      ).toBeDisabled();
      await shot(page, "resetting", false);

      await expect(
        page.getByText("Demo data reset. The starting data is loaded again."),
      ).toBeVisible();
      await expectNoAxeViolations(page);
      await shot(page, "reset-done");
    });

    test("empty", async ({ page }) => {
      await interceptApi(page, {
        path: "/_demo/telemetry",
        status: 200,
        body: { logs: [], counters: [], histograms: [], gauges: [] },
      });
      await start(page);
      await openPanel(page);
      await expect(
        page.getByRole("heading", { name: "No requests yet" }),
      ).toBeVisible();
      await expectNoAxeViolations(page);
      await shot(page, "empty");
    });

    test("loading", async ({ page }) => {
      await interceptApi(page, { path: "/_demo/telemetry", delayMs: 8000 });
      await start(page);
      await openPanel(page);
      const status = page.getByRole("status").filter({
        hasText: "Loading the numbers and logs",
      });
      await expect(status).toBeAttached();
      await page.waitForTimeout(400);
      await expectNoAxeViolations(page);
      await shot(page, "loading");
    });

    test("error", async ({ page }) => {
      await interceptApi(page, {
        path: "/_demo/telemetry",
        status: 500,
        body: problemBody(500, "INTERNAL"),
      });
      await start(page);
      await openPanel(page);
      await expect(
        page.getByRole("heading", {
          name: "We could not load the numbers and logs.",
        }),
      ).toBeVisible();
      await expect(
        page.getByText("Reference 4bf92f35", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Copy reference 4bf92f35" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Try again" }),
      ).toBeVisible();
      await expectNoAxeViolations(page);
      await shot(page, "error");
    });
  });
}

test("every role can open /dev, and the footer link is there in mock mode", async ({
  page,
}) => {
  await openApp(page);
  for (const role of ["Customer", "Staff", "Manager"] as const) {
    await pickRole(page, role);
    await openPanel(page);
    await expect(page.getByText(/You cannot do that/)).toHaveCount(0);
  }
});

test("video: a booking and a just-taken answer in two pages, the line found by its reference, then a reset", async ({
  browser,
}) => {
  const dir =
    process.env["VIDEO_DIR"] ?? path.resolve("test-results/evidence/video");
  const size = { width: 1280, height: 800 };
  const context = await browser.newContext({
    viewport: size,
    recordVideo: { dir, size },
  });
  const manager = await context.newPage();
  const customer = await context.newPage();
  await start(manager);
  // The second page of the same browser starts as the manager picked in the first.
  await openApp(customer);
  await expect(
    customer.getByRole("navigation", { name: "Main" }).first(),
  ).toBeVisible();
  const mine = await api<{ start: string }[]>(customer, "/appointments", {
    user: "user-customer-a",
  });
  const contested = mine.body[0]!.start;
  // The manager books the one free EV technician for customer B; a moment later customer A asks for the same time.
  const booked = await api<Id>(manager, "/appointments", {
    user: "user-manager-london",
    method: "POST",
    body: booking(contested, {
      customerId: "customer-b",
      vehicleId: "vehicle-b",
    }),
  });
  expect(booked.status).toBe(201);
  const refused = await api<Refusal>(customer, "/appointments", {
    user: "user-customer-a",
    method: "POST",
    body: booking(contested),
  });
  expect(refused.status).toBe(409);
  const reference = refused.traceId!.slice(0, 8);

  const page = customer;
  await page.waitForTimeout(800);
  await openPanel(page);
  await page.waitForTimeout(1500);
  const search = page.getByRole("searchbox", { name: "Find a reference" });
  await search.pressSequentially(reference, { delay: 120 });
  await page.waitForTimeout(1000);
  const line = lines(page).filter({ hasText: "appointment.book409" });
  await line.locator("summary").click();
  await expect(
    line.getByRole("region", {
      name: `Log line as JSON, reference ${reference}`,
    }),
  ).toBeVisible();
  await page.waitForTimeout(2000);
  await search.fill("");
  await line.getByRole("button", { name: "Show only this trace" }).click();
  await page.waitForTimeout(2000);
  await page
    .getByRole("button", { name: "Reset demo data" })
    .scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "Reset demo data" }).click();
  await page.waitForTimeout(1200);
  await page
    .getByRole("dialog", { name: "Reset all demo data?" })
    .getByRole("button", { name: "Reset demo data" })
    .click();
  await expect(
    page.getByText("Demo data reset. The starting data is loaded again."),
  ).toBeVisible();
  await page.waitForTimeout(2500);
  const video = page.video()!;
  await context.close();
  await video.saveAs(path.join(dir, "dev-panel-main-flow.webm"));
});
