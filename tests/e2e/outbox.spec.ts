// The manager's outbox in a real browser (C7, REQ-BOOK-013, SEC-3, SEC-11, SEC-17, NFR-4, NFR-7). Every state is
// reached by real use: bookings, a reschedule and a cancel go through the API, as the booking screens would send them.
// With EVIDENCE_DIR set, each state is saved as a screenshot there (D-0000-13).
import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
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
const DAY_MS = 86_400_000;

interface Answer {
  status: number;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** Calls the API from inside the page, as the app's own code would. */
function api(
  page: Page,
  url: string,
  options: { user: string; method?: string; body?: unknown; key?: string },
): Promise<Answer> {
  return page.evaluate(
    async ({ url, options }) => {
      const response = await fetch(`/api${url}`, {
        method: options.method ?? "GET",
        headers: {
          "X-Demo-User": options.user,
          ...(options.key ? { "Idempotency-Key": options.key } : {}),
          ...(options.body ? { "Content-Type": "application/json" } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      return { status: response.status, body: await response.json() };
    },
    { url, options },
  );
}

/** A London date some days ahead that is not a Sunday (the dealership is closed then). */
function londonDate(daysAhead: number): string {
  for (let d = daysAhead; ; d++) {
    const at = new Date(Date.now() + d * DAY_MS);
    const weekday = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      weekday: "short",
    }).format(at);
    if (weekday !== "Sun") {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/London",
      }).format(at);
    }
  }
}

/** A free start on that date, from the availability the booking screen reads. */
async function freeStart(
  page: Page,
  user: string,
  daysAhead: number,
  serviceTypeId = "service-oil-change",
): Promise<string> {
  const free = await api(
    page,
    `/dealerships/${LONDON}/availability?serviceTypeId=${serviceTypeId}&date=${londonDate(daysAhead)}&transport=drop_off`,
    { user },
  );
  expect(free.status).toBe(200);
  const slot = free.body.slots[Math.min(4, free.body.slots.length - 1)];
  expect(slot).toBeTruthy();
  return slot.start;
}

async function book(
  page: Page,
  who: "a" | "b",
  daysAhead: number,
  key = crypto.randomUUID(),
): Promise<Answer> {
  const user = `user-customer-${who}`;
  const start = await freeStart(page, user, daysAhead);
  const booked = await api(page, "/appointments", {
    user,
    method: "POST",
    key,
    body: {
      dealershipId: LONDON,
      serviceTypeId: "service-oil-change",
      start,
      transport: "drop_off",
      vehicleId: `vehicle-${who}`,
    },
  });
  expect(booked.status).toBe(201);
  return booked;
}

async function reschedule(page: Page, id: string, daysAhead: number) {
  const user = "user-customer-a";
  const start = await freeStart(page, user, daysAhead);
  const moved = await api(page, `/appointments/${id}/reschedule`, {
    user,
    method: "POST",
    key: crypto.randomUUID(),
    body: { start },
  });
  expect(moved.status).toBe(200);
  return moved;
}

async function cancel(page: Page, id: string, who: "a" | "b") {
  const done = await api(page, `/appointments/${id}/cancel`, {
    user: `user-customer-${who}`,
    method: "POST",
  });
  expect(done.status).toBe(200);
}

async function asManager(page: Page, url = "/manage/outbox") {
  await openApp(page);
  await pickRole(page, "Manager");
  await page.goto(url);
  await expect(
    page.getByRole("heading", { level: 1, name: "Outbox" }),
  ).toBeVisible();
}

const rows = (page: Page) =>
  page.getByRole("main").getByRole("listitem").getByRole("button");
const row = (page: Page, kind: string | RegExp) =>
  rows(page).filter({
    has: page.locator("b", {
      hasText: typeof kind === "string" ? new RegExp(`^${kind}$`) : kind,
    }),
  });

async function shot(page: Page, state: string) {
  const dir = process.env["EVIDENCE_DIR"];
  if (!dir) return;
  mkdirSync(path.join(dir, "shots"), { recursive: true });
  const width = page.viewportSize()?.width ?? 0;
  await page.waitForTimeout(300);
  // An open sheet is fixed to the window, so a full-page shot would draw it mid-page.
  const sheetOpen = (await page.getByRole("dialog").count()) > 0;
  const file = path.join(dir, "shots", `outbox-${state}-${width}.png`);
  if (sheetOpen) {
    await page.screenshot({ path: file });
    return;
  }
  // A full-page shot paints the shell's fixed tab bar where the window ended, over a row. Making the
  // window as tall as the page puts the bar at the page's foot, where a reader sees it.
  const before = page.viewportSize()!;
  const height = await page.evaluate(
    () => document.documentElement.scrollHeight,
  );
  await page.setViewportSize({ width: before.width, height });
  await page.waitForTimeout(100);
  await page.screenshot({ path: file });
  await page.setViewportSize(before);
}

/** One booking moved, one booking cancelled: the list the ticket's states are drawn from. */
async function movedAndCancelled(page: Page) {
  const first = await book(page, "a", 5);
  await reschedule(page, first.body.id, 8);
  const second = await book(page, "b", 6);
  await cancel(page, second.body.id, "b");
  return {
    moved: first.body.id as string,
    cancelled: second.body.id as string,
  };
}

for (const width of [390, 1440]) {
  test(`every outbox state, reached by real use, at ${width} wide`, async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    await asManager(page);

    // empty
    await expect(
      page.getByRole("heading", { name: "No messages yet" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "A message appears here when a booking is confirmed, moved or cancelled, and when a reminder is scheduled.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Open the schedule" }),
    ).toHaveAttribute("href", "/schedule");
    await expectNoAxeViolations(page);
    await shot(page, "empty");

    // filter-empty: one booking, nothing cancelled yet
    const mine = (await book(page, "a", 5)).body as { id: string };
    await page.reload();
    await expect(row(page, "Confirmation")).toHaveCount(1);
    await page.getByRole("button", { name: "Cancelled (0)" }).click();
    await expect(
      page.getByRole("heading", { name: "No cancelled messages" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "A reminder is marked cancelled when its appointment is moved or cancelled. None are cancelled at the moment.",
      ),
    ).toBeVisible();
    await expectNoAxeViolations(page);
    await shot(page, "filter-empty");
    await page.getByRole("button", { name: "Show all messages" }).click();
    await expect(row(page, "Confirmation")).toBeVisible();

    // list: a move and a cancel
    await reschedule(page, mine.id, 8);
    const second = await book(page, "b", 6);
    await cancel(page, second.body.id, "b");
    await page.reload();
    await expect(rows(page)).toHaveCount(10);
    await expect(
      page.getByRole("group", { name: "Show messages" }).getByRole("button"),
    ).toHaveText([
      "All (10)",
      "Scheduled (2)",
      "Sent in this demo (4)",
      "Cancelled (4)",
    ]);
    await expectNoSidewaysScroll(page);
    await expectNoAxeViolations(page);
    await shot(page, "list");

    // message-open
    await row(page, "Moved to a new time").click();
    const reader =
      width >= 1024
        ? page.getByRole("complementary", { name: "Message" })
        : page.getByRole("dialog", { name: "Moved to a new time" });
    await expect(reader.getByText(/^We have moved your/)).toBeVisible();
    await expectNoAxeViolations(page);
    await shot(page, "message-open");
    if (width < 1024) await page.keyboard.press("Escape");

    // message-cancelled
    await row(page, "Reminder, 48 hours before")
      .filter({ hasText: "Cancelled" })
      .first()
      .click();
    const cancelledReader =
      width >= 1024
        ? page.getByRole("complementary", { name: "Message" })
        : page.getByRole("dialog", { name: "Reminder, 48 hours before" });
    await expect(
      cancelledReader.getByRole("heading", { name: "Not sent" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
    await shot(page, "message-cancelled");
    if (width < 1024) await page.keyboard.press("Escape");

    // by-appointment
    await page.goto(`/manage/outbox?appointmentId=${mine.id}`);
    await expect(page.getByText(/^Showing the messages for/)).toBeVisible();
    await expect(rows(page)).toHaveCount(6);
    await expectNoAxeViolations(page);
    await shot(page, "by-appointment");
    await page.getByRole("button", { name: "Show all messages" }).click();
    await expect(rows(page)).toHaveCount(10);

    // loading: the skeleton shows only after 200 ms
    const slow = await context.newPage();
    await slow.setViewportSize({ width, height: 900 });
    await interceptApi(slow, { path: "/outbox", delayMs: 4000 });
    // Times, in the page, when the hidden label first appears and when the skeleton first shows.
    await slow.addInitScript(() => {
      const seen: { label?: number; skeleton?: number } = {};
      (window as unknown as { __loading: typeof seen }).__loading = seen;
      const look = () => {
        const label = [...document.querySelectorAll('[role="status"]')].find(
          (el) => el.textContent === "Loading the outbox",
        );
        if (label && seen.label === undefined) seen.label = performance.now();
        const skeleton = label?.parentElement?.querySelector(
          '[aria-hidden="true"]',
        );
        if (
          skeleton &&
          !skeleton.classList.contains("invisible") &&
          seen.skeleton === undefined
        )
          seen.skeleton = performance.now();
        if (seen.skeleton === undefined) requestAnimationFrame(look);
      };
      requestAnimationFrame(look);
    });
    await slow.goto("/manage/outbox");
    await expect(
      slow.getByRole("status").filter({ hasText: "Loading the outbox" }),
    ).toBeAttached();
    await slow.waitForTimeout(600);
    const seen = await slow.evaluate(
      () =>
        (
          window as unknown as {
            __loading: { label?: number; skeleton?: number };
          }
        ).__loading,
    );
    // Nothing shows for the first 200 ms; then the skeleton does (one frame of slack).
    expect(seen.label).toBeDefined();
    expect(seen.skeleton).toBeDefined();
    expect(seen.skeleton! - seen.label!).toBeGreaterThanOrEqual(184);
    await expectNoAxeViolations(slow);
    await shot(slow, "loading");
    await slow.close();

    // error
    const failing = await context.newPage();
    await failing.setViewportSize({ width, height: 900 });
    await interceptApi(failing, {
      path: "/outbox",
      status: 500,
      body: problemBody(500, "INTERNAL"),
    });
    await failing.goto("/manage/outbox");
    await expect(
      failing.getByText(/^We could not load the outbox\./),
    ).toBeVisible();
    await expect(
      failing.getByText("Reference 4bf92f35", { exact: true }),
    ).toBeVisible();
    await expect(
      failing.getByRole("button", { name: "Copy reference 4bf92f35" }),
    ).toBeVisible();
    await expect(
      failing.getByRole("button", { name: "Try again" }),
    ).toBeVisible();
    await expectNoAxeViolations(failing);
    await shot(failing, "error");
    await failing.close();

    // no-permission-dealership
    await page.goto(`/manage/outbox?dealership=dealership-saigon`);
    await expect(
      page.getByRole("heading", { name: "You do not manage this dealership." }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
    await shot(page, "no-permission-dealership");

    // no-permission
    await page.goto("/schedule");
    await pickRole(page, "Staff");
    await page.goto("/manage/outbox");
    await expect(
      page.getByRole("heading", { name: "You cannot do that as Staff." }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
    await shot(page, "no-permission");
  });
}

test("after a booking: a confirmation and two reminders, each with links on the app's own origin and nothing else", async ({
  page,
}) => {
  await asManager(page);
  const booked = await book(page, "a", 5);
  const id = booked.body.id as string;
  await page.reload();
  await expect(
    page.getByText(
      "The messages the system would send to customers, and when. Times are London time.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Nothing is sent in this demo" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "You see what would go out. No text message or email leaves this browser.",
    ),
  ).toBeVisible();
  await expect(rows(page).locator("b")).toHaveText([
    "Confirmation",
    "Reminder, 48 hours before",
    "Reminder, morning of the appointment",
  ]);
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: /^Oil and filter change · Demo · /,
    }),
  ).toBeVisible();
  // A row names its kind first, and shows no phone number or email (SEC-17.AC-1).
  await expect(rows(page).first()).toHaveAccessibleName(/^Confirmation /);
  const listText = await page.getByRole("main").innerText();
  expect(listText).not.toMatch(/@|\+44|7700/);

  const origin = new URL(page.url()).origin;
  for (const kind of [
    "Confirmation",
    "Reminder, 48 hours before",
    "Reminder, morning of the appointment",
  ]) {
    await row(page, kind).click();
    const pane = page.getByRole("complementary", { name: "Message" });
    await expect(pane.getByRole("heading", { name: kind })).toBeVisible();
    await expect(
      pane.getByText(
        "(first name only; contact details are not stored in messages)",
      ),
    ).toBeVisible();
    const hrefs = await pane
      .locator("a[href]")
      .evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).href));
    expect(hrefs).toContain(`${origin}/appointments/${id}/reschedule`);
    // The API's cancel link opens the appointment, where the customer cancels (Q-0001-215).
    expect(
      await pane
        .getByText(/^Cancel: /)
        .getByRole("link")
        .getAttribute("href"),
    ).toBe(`${origin}/appointments/${id}`);
    for (const href of hrefs) {
      expect(new URL(href).origin).toBe(origin);
      expect(new URL(href).pathname).toMatch(
        new RegExp(`^/appointments/${id}(/reschedule)?$`),
      );
      expect(new URL(href).search).toBe("");
    }
  }
});

test("a confirm sent twice with the same Idempotency-Key leaves one confirmation and one set of reminders", async ({
  page,
}) => {
  await asManager(page);
  const key = crypto.randomUUID();
  const start = await freeStart(page, "user-customer-a", 5);
  const body = {
    dealershipId: LONDON,
    serviceTypeId: "service-oil-change",
    start,
    transport: "drop_off",
    vehicleId: "vehicle-a",
  };
  const once = await api(page, "/appointments", {
    user: "user-customer-a",
    method: "POST",
    key,
    body,
  });
  const twice = await api(page, "/appointments", {
    user: "user-customer-a",
    method: "POST",
    key,
    body,
  });
  expect(twice.body.id).toBe(once.body.id);
  await page.reload();
  await expect(rows(page)).toHaveCount(3);
  await expect(row(page, "Confirmation")).toHaveCount(1);
  await expect(row(page, "Reminder, 48 hours before")).toHaveCount(1);
  await expect(row(page, "Reminder, morning of the appointment")).toHaveCount(
    1,
  );
});

test("a move cancels the old reminders, lists the new ones and a Moved message; a cancel keeps the confirmation's state", async ({
  page,
}) => {
  await asManager(page);
  const ids = await movedAndCancelled(page);
  await page.reload();
  await expect(rows(page)).toHaveCount(10);

  // The moved appointment.
  await page.goto(`/manage/outbox?appointmentId=${ids.moved}`);
  await expect(
    page.getByText(
      /^Moved from .+, \d\d:\d\d\. In the order the messages were made\.$/,
    ),
  ).toBeVisible();
  await expect(rows(page).locator("b")).toHaveText([
    "Confirmation",
    "Reminder, 48 hours before",
    "Reminder, morning of the appointment",
    "Moved to a new time",
    "Reminder, 48 hours before",
    "Reminder, morning of the appointment",
  ]);
  const old = rows(page).filter({ hasText: /For the old time, / });
  await expect(old).toHaveCount(2);
  for (const r of await old.all()) {
    await expect(r.getByText("Cancelled", { exact: true })).toBeVisible();
  }
  await expect(
    rows(page)
      .filter({ hasText: /For the old time, / })
      .filter({ hasText: "Scheduled" }),
  ).toHaveCount(0);
  await expect(
    row(page, "Confirmation").getByText("Sent in this demo"),
  ).toBeVisible();

  // The cancelled appointment.
  await page.goto(`/manage/outbox?appointmentId=${ids.cancelled}`);
  await expect(rows(page).locator("b")).toHaveText([
    "Confirmation",
    "Reminder, 48 hours before",
    "Reminder, morning of the appointment",
    "Cancelled",
  ]);
  await expect(
    row(page, "Confirmation").getByText("Sent in this demo"),
  ).toBeVisible();
  await expect(
    row(page, "Cancelled").getByText("Sent in this demo"),
  ).toBeVisible();
  await row(page, "Reminder, morning of the appointment").click();
  const pane = page.getByRole("complementary", { name: "Message" });
  await expect(pane.getByRole("heading", { name: "Not sent" })).toBeVisible();
  await expect(
    pane.getByText(
      "This message will not be sent. The appointment was cancelled.",
    ),
  ).toBeVisible();
});

/** "Fri 30 Oct, 09:15" in London, the words the outbox uses for a time ahead. */
function words(instant: string): string {
  const at = new Date(instant);
  const zone = "Europe/London";
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    weekday: "short",
    day: "numeric",
    month: "short",
  })
    .format(at)
    .replace(",", "");
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
  return `${day}, ${time}`;
}

for (const width of [390, 1440]) {
  test(`after two moves the old times are exact, in the order the messages were made, at ${width} wide (D-0001-79)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await asManager(page);
    const booked = await book(page, "a", 5);
    const id = booked.body.id as string;
    const first = (await reschedule(page, id, 8)).body.start as string;
    const second = (await reschedule(page, id, 11)).body.start as string;

    // The API says when each message was made and which start it was for.
    const sent = await api(page, `/outbox?appointmentId=${id}`, {
      user: "user-manager-london",
    });
    const made = sent.body as {
      kind: string;
      createdAt: string;
      forStart: string;
    }[];
    expect(made).toHaveLength(9);
    expect(
      [...made]
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .filter((m) => ["confirmation", "moved"].includes(m.kind))
        .map((m) => m.forStart),
    ).toEqual([booked.body.start, first, second]);

    await page.reload();
    await expect(rows(page)).toHaveCount(9);
    await expect(
      page.getByText(
        `Moved from ${words(first)}. In the order the messages were made.`,
      ),
    ).toBeVisible();
    expect(
      await rows(page).evaluateAll((all) =>
        all.map((r) => r.textContent ?? ""),
      ),
    ).toEqual([
      expect.stringContaining(`For ${words(booked.body.start)}`),
      expect.stringContaining(`For the old time, ${words(booked.body.start)}`),
      expect.stringContaining(`For the old time, ${words(booked.body.start)}`),
      expect.stringContaining(`To ${words(first)}`),
      expect.stringContaining(`For the old time, ${words(first)}`),
      expect.stringContaining(`For the old time, ${words(first)}`),
      expect.stringContaining(`To ${words(second)}`),
      expect.stringContaining(`For ${words(second)}`),
      expect.stringContaining(`For ${words(second)}`),
    ]);
    await expectNoAxeViolations(page);
    await expectNoSidewaysScroll(page);
    await shot(page, "two-moves");
  });
}

test("message times are London time across the clock change (2026-10-24T10:00Z shows 11:00)", async ({
  page,
}) => {
  await interceptApi(page, {
    path: "/outbox",
    status: 200,
    body: [
      {
        id: "m-dst",
        appointmentId: "appointment-customer-a",
        dealershipId: LONDON,
        kind: "confirmation",
        dueAt: "2026-10-24T10:00:00Z",
        createdAt: "2026-10-24T10:00:00Z",
        forStart: "2026-11-02T09:00:00Z",
        status: "pending",
        links: { cancel: "/x", reschedule: "/y" },
      },
    ],
  });
  await asManager(page);
  await expect(row(page, "Confirmation")).toContainText(
    /Sent Sat 24 Oct( 2026)?, 11:00 · To Demo/,
  );
});

for (const [name, firstName, registration] of [
  // The ticket's own name: the first name is its first word, "<img" (Q-0001-219 item 3).
  [`<img src=x onerror="window.__xss=1">`, "<img", "XS01SSX"],
  // The whole tag as one word, so the first name carries all of it.
  [
    `<img/src=x/onerror=window.__xss=1> Tester`,
    "<img/src=x/onerror=window.__xss=1>",
    "XS02SSX",
  ],
] as const) {
  test(`a first name with HTML in it is shown as text, and no script runs (SEC-11.AC-2): ${firstName}`, async ({
    page,
  }) => {
    await asManager(page);
    const start = await freeStart(page, "user-staff-london", 5);
    const booked = await api(page, "/appointments", {
      user: "user-staff-london",
      method: "POST",
      key: crypto.randomUUID(),
      body: {
        dealershipId: LONDON,
        serviceTypeId: "service-oil-change",
        start,
        transport: "wait",
        newCustomer: { name, phone: "+44 7700 900999" },
        newVehicle: { registration, make: "Test", model: "Car" },
      },
    });
    expect(booked.status).toBe(201);
    await page.reload();
    await row(page, "Confirmation").click();
    const pane = page.getByRole("complementary", { name: "Message" });
    await expect(pane.getByText(`Hi ${firstName},`)).toBeVisible();
    await expect(pane.getByText(firstName, { exact: true })).toBeVisible();
    await expect(page.locator("main img")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => (window as unknown as { __xss?: number }).__xss,
      ),
    ).toBeUndefined();
  });
}

test("a customer or staff member sees no-permission and the outbox is never asked for; another dealership's outbox is a 403", async ({
  page,
}) => {
  const asked: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/outbox"))
      asked.push(r.url());
  });
  await openApp(page);
  for (const role of ["Customer", "Staff"] as const) {
    await pickRole(page, role);
    await page.goto("/manage/outbox");
    await expect(
      page.getByRole("heading", { name: `You cannot do that as ${role}.` }),
    ).toBeVisible();
  }
  await expect(
    page.getByText(
      "Only the garage manager can read the outbox. Switch role, or go to your schedule.",
    ),
  ).toBeVisible();
  expect(asked).toEqual([]);
  const other = await api(page, "/outbox?dealershipId=dealership-saigon", {
    user: "user-manager-london",
  });
  expect(other.status).toBe(403);
});

test("60 messages: no sideways scroll, one list, each appointment's messages in time order", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 320, height: 800 });
  await asManager(page);
  // Twenty real bookings, three messages each.
  for (let i = 0; i < 20; i++) await book(page, i % 2 ? "a" : "b", 3 + i);
  const outbox = await api(page, `/outbox?dealershipId=${LONDON}`, {
    user: "user-manager-london",
  });
  expect(outbox.status).toBe(200);
  type Message = {
    id: string;
    appointmentId: string;
    kind: string;
    dueAt: string;
  };
  const messages = outbox.body as Message[];
  expect(messages).toHaveLength(60);

  await page.reload();
  await expect(rows(page)).toHaveCount(60);
  await expectNoSidewaysScroll(page);

  // What the list should be: per appointment the confirmation, then its reminders by due time; the
  // appointments newest booking first (Q-0001-219 item 1).
  const due = (m: Message) => Date.parse(m.dueAt);
  const byAppointment = new Map<string, Message[]>();
  for (const m of messages)
    byAppointment.set(m.appointmentId, [
      ...(byAppointment.get(m.appointmentId) ?? []),
      m,
    ]);
  const expected = [...byAppointment.entries()]
    .map(([id, list]) => ({
      id,
      booked: due(list.find((m) => m.kind === "confirmation")!),
      ids: [
        ...list.filter((m) => m.kind === "confirmation"),
        ...list
          .filter((m) => m.kind !== "confirmation")
          .sort((x, y) => due(x) - due(y) || x.id.localeCompare(y.id)),
      ].map((m) => m.id),
    }))
    .sort((x, y) => y.booked - x.booked || x.id.localeCompare(y.id))
    .flatMap((g) => g.ids);
  const shown = await rows(page).evaluateAll((all) =>
    all.map((b) => b.getAttribute("data-message-id")),
  );
  expect(shown).toEqual(expected);
  // One column: each row sits below the one before it.
  const tops = await rows(page).evaluateAll((all) =>
    all.map((b) => b.getBoundingClientRect().top),
  );
  for (let i = 1; i < tops.length; i++)
    expect(tops[i]!).toBeGreaterThan(tops[i - 1]!);
});

test("on desktop a row opens the message in the pane, says so to a screen reader, and closes when pressed again", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await asManager(page);
  await book(page, "a", 5);
  await page.reload();
  const pane = page.getByRole("complementary", { name: "Message" });
  const opener = row(page, "Confirmation");
  await expect(opener).toHaveAttribute("aria-pressed", "false");
  await opener.click();
  await expect(opener).toHaveAttribute("aria-pressed", "true");
  await expect(pane.getByRole("status")).toHaveText(
    /^Confirmation, .+, is shown beside the list\.$/,
  );
  await opener.click();
  await expect(opener).toHaveAttribute("aria-pressed", "false");
  await expect(
    pane.getByRole("heading", { name: "Choose a message" }),
  ).toBeVisible();
});

test("a filter chosen for the whole outbox does not carry over to one appointment's messages", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await asManager(page);
  const booked = await book(page, "a", 5);
  // In-app moves only (no page load), so the screen keeps its state between them.
  await page.goto(`/manage/outbox?appointmentId=${booked.body.id}`);
  await expect(rows(page)).toHaveCount(3);
  await page.getByRole("button", { name: "Show all messages" }).click();
  await page.getByRole("button", { name: /^Scheduled \(\d+\)$/ }).click();
  await expect(rows(page)).toHaveCount(2);
  await page.goBack();
  await expect(page.getByText(/^Showing the messages for/)).toBeVisible();
  await expect(rows(page)).toHaveCount(3);
  await page.getByRole("button", { name: "Show all messages" }).click();
  await expect(
    page.getByRole("button", { name: /^All \(3\)$/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(rows(page)).toHaveCount(3);
});

test("phone and desktop: no sideways scroll at every width, one list below 1024, two panes from 1024", async ({
  page,
}) => {
  await asManager(page);
  await book(page, "a", 5);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.reload();
    await expect(rows(page)).toHaveCount(3);
    await expectNoSidewaysScroll(page);
    await expect(
      page.getByRole("complementary", { name: "Message" }),
    ).toHaveCount(width >= 1024 ? 1 : 0);
    if (width >= 1024) {
      const [list, pane] = await Promise.all([
        rows(page).first().boundingBox(),
        page.getByRole("complementary", { name: "Message" }).boundingBox(),
      ]);
      expect(pane!.x).toBeGreaterThan(list!.x + list!.width - 1);
    }
  }
});

test("on a phone the message opens in a sheet that holds focus and gives it back to the row; the text is at most 65ch", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await asManager(page);
  await book(page, "a", 5);
  await page.reload();
  const opener = row(page, "Confirmation");
  await opener.focus();
  await page.keyboard.press("Enter");
  const sheet = page.getByRole("dialog", { name: "Confirmation" });
  await expect(sheet).toBeVisible();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    expect(
      await sheet.evaluate((d) => d.contains(document.activeElement)),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(opener).toBeFocused();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await row(page, "Confirmation").click();
  const text = page
    .getByRole("complementary", { name: "Message" })
    .getByText(/^Hi Demo,/)
    .locator("..");
  const [width, ch] = await text.evaluate((el) => {
    const probe = document.createElement("span");
    probe.textContent = "0";
    el.appendChild(probe);
    const one = probe.getBoundingClientRect().width;
    probe.remove();
    return [el.getBoundingClientRect().width, one];
  });
  expect(width).toBeLessThanOrEqual(65 * ch + 1);
});

test("the main flow: a manager reads the messages of a booking, then sees them marked Cancelled after a reschedule and a cancel", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const pause = () => page.waitForTimeout(1200);
  await asManager(page);
  const first = await book(page, "a", 5);
  await page.reload();
  await pause();
  for (const kind of [
    "Confirmation",
    "Reminder, 48 hours before",
    "Reminder, morning of the appointment",
  ]) {
    await row(page, kind).click();
    await pause();
  }
  await reschedule(page, first.body.id, 8);
  await page.reload();
  await pause();
  await row(page, "Reminder, 48 hours before")
    .filter({ hasText: "Cancelled" })
    .click();
  await pause();
  await row(page, "Moved to a new time").click();
  await pause();
  await cancel(page, first.body.id, "a");
  await page.reload();
  await pause();
  await expect(row(page, "Cancelled")).toHaveCount(1);
  await row(page, "Cancelled").click();
  await pause();
  await page.getByRole("button", { name: /^Cancelled \(\d+\)$/ }).click();
  await pause();
  await expect(rows(page)).toHaveCount(4);
  await pause();
});
