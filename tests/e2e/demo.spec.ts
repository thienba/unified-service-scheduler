// The demo scenarios in the build order (C8, D-0000-9): each one is real use of the finished screens and the mock
// API, recorded as a video (MP4 and GIF after scripts/e2e-media.mjs) and ending in a screenshot at 1440 and 390
// wide, checked with axe-core and for sideways scroll. The clock is fixed at Wed 28 Oct 2026, 10:40 in London
// (the seed counts its bookings from there: customer A on Sat 31 Oct 10:00, customer B on Mon 2 Nov 14:00), so
// the days and times are the same on every run. Data a scenario needs before it starts is made through the API.
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import {
  A,
  B,
  LONDON,
  MANAGER,
  SAIGON,
  STAFF,
  api,
  beat,
  endShots,
  keepVideo,
  londonDay,
  londonTime,
  plusMinutes,
  contestedEvStart,
  open,
  signInAs,
} from "./demo-support";
import {
  chooseOption,
  dateNamed,
  selectNamed,
  typeDate,
  waitForTimes,
} from "./support";

const NOW = new Date("2026-10-28T10:40:00Z");
const TECHNICIANS: Record<string, string> = {
  "tech-lon-ash": "Oliver Hughes",
  "tech-lon-birch": "Amara Okafor",
  "tech-lon-cedar": "Tom Fletcher",
};
const PHONE_NAME = /\+44 1632 960 123/;

interface Appointment {
  id: string;
  start: string;
  end: string;
  technicianId: string;
  serviceBayId: string;
  status: string;
  customerId: string;
}

interface Message {
  kind: string;
  status: string;
  dueAt: string;
  links: { cancel: string; reschedule: string };
}

/** A recorded browser for one scenario: 1280 by 800, with the video kept as `video/<name>.webm`. */
async function recorded(
  browser: Browser,
  dir: string,
  options: { timezoneId?: string } = {},
) {
  const size = { width: 1280, height: 800 };
  return browser.newContext({
    viewport: size,
    recordVideo: { dir, size },
    ...options,
  });
}

/** A page of the context signed in as one user, at a fixed time. */
async function pageAs(
  context: BrowserContext,
  user: string,
  now: Date = NOW,
): Promise<Page> {
  const page = await context.newPage();
  await page.clock.setFixedTime(now);
  await signInAs(page, user);
  await open(page, "/");
  return page;
}

async function bookFor(
  page: Page,
  user: string,
  body: Record<string, unknown>,
): Promise<Appointment> {
  const answer = await api<Appointment>(page, user, "POST", "/appointments", {
    dealershipId: LONDON,
    transport: "drop_off",
    ...body,
  });
  expect(answer.status, JSON.stringify(answer.body)).toBe(201);
  return answer.body;
}

async function messagesOf(page: Page, appointmentId: string) {
  const answer = await api<Message[]>(
    page,
    MANAGER,
    "GET",
    `/outbox?appointmentId=${appointmentId}`,
  );
  expect(answer.status).toBe(200);
  return answer.body;
}

const h1 = (page: Page, name: string | RegExp) =>
  page.getByRole("heading", { level: 1, name });
const dayTile = (page: Page, label: string) =>
  page.getByRole("radio", { name: new RegExp(`^${label},`) });
const chip = (page: Page, name: string) =>
  page.getByRole("radio", { name, exact: true });
const timeline = (page: Page) =>
  page.getByRole("region", { name: "Day timeline, scrolls sideways" });
const searchField = (page: Page) =>
  page.getByRole("searchbox", { name: "Name, phone or number plate" });
const resultRow = (page: Page, name: string) =>
  page
    .getByRole("group", { name: /found$/ })
    .getByRole("radio", { name: new RegExp(`^${name}`) });
const continueButton = (page: Page) =>
  page.getByRole("button", { name: "Continue", exact: true });
const outboxRows = (page: Page) =>
  page.getByRole("main").getByRole("listitem").getByRole("button");
const outboxRow = (page: Page, kind: string) =>
  outboxRows(page).filter({
    has: page.locator("b", { hasText: new RegExp(`^${kind}$`) }),
  });

test("scenario 1, customer books (REQ-BOOK-001, 002, 003, 010.AC-1): dealership, car and service, the strip and chips, a courtesy car, the confirmation, a reload and My appointments", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const context = await recorded(browser, testInfo.outputPath("video"));
  const page = await pageAs(context, A);
  await page.goto("/book");
  await expect(h1(page, "Book a service")).toBeVisible();
  await beat(page);
  await chooseOption(page.getByRole("button", { name: /^Dealership/ }), LONDON);
  await beat(page);
  await chooseOption(page.getByRole("button", { name: /^Car/ }), "vehicle-a");
  await beat(page);
  await chooseOption(
    page.getByRole("button", { name: /^Service/ }),
    "service-full",
  );
  // The strip of days with their counts, and the time chips of the chosen day.
  await expect(dayTile(page, "Wed 28 Oct")).toBeChecked();
  await expect(dayTile(page, "Sun 1 Nov")).toHaveAccessibleName(
    "Sun 1 Nov, Closed",
  );
  await beat(page);
  await dayTile(page, "Fri 30 Oct").check();
  await expect(chip(page, "10:00 to 13:00")).toBeVisible();
  await beat(page);
  await chip(page, "10:00 to 13:00").check();
  await beat(page);
  const courtesy = page.getByRole("radio", { name: "Borrow a courtesy car" });
  await expect(courtesy).toBeEnabled();
  await courtesy.check();
  await beat(page);
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(h1(page, "You are booked")).toBeVisible();
  const id = new URL(page.url()).pathname.split("/").pop()!;
  const technician = new RegExp(`^(${Object.values(TECHNICIANS).join("|")})$`);
  await expect(page.getByText("Fri 30 Oct, 10:00 to 13:00")).toBeVisible();
  await expect(page.getByText(technician)).toBeVisible();
  await expect(page.getByText("You will borrow a courtesy car")).toBeVisible();
  await beat(page, 1500);

  // REQ-BOOK-003.AC-2: a reload shows the same appointment, and it is in My appointments.
  await page.reload();
  await expect(h1(page, "You are booked")).toBeVisible();
  await expect(page.getByText("Fri 30 Oct, 10:00 to 13:00")).toBeVisible();
  await expect(page.getByText(technician)).toBeVisible();
  await beat(page);
  await page
    .getByRole("navigation", { name: "Main" })
    .first()
    .getByRole("link", { name: "My appointments" })
    .click();
  await expect(h1(page, "My appointments")).toBeVisible();
  const card = page.getByRole("article").filter({ hasText: "Fri 30 Oct" });
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("Courtesy car");
  await expect(
    card.getByRole("link", { name: "View details" }),
  ).toHaveAttribute("href", `/appointments/${id}`);
  await beat(page, 1500);
  await endShots(page, "scenario-1-customer-books");
  await keepVideo(page, "scenario-1-customer-books");
  await context.close();
});

test("scenario 2, staff sees it and books (REQ-BOOK-004, 010.AC-2, 014): the new appointment on its technician's row, bays and list, a free gap, search by name, phone and plate, a new customer, just taken, a closest time", async ({
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const context = await recorded(browser, testInfo.outputPath("video"));
  const page = await pageAs(context, STAFF);
  // Customer A's booking from scenario 1: Fri 30 Oct, 10:00, full service, courtesy car.
  const mine = await bookFor(page, A, {
    serviceTypeId: "service-full",
    vehicleId: "vehicle-a",
    start: "2026-10-30T10:00:00Z",
    transport: "courtesy_car",
  });
  const technician = TECHNICIANS[mine.technicianId]!;
  await page.goto("/schedule?date=2026-10-30");
  await expect(h1(page, "Schedule")).toBeVisible();
  const block = timeline(page)
    .getByRole("group", { name: technician })
    .getByRole("button", { name: /^10:00 to 13:00, Full service, / });
  await expect(block).toBeVisible();
  await beat(page);
  await block.click();
  await expect(page.getByText("Courtesy car, Car 1")).toBeVisible();
  await expect(page.getByText("Demo Customer A").first()).toBeVisible();
  await beat(page, 1200);
  await page
    .getByRole("group", { name: "Rows" })
    .getByRole("button", { name: "Bays" })
    .click();
  await expect(page).toHaveURL(/rows=bays/);
  await beat(page, 1200);
  await page
    .getByRole("group", { name: "Rows" })
    .getByRole("button", { name: "Technicians" })
    .click();
  await page
    .getByRole("group", { name: "View" })
    .getByRole("button", { name: "List" })
    .click();
  await expect(page).toHaveURL(/view=list/);
  await beat(page, 1200);

  // A free gap opens the booking for a customer, with the gap's start and technician.
  await page
    .getByRole("list", { name: /in time order/ })
    .getByRole("link", { name: /^Free, .* Book this time\.$/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/book\/for-customer\?start=.*technicianId=/);
  for (const text of ["Carol", "+44 7700 900103", "EF22 DMC"]) {
    await searchField(page).fill("");
    await searchField(page).pressSequentially(text, { delay: 60 });
    await expect(resultRow(page, "Demo Walk-in Carol")).toBeVisible();
    await beat(page);
  }
  await resultRow(page, "Demo Walk-in Carol").check();
  await page
    .getByRole("radio", { name: "Demo Motors Coupe, EF22 DMC" })
    .check();
  await continueButton(page).click();
  await chooseOption(
    selectNamed(page, "Service (required)"),
    "service-oil-change",
  );
  await waitForTimes(page);
  await page.getByRole("radio", { name: "Waits on site" }).check();
  await beat(page);
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(h1(page, "Demo Walk-in Carol is booked in.")).toBeVisible();
  await beat(page, 1500);

  // A new customer with a vehicle; a second page takes the time first.
  await page.getByRole("link", { name: "Book another for a customer" }).click();
  await page.getByRole("button", { name: "Add a new customer" }).click();
  const typeIn = (label: string, text: string) =>
    page
      .getByRole("textbox", { name: label, exact: true })
      .pressSequentially(text, { delay: 30 });
  await typeIn("Full name (required)", "Tomasz Wilk");
  await typeIn("Phone number (required)", "07700 900789");
  await typeIn("Registration (required)", "TW19 ABC");
  await typeIn("Make (required)", "Skoda");
  await typeIn("Model (required)", "Fabia");
  await continueButton(page).click();
  await chooseOption(selectNamed(page, "Service (required)"), "service-full");
  await dayTile(page, "Mon 2 Nov").check();
  await chip(page, "10:00 to 13:00").check();
  await page.getByRole("radio", { name: "Drops the car off" }).check();
  await beat(page);
  // The second page: another staff tab books Amara Okafor at 10:00 on Mon 2 Nov (Oliver Hughes cannot take a
  // three-hour job then: it would run through his break), so no mechanic is left for 10:00.
  const other = await pageAs(context, STAFF);
  await bookFor(other, STAFF, {
    serviceTypeId: "service-full",
    start: "2026-11-02T10:00:00Z",
    technicianId: "tech-lon-birch",
    newCustomer: { name: "Sample Customer", phone: "0161 496 0001" },
    newVehicle: { registration: "SC12 ABC", make: "Ford", model: "Focus" },
  });
  await other.close();
  await page.bringToFront();
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(
    page.getByText("Sorry, 10:00 on Mon 2 Nov was just taken."),
  ).toBeVisible();
  await beat(page, 2000);
  await page
    .getByRole("radiogroup", { name: "Closest to your time" })
    .getByRole("radio")
    .first()
    .check();
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(h1(page, "Tomasz Wilk is booked in.")).toBeVisible();
  await beat(page, 1500);

  // REQ-BOOK-014.AC-4: next time the new customer is found by search, with the vehicle.
  await page.getByRole("link", { name: "Book another for a customer" }).click();
  await searchField(page).pressSequentially("Tomasz", { delay: 60 });
  await resultRow(page, "Tomasz Wilk").check();
  await expect(
    page.getByRole("radio", { name: "Skoda Fabia, TW19 ABC" }),
  ).toBeVisible();
  await beat(page, 1500);
  await endShots(page, "scenario-2-staff-sees-it-and-books");
  await keepVideo(page, "scenario-2-staff-sees-it-and-books");
  await context.close();
});

test("scenario 3, customer changes it (REQ-BOOK-012, 013): reschedule and cancel through the links in the messages; past the cutoff the same links say it can no longer be changed online", async ({
  browser,
}, testInfo) => {
  test.setTimeout(150_000);
  const context = await recorded(browser, testInfo.outputPath("video"));
  const page = await pageAs(context, A);
  const fri = await bookFor(page, A, {
    serviceTypeId: "service-full",
    vehicleId: "vehicle-a",
    start: "2026-10-30T10:00:00Z",
  });
  const mon = await bookFor(page, A, {
    serviceTypeId: "service-oil-change",
    vehicleId: "vehicle-a",
    start: "2026-11-02T09:00:00Z",
  });
  // Another customer cannot have 10:00 on Fri 30 Oct for a full service while A holds it.
  const offeredToB = async () => {
    const answer = await api<{ slots: { start: string }[] }>(
      page,
      B,
      "GET",
      `/dealerships/${LONDON}/availability?serviceTypeId=service-full&date=2026-10-30&transport=drop_off`,
    );
    return answer.body.slots.some((s) => s.start === "2026-10-30T10:00:00Z");
  };
  expect(await offeredToB()).toBe(false);

  // REQ-BOOK-012.AC-2: the reschedule link of the confirmation message.
  const friLinks = (await messagesOf(page, fri.id)).find(
    (m) => m.kind === "confirmation",
  )!.links;
  expect(new URL(friLinks.reschedule).pathname).toBe(
    `/appointments/${fri.id}/reschedule`,
  );
  await page.goto(friLinks.reschedule);
  await expect(dayTile(page, "Fri 30 Oct")).toBeChecked();
  await beat(page, 1200);
  await dayTile(page, "Tue 3 Nov").check();
  await beat(page);
  await chip(page, "13:00 to 16:00").check();
  await beat(page);
  await page.getByRole("button", { name: "Confirm new time" }).click();
  await expect(h1(page, "Tue 3 Nov, 13:00 to 16:00")).toBeVisible();
  expect(await offeredToB()).toBe(true);
  await beat(page, 1500);

  // REQ-BOOK-012.AC-1: the cancel link of another appointment's message (the appointment page, D-0001-77 A).
  const monLinks = (await messagesOf(page, mon.id)).find(
    (m) => m.kind === "confirmation",
  )!.links;
  expect(new URL(monLinks.cancel).pathname).toBe(`/appointments/${mon.id}`);
  await page.goto(monLinks.cancel);
  await page
    .getByRole("main")
    .getByRole("button", { name: "Cancel appointment" })
    .click();
  await beat(page);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel appointment" })
    .click();
  await expect(page.getByText(/^Cancelled on /)).toBeVisible();
  expect(
    (await api<Appointment>(page, A, "GET", `/appointments/${mon.id}`)).body
      .status,
  ).toBe("cancelled");
  await beat(page, 1500);

  // REQ-BOOK-012.AC-4: the browser clock past the cutoff (2 hours before 13:00 on Tue 3 Nov).
  await page.clock.setFixedTime(new Date("2026-11-03T11:01:00Z"));
  const closed = "This appointment can no longer be changed online.";
  await page.goto(friLinks.reschedule);
  await expect(h1(page, closed)).toBeVisible();
  await expect(
    page.getByText(/Your appointment has not changed\.$/),
  ).toBeVisible();
  await expect(page.getByRole("main").getByRole("radio")).toHaveCount(0);
  await beat(page, 1200);
  await page.goto(friLinks.cancel);
  await expect(page.getByRole("heading", { name: closed })).toBeVisible();
  await expect(
    page.getByText(
      "It starts in less than 2 hours. Contact Fakeford Motors (demo) to change it.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("link", { name: PHONE_NAME }),
  ).toHaveAttribute("href", /^tel:/);
  await expect(
    page.getByRole("main").getByRole("button", { name: "Cancel appointment" }),
  ).toHaveCount(0);
  await beat(page, 1500);
  await endShots(page, "scenario-3-customer-changes-it");
  await keepVideo(page, "scenario-3-customer-changes-it");
  await context.close();
});

test("scenario 4, manager (REQ-BOOK-005, 007, 008, 011, 013): move to a free time, a clash with closest times, a shorter weekday that flags one booking, Review flagged and Move, leave that the customer's strip shows, and the outbox", async ({
  browser,
}, testInfo) => {
  test.setTimeout(240_000);
  const context = await recorded(browser, testInfo.outputPath("video"));
  const page = await pageAs(context, MANAGER);
  // Marta's full service, Fri 30 Oct 09:15 with Amara Okafor; at 13:30 that Friday both mechanics are busy.
  const marta = await bookFor(page, STAFF, {
    serviceTypeId: "service-full",
    start: "2026-10-30T09:15:00Z",
    technicianId: "tech-lon-birch",
    newCustomer: { name: "Marta Kowalska", phone: "07700 900123" },
    newVehicle: { registration: "CD34 FGH", make: "Vauxhall", model: "Corsa" },
  });
  for (const [technicianId, name, registration] of [
    ["tech-lon-ash", "Ana Costa", "AC12 DEF"],
    ["tech-lon-birch", "Li Wei", "LW34 GHJ"],
  ] as const)
    await bookFor(page, STAFF, {
      serviceTypeId: "service-full",
      start: "2026-10-30T13:30:00Z",
      technicianId,
      newCustomer: { name, phone: "0161 496 0002" },
      newVehicle: { registration, make: "Ford", model: "Fiesta" },
    });
  const save = page
    .getByRole("button", { name: /^(Save change|Checking…)$/ })
    .first();
  const fill = async (date: string, time: string) => {
    await typeDate(dateNamed(page, "Date"), date);
    await chooseOption(selectNamed(page, "Start time"), time);
  };

  // REQ-BOOK-005.AC-1: a move to a free time (Thu 29 Oct, 09:15).
  await page.goto(`/appointments/${marta.id}/adjust`);
  await expect(h1(page, "Adjust appointment")).toBeVisible();
  await beat(page);
  await fill("2026-10-29", "09:15");
  await beat(page);
  await save.click();
  await expect(
    page.getByRole("heading", { name: "Change saved" }),
  ).toBeVisible();
  await beat(page, 1500);

  // REQ-BOOK-005.AC-2: a clash is refused with the closest free times, and nothing changes.
  await page.goto(`/appointments/${marta.id}/adjust`);
  await fill("2026-10-30", "13:30");
  await save.click();
  await expect(
    page.getByRole("heading", { name: "That change was not saved." }),
  ).toBeVisible();
  const chips = page
    .getByRole("group", { name: "Closest times that are free" })
    .getByRole("button");
  expect(await chips.count()).toBeGreaterThan(0);
  expect(await chips.count()).toBeLessThanOrEqual(5);
  expect(
    (await api<Appointment>(page, MANAGER, "GET", `/appointments/${marta.id}`))
      .body.start,
  ).toBe("2026-10-29T09:15:00Z");
  await beat(page, 2000);

  // REQ-BOOK-007.AC-2..5: Thursday closes at 12:00, so Marta's 09:15 to 12:15 no longer fits.
  await page.goto("/manage/dealership");
  const thursday = page.getByRole("group", { name: "Thursday", exact: true });
  await expect(thursday).toBeVisible();
  const closes = selectNamed(thursday, "Closes");
  await closes.scrollIntoViewIfNeeded();
  await chooseOption(closes, "12:00");
  await beat(page);
  const saveSettings = page
    .getByRole("button", { name: "Save settings" })
    .first();
  await saveSettings.click();
  const warning = page.getByRole("dialog", {
    name: "Saving will flag 1 booking",
  });
  await expect(warning).toBeVisible();
  await beat(page, 1500);
  await warning.getByRole("button", { name: "Go back and edit" }).click();
  await expect(warning).toBeHidden();
  await beat(page);
  await saveSettings.click();
  await warning
    .getByRole("button", { name: "Save and flag 1 booking" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Saved. 1 booking no longer fits." }),
  ).toBeVisible();
  await beat(page, 1200);
  await page.getByRole("link", { name: "Review flagged bookings" }).click();
  await expect(page).toHaveURL(/\/manage\/flagged$/);
  await beat(page, 1200);
  await page
    .getByRole("link", { name: /^Move Full service for Marta Kowalska/ })
    .click();
  const fits = page.getByRole("group", { name: "Times that fit" });
  await expect(fits).toBeVisible();
  await beat(page, 1200);
  await fits.getByRole("button").first().click();
  await save.click();
  await expect(
    page.getByRole("heading", { name: "Change saved" }),
  ).toBeVisible();
  const moved = (
    await api<Appointment & { flags: unknown[] }>(
      page,
      MANAGER,
      "GET",
      `/appointments/${marta.id}`,
    )
  ).body;
  expect(moved.flags).toEqual([]);
  await beat(page, 1500);

  // REQ-BOOK-008.AC-2, AC-4: Tom Fletcher on leave on Mon 2 Nov; the customer's strip loses his EV times.
  // The same tab looks as customer A, then as the manager again (the demo keeps one user per load).
  const customer = page;
  const evDay = `/book?dealership=${LONDON}&service=service-ev-check&date=2026-11-02`;
  const monTile = async () => {
    await signInAs(customer, A);
    await customer.goto(evDay);
    await chooseOption(
      customer.getByRole("button", { name: /^Car/ }),
      "vehicle-a",
    );
    const tile = dayTile(customer, "Mon 2 Nov");
    await expect(tile).toHaveAccessibleName(/^Mon 2 Nov, \d+ times?$/);
    const count = Number(
      /Mon 2 Nov, (\d+) times?/.exec(await tile.ariaSnapshot())![1],
    );
    await beat(customer, 1200);
    await signInAs(customer, MANAGER);
    return count;
  };
  const before = await monTile();
  await page.goto("/manage/shifts?technicianId=tech-lon-cedar");
  await expect(
    page.getByRole("group", { name: "Saturday", exact: true }),
  ).toBeVisible();
  await typeDate(dateNamed(page, "First day"), "2026-11-02");
  await chooseOption(selectNamed(page, "What happens on these days"), "leave");
  await beat(page);
  await page.getByRole("button", { name: "Add to the list" }).click();
  await page.getByRole("button", { name: "Save shifts" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Shifts saved" }),
  ).toBeVisible();
  await beat(page, 1200);
  const after = await monTile();
  expect(after).toBeLessThan(before);

  // REQ-BOOK-013.AC-1, AC-3, AC-4: the outbox holds Marta's confirmation, the cancelled old reminders and new ones.
  await page.goto(`/manage/outbox?appointmentId=${marta.id}`);
  await expect(h1(page, "Outbox")).toBeVisible();
  const messages = await messagesOf(page, marta.id);
  expect(messages.filter((m) => m.kind === "confirmation")).toHaveLength(1);
  expect(
    messages.filter(
      (m) => m.kind.startsWith("reminder") && m.status === "cancelled",
    ).length,
  ).toBeGreaterThan(0);
  expect(
    messages.filter(
      (m) => m.kind.startsWith("reminder") && m.status !== "cancelled",
    ).length,
  ).toBeGreaterThan(0);
  await expect(outboxRow(page, "Confirmation").first()).toBeVisible();
  // Marta's visit is less than 48 hours away, so only the morning-of reminders exist.
  await expect(
    outboxRow(page, "Reminder, morning of the appointment").filter({
      hasText: "Cancelled",
    }),
  ).not.toHaveCount(0);
  await expect(
    outboxRow(page, "Reminder, morning of the appointment").filter({
      hasText: "Scheduled",
    }),
  ).not.toHaveCount(0);
  await expect(outboxRow(page, "Moved to a new time").first()).toBeVisible();
  await outboxRow(page, "Moved to a new time").first().click();
  await beat(page, 1500);
  await endShots(page, "scenario-4-manager");
  await keepVideo(page, "scenario-4-manager");
  await context.close();
});

test("scenario 5, manager books for a customer (D-0001-53, D-0001-54 B, REQ-BOOK-014): a free gap on the schedule, an existing customer, the booking on the schedule and in the outbox; the Book for a customer button opens the same screen", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const context = await recorded(browser, testInfo.outputPath("video"));
  const page = await pageAs(context, MANAGER);
  await page.goto("/schedule?date=2026-10-30");
  await expect(h1(page, "Schedule")).toBeVisible();
  await beat(page, 1200);
  const gap = timeline(page)
    .getByRole("link", { name: /^Free, / })
    .first();
  const gapName = (await gap.getAttribute("aria-label"))!;
  await gap.click();
  await expect(page).toHaveURL(/\/book\/for-customer\?start=/);
  await searchField(page).pressSequentially("Carol", { delay: 60 });
  await resultRow(page, "Demo Walk-in Carol").check();
  await page
    .getByRole("radio", { name: "Demo Motors Coupe, EF22 DMC" })
    .check();
  await beat(page);
  await continueButton(page).click();
  await chooseOption(
    selectNamed(page, "Service (required)"),
    "service-oil-change",
  );
  await waitForTimes(page);
  await page.getByRole("radio", { name: "Waits on site" }).check();
  await beat(page);
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(h1(page, "Demo Walk-in Carol is booked in.")).toBeVisible();
  await beat(page, 1500);
  const [, from] = /Free, (\d\d:\d\d) to/.exec(gapName)!;

  const day = await api<
    (Appointment & { display: { customerName?: string } })[]
  >(
    page,
    MANAGER,
    "GET",
    `/appointments?dealershipId=${LONDON}&date=2026-10-30`,
  );
  const carol = day.body.find(
    (a) => a.display.customerName === "Demo Walk-in Carol",
  )!;
  expect(londonTime(carol.start)).toBe(from);
  await page.goto("/schedule?date=2026-10-30");
  await expect(
    timeline(page).getByRole("button", {
      name: new RegExp(
        `^${from} to .*, Oil and filter change, Demo Motors Coupe EF22 DMC`,
      ),
    }),
  ).toBeVisible();
  await beat(page, 1200);
  await page.goto(`/manage/outbox?appointmentId=${carol.id}`);
  await expect(outboxRow(page, "Confirmation")).toHaveCount(1);
  await beat(page, 1200);

  // D-0001-54 B: the manager's entry point on Schedule.
  await page.goto("/schedule");
  await page
    .getByRole("main")
    .getByRole("link", { name: "Book for a customer" })
    .click();
  await expect(h1(page, "Who is the booking for?")).toBeVisible();
  await beat(page, 1200);
  await page.goto("/schedule?date=2026-10-30");
  await expect(h1(page, "Schedule")).toBeVisible();
  await endShots(page, "scenario-5-manager-books-for-a-customer");
  await keepVideo(page, "scenario-5-manager-books-for-a-customer");
  await context.close();
});

test("scenario 6, roles (REQ-BOOK-005.AC-3, 008.AC-3, 014.AC-5, 012.AC-5): each forbidden page shows no-permission or not-found with none of the other side's data, and no write succeeds", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const context = await recorded(browser, testInfo.outputPath("video"));
  // Every API answer the context sees (the mock answers inside the browser), so "no write" is not "saw nothing".
  const answers: string[] = [];
  const writes: string[] = [];
  context.on("response", (r) => {
    const url = new URL(r.url());
    if (!url.pathname.startsWith("/api")) return;
    const line = `${r.request().method()} ${url.pathname} ${r.status()}`;
    answers.push(line);
    if (r.request().method() !== "GET" && r.status() < 400) writes.push(line);
  });
  const page = await pageAs(context, A);
  const forbidden = async (path: string, title: string, hidden: string[]) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    // The header's demo switcher lists the seeded users by name; the page itself must hold none of the data.
    for (const text of hidden)
      await expect(page.getByRole("main").getByText(text)).toHaveCount(0);
    await beat(page, 900);
  };
  const noStaffData = ["Oliver Hughes", "Amara Okafor", "Tom Fletcher"];
  await forbidden("/schedule", "You cannot do that as Customer.", noStaffData);
  await forbidden(
    "/manage/shifts",
    "You cannot do that as Customer.",
    noStaffData,
  );
  await forbidden("/book/for-customer", "You cannot do that as Customer.", [
    "Demo Customer B",
    "Demo Walk-in Carol",
  ]);
  // Customer A on customer B's appointment: the same words as a random id, nothing of B's.
  await forbidden(
    "/appointments/appointment-customer-b",
    "We cannot find that appointment.",
    ["CD11 DMB", "Estate", "Demo Customer B"],
  );
  await forbidden(
    "/appointments/appointment-customer-b/reschedule",
    "We cannot find that appointment.",
    ["CD11 DMB", "Estate"],
  );

  // The same tab, now as London staff.
  await signInAs(page, STAFF);
  const staff = page;
  const staffSees = async (path: string, title: string, hidden: string[]) => {
    await staff.goto(path);
    await expect(staff.getByRole("heading", { name: title })).toBeVisible();
    for (const text of hidden)
      await expect(staff.getByRole("main").getByText(text)).toHaveCount(0);
    await beat(staff, 900);
  };
  await staffSees("/manage/flagged", "You cannot do that as Staff.", ["Move"]);
  await staffSees(
    "/appointments/appointment-customer-a/adjust",
    "You cannot do that as Staff.",
    ["Save change"],
  );
  await staffSees(
    `/schedule?dealership=${SAIGON}`,
    "You cannot open that dealership.",
    ["Minh Tran", "Linh Nguyen", "Bao Pham"],
  );
  // Proof that the log sees the mock's answers: customer A's read of B's appointment came back 404.
  expect(answers.length).toBeGreaterThan(0);
  expect(answers).toContain("GET /api/appointments/appointment-customer-b 404");
  expect(writes, "no write succeeded").toEqual([]);
  await endShots(staff, "scenario-6-roles");
  await keepVideo(staff, "scenario-6-roles");
  await context.close();
});

test("scenario 7a, time zones (REQ-BOOK-013.AC-2, S4): a browser in Saigon sees London wall times on the booking page, the schedule and the outbox, with the London note on the schedule and the outbox", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const context = await recorded(browser, testInfo.outputPath("video"), {
    timezoneId: "Asia/Ho_Chi_Minh",
  });
  const page = await pageAs(context, A);
  const fri = await bookFor(page, A, {
    serviceTypeId: "service-full",
    vehicleId: "vehicle-a",
    start: "2026-10-30T10:00:00Z",
  });
  // The booking page: the chips are London times and the page says so.
  await page.goto(
    `/book?dealership=${LONDON}&service=service-oil-change&date=2026-10-30`,
  );
  await chooseOption(page.getByRole("button", { name: /^Car/ }), "vehicle-a");
  await expect(chip(page, "08:00 to 09:00")).toBeVisible();
  // Customer A's car is at the dealership from 10:00 to 13:00 (the booking above), so the chips start again at 13:00.
  await expect(chip(page, "13:00 to 14:00")).toBeVisible();
  await beat(page, 1500);

  // The same tab as London staff, then as the London manager.
  await signInAs(page, STAFF);
  const staff = page;
  await staff.goto("/schedule?date=2026-10-30");
  await expect(staff.getByText("Times are in London time.")).toBeVisible();
  await expect(
    timeline(staff).getByRole("button", { name: /^10:00 to 13:00, / }),
  ).toBeVisible();
  await expect(
    timeline(staff).getByText("08:00", { exact: true }),
  ).toBeVisible();
  await beat(staff, 1500);

  await signInAs(page, MANAGER);
  const manager = page;
  await manager.goto(`/manage/outbox?appointmentId=${fri.id}`);
  await expect(h1(manager, "Outbox")).toBeVisible();
  await expect(manager.getByText(/London time/).first()).toBeVisible();
  // The morning-of reminder is due at 08:00 London time, not 15:00 Saigon time.
  await expect(
    outboxRow(manager, "Reminder, morning of the appointment"),
  ).toContainText(/Fri 30 Oct( 2026)?, 08:00/);
  await beat(manager, 1500);
  await endShots(manager, "scenario-7a-time-zones-saigon-browser");
  await keepVideo(manager, "scenario-7a-time-zones-saigon-browser");
  await context.close();
});

test("scenario 7b, time zones (S4): a browser in London sees Saigon wall times with the Saigon note on the Saigon schedule", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const context = await recorded(browser, testInfo.outputPath("video"), {
    timezoneId: "Europe/London",
  });
  const page = await pageAs(context, "user-manager-saigon");
  // Saigon staff book Minh Tran at 09:00 Saigon time (02:00 in London) on Fri 30 Oct.
  const answer = await api<Appointment>(
    page,
    "user-staff-saigon",
    "POST",
    "/appointments",
    {
      dealershipId: SAIGON,
      serviceTypeId: "service-oil-change",
      start: "2026-10-30T02:00:00Z",
      transport: "wait",
      technicianId: "tech-sgn-an",
      newCustomer: { name: "Sample Customer", phone: "0161 496 0003" },
      newVehicle: { registration: "SG30 ABC", make: "Honda", model: "City" },
    },
  );
  expect(answer.status, JSON.stringify(answer.body)).toBe(201);
  await page.goto("/schedule?date=2026-10-30");
  await expect(page.getByText(/^Times are in .+ time\.$/)).toBeVisible();
  await expect(page.getByText("Times are in London time.")).toHaveCount(0);
  await expect(
    timeline(page).getByRole("button", { name: /^09:00 to 10:00, / }),
  ).toBeVisible();
  await expect(timeline(page).getByText("07:30", { exact: true })).toHaveCount(
    0,
  );
  await beat(page, 1500);
  await endShots(page, "scenario-7b-time-zones-london-browser");
  await keepVideo(page, "scenario-7b-time-zones-london-browser");
  await context.close();
});

test("scenario 7c, the clock change (S4): in a London browser, a 10:00 booking sits at 10:00 on Sat 24 Oct (summer time) and, with the clock on Sun 25 Oct 2026, on Tue 27 Oct (winter time), and the 48-hour reminder shows the right London hour", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  // The browser is in London itself, so its own clock goes back with the dealership's (not the host machine's zone).
  const context = await recorded(browser, testInfo.outputPath("video"), {
    timezoneId: "Europe/London",
  });
  const hourPx = 88;
  /** 10:00 sits two hours right of 08:00, and the 10:00 to 11:00 block starts there and is one hour wide. */
  const expectTenOClock = async () => {
    const lane = await timeline(page)
      .getByText("08:00", { exact: true })
      .boundingBox();
    const ten = await timeline(page)
      .getByText("10:00", { exact: true })
      .boundingBox();
    const block = await timeline(page)
      .getByRole("button", { name: /^10:00 to 11:00, / })
      .boundingBox();
    expect(Math.round(ten!.x - lane!.x)).toBe(2 * hourPx);
    expect(Math.round(block!.x - lane!.x)).toBe(2 * hourPx);
    expect(Math.round(block!.width)).toBe(hourPx);
  };
  // Before the change: on Fri 23 Oct (BST) staff book Sat 24 Oct 10:00 BST, which is 09:00 UTC.
  const page = await pageAs(context, STAFF, new Date("2026-10-23T10:00:00Z"));
  await bookFor(page, A, {
    serviceTypeId: "service-oil-change",
    vehicleId: "vehicle-a",
    start: "2026-10-24T09:00:00Z",
  });
  await page.goto("/schedule?date=2026-10-24");
  await expect(h1(page, "Schedule")).toBeVisible();
  await expect(page.getByText(/^Times are in .+ time\.$/)).toHaveCount(0);
  await expectTenOClock();
  await beat(page, 1500);

  // The change day: 00:30 UTC on Sun 25 Oct is 01:30 BST; the clocks go back at 02:00 BST (01:00 UTC).
  await page.clock.setFixedTime(new Date("2026-10-25T00:30:00Z"));
  // Tue 27 Oct, 10:00 GMT: its 48-hour reminder is due at 10:00 UTC on Sun 25 Oct, which is 10:00 GMT, after the change.
  const tue = await bookFor(page, A, {
    serviceTypeId: "service-oil-change",
    vehicleId: "vehicle-a",
    start: "2026-10-27T10:00:00Z",
  });
  await page.goto("/schedule?date=2026-10-27");
  await expect(h1(page, "Schedule")).toBeVisible();
  await expectTenOClock();
  await beat(page, 1500);

  // The same tab as the manager.
  await signInAs(page, MANAGER);
  const manager = page;
  await manager.goto(`/manage/outbox?appointmentId=${tue.id}`);
  await expect(h1(manager, "Outbox")).toBeVisible();
  const due = (await messagesOf(manager, tue.id)).find(
    (m) => m.kind === "reminder_48h" || m.kind.includes("48"),
  )!;
  expect(due.dueAt).toBe("2026-10-25T10:00:00Z");
  await expect(outboxRow(manager, "Reminder, 48 hours before")).toContainText(
    /Sun 25 Oct( 2026)?, 10:00/,
  );
  await beat(manager, 1500);
  await endShots(manager, "scenario-7c-clock-change");
  await keepVideo(manager, "scenario-7c-clock-change");
  await context.close();
});

test("scenario 8, dev panel (NFR-6): after the race the panel shows the confirmed booking and the 409 with its reason, the 409's reference finds the same line, and Reset demo data returns the schedule to the seed", async ({
  browser,
}, testInfo) => {
  test.setTimeout(150_000);
  const context = await recorded(browser, testInfo.outputPath("video"));
  const first = await pageAs(context, A);
  const page = await pageAs(context, B);
  const seedDay = await api<Appointment[]>(
    page,
    STAFF,
    "GET",
    `/appointments?dealershipId=${LONDON}&date=2026-10-31`,
  );
  // The race three hours after the seeded EV check of customer A (Sat 31 Oct, 13:00): Tom Fletcher is the one free EV
  // technician, and the cars of A and B are both free (D-0001-146).
  const start = await contestedEvStart(page);
  const range = `${londonTime(start)} to ${londonTime(plusMinutes(start, 60))}`;
  for (const p of [first, page]) {
    await p.goto(
      `/book?dealership=${LONDON}&service=service-ev-check&date=2026-10-31`,
    );
    await chooseOption(
      p.getByRole("button", { name: /^Car/ }),
      p === first ? "vehicle-a" : "vehicle-b",
    );
    await dayTile(p, londonDay(start)).check();
    await chip(p, range).check();
    await p.getByRole("radio", { name: "Wait on site" }).check();
  }
  await first.getByRole("button", { name: "Confirm booking" }).click();
  await expect(h1(first, "You are booked")).toBeVisible();
  const refusal = page.waitForResponse(
    (r) => r.url().endsWith("/api/appointments") && r.status() === 409,
  );
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(
    page.getByText(
      `Sorry, ${londonTime(start)} on ${londonDay(start)} was just taken.`,
    ),
  ).toBeVisible();
  const reference = (await (await refusal).headerValue("X-Trace-Id"))!.slice(
    0,
    8,
  );
  await page
    .getByRole("radiogroup", { name: "Closest to your time" })
    .getByRole("radio")
    .first()
    .check();
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(h1(page, "You are booked")).toBeVisible();
  await beat(page, 1200);

  // The panel of this tab (the telemetry is counted per tab, so it is opened by its footer link).
  await page
    .getByRole("contentinfo")
    .getByRole("link", { name: "Dev panel" })
    .click();
  await expect(h1(page, "Dev panel")).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Numbers" })
      .getByRole("heading", { level: 3, name: "Bookings confirmed" })
      .locator(".."),
  ).toContainText("1 booking");
  const lines = page
    .getByRole("list", { name: "Log lines" })
    .getByRole("listitem");
  const refused = lines.filter({ hasText: "appointment.book409" });
  await expect(refused).toHaveCount(1);
  await expect(refused).toContainText("slot_unavailable");
  await expect(lines.filter({ hasText: "appointment.book201" })).toHaveCount(1);
  await beat(page, 1200);
  const search = page.getByRole("searchbox", { name: "Find a reference" });
  await search.pressSequentially(reference, { delay: 80 });
  // Every line of that request carries its reference; the refused booking is one of them.
  await expect(lines.filter({ hasText: "appointment.book201" })).toHaveCount(0);
  await expect(lines.filter({ hasText: "appointment.book409" })).toHaveCount(1);
  for (const line of await lines.all())
    await expect(line).toContainText(`reference ${reference}`);
  await beat(page, 1500);
  await search.fill("");

  await page.getByRole("button", { name: "Reset demo data" }).click();
  await page
    .getByRole("dialog", { name: "Reset all demo data?" })
    .getByRole("button", { name: "Reset demo data" })
    .click();
  await expect(
    page.getByText("Demo data reset. The starting data is loaded again."),
  ).toBeVisible();
  const afterDay = await api<Appointment[]>(
    page,
    STAFF,
    "GET",
    `/appointments?dealershipId=${LONDON}&date=2026-10-31`,
  );
  expect(afterDay.body.map((a) => a.id)).toEqual(seedDay.body.map((a) => a.id));
  await beat(page, 1500);
  await signInAs(page, STAFF);
  await page.goto("/schedule?date=2026-10-31");
  await expect(
    timeline(page).getByRole("button", { name: /^10:00 to 11:00, / }),
  ).toHaveCount(1);
  await beat(page, 1200);
  await first.close();
  await endShots(page, "scenario-8-dev-panel");
  await keepVideo(page, "scenario-8-dev-panel");
  await context.close();
});

// design.md section 9 ("Formats"): when the viewer's zone differs from the dealership's, the screen says so once.
// Found by C8; fixed by ticket 2026-10-29-time-zone-note-on-every-customer-screen.
test("the customer booking page in a Saigon browser says its times are London time (design.md section 9)", async ({
  browser,
}) => {
  const context = await browser.newContext({ timezoneId: "Asia/Ho_Chi_Minh" });
  const page = await pageAs(context, A);
  await page.goto(
    `/book?dealership=${LONDON}&service=service-oil-change&date=2026-10-30`,
  );
  await chooseOption(page.getByRole("button", { name: /^Car/ }), "vehicle-a");
  await expect(chip(page, "10:00 to 11:00")).toBeVisible();
  await expect(page.getByText(/London time/).first()).toBeVisible({
    timeout: 3000,
  });
  await context.close();
});
