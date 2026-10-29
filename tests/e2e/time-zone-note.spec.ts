// The time-zone note on every screen that shows a London appointment's times (design.md section 9, REQ-BOOK-013.AC-2,
// ticket 2026-10-29-time-zone-note-on-every-customer-screen). A browser in Asia/Ho_Chi_Minh sees "Times are in
// London time." once, and the London wall times; a browser in Europe/London sees no note. The clock is fixed at
// Wed 28 Oct 2026, 10:40 in London, and the appointment the screens show is booked through the API for Fri 30 Oct
// 10:00 London time (17:00 in Saigon), so nothing depends on today's weekday. With EVIDENCE_DIR set, each screen in
// the Saigon browser is saved at 390 and 1440 wide as `<screen>-saigon-<width>.png` (D-0000-13).
import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  expect,
  test,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";
import {
  A,
  LONDON,
  MANAGER,
  SAIGON,
  STAFF,
  api,
  open,
  signInAs,
} from "./demo-support";
import {
  expectNoAxeViolations,
  expectNoSidewaysScroll,
  widths,
} from "./support";

const NOW = new Date("2026-10-28T10:40:00Z");
const FRI_10 = "2026-10-30T10:00:00Z";
const NOTE = "Times are in London time.";
const DAY = `/book?dealership=${LONDON}&service=service-oil-change&date=2026-10-30`;

interface Screen {
  name: string;
  user: string;
  path: (id: string) => string;
  /** A London wall time that the screen shows once it has loaded. */
  londonTime: (page: Page) => Locator;
  before?: (page: Page) => Promise<void>;
}

const radio = (page: Page, name: RegExp) =>
  page.getByRole("radio", { name }).first();

const screens: Screen[] = [
  {
    name: "book",
    user: A,
    path: () => DAY,
    before: (page) =>
      page
        .getByRole("combobox", { name: /^Car/ })
        .selectOption("vehicle-a")
        .then(() => undefined),
    // London opens at 08:00: in Saigon's clock that would be 15:00.
    londonTime: (page) => radio(page, /^08:00 to 09:00/),
  },
  {
    name: "book-confirmed",
    user: A,
    path: (id) => `/book/confirmed/${id}`,
    londonTime: (page) => page.getByText(/^Fri 30 Oct, 10:00 to 11:00$/),
  },
  {
    name: "my-appointments",
    user: A,
    path: () => "/appointments",
    // The seed's own booking is on Sat 31 Oct at 10:00 too.
    londonTime: (page) =>
      page.getByRole("link", { name: "Fri 30 Oct 10:00 to 11:00" }),
  },
  {
    name: "appointment",
    user: A,
    path: (id) => `/appointments/${id}`,
    londonTime: (page) =>
      page.getByRole("heading", {
        level: 1,
        name: "Fri 30 Oct, 10:00 to 11:00",
      }),
  },
  {
    name: "reschedule",
    user: A,
    path: (id) => `/appointments/${id}/reschedule`,
    londonTime: (page) => page.getByText(/Fri 30 Oct, 10:00 to 11:00/).first(),
  },
  {
    name: "book-staff",
    user: STAFF,
    path: () => `${DAY}&customerId=customer-a&vehicleId=vehicle-a`,
    londonTime: (page) => radio(page, /^08:00 to 09:00/),
  },
  {
    name: "book-for-customer",
    user: STAFF,
    path: () =>
      "/book/for-customer?start=2026-10-30T09%3A00%3A00Z&technicianId=tech-lon-birch",
    londonTime: (page) => page.getByText(/on Fri 30 Oct, from 09:00\.$/),
  },
  {
    name: "adjust",
    user: MANAGER,
    path: (id) => `/appointments/${id}/adjust`,
    londonTime: (page) => page.getByText(/10:00 to 11:00/).first(),
  },
];

/** A browser in `zone` with Customer A's oil change booked for Fri 30 Oct, 10:00 London time. */
async function setUp(browser: Browser, zone: string) {
  const context = await browser.newContext({ timezoneId: zone });
  const page = await context.newPage();
  await page.clock.setFixedTime(NOW);
  await signInAs(page, A);
  await open(page, "/");
  const answer = await api<{ id: string }>(page, A, "POST", "/appointments", {
    dealershipId: LONDON,
    serviceTypeId: "service-oil-change",
    vehicleId: "vehicle-a",
    start: FRI_10,
    transport: "drop_off",
  });
  expect(answer.status, JSON.stringify(answer.body)).toBe(201);
  return { context, page, id: answer.body.id };
}

async function show(page: Page, screen: Screen, id: string) {
  await signInAs(page, screen.user);
  await load(page, screen, id);
}

/** Opens the screen as a person would at the page's current width. */
async function load(page: Page, screen: Screen, id: string) {
  await open(page, screen.path(id));
  await screen.before?.(page);
  await expect(screen.londonTime(page)).toBeVisible();
}

async function shot(page: Page, name: string) {
  const dir = process.env["EVIDENCE_DIR"];
  if (!dir) return;
  mkdirSync(path.join(dir, "shots"), { recursive: true });
  const width = page.viewportSize()?.width ?? 0;
  await page.screenshot({
    path: path.join(dir, "shots", `${name}-saigon-${width}.png`),
    fullPage: true,
  });
}

for (const screen of screens) {
  test(`${screen.name}: a browser in Saigon says once that the times are London time, and shows London times; no sideways scroll from 320 to 1440, and axe is clean at 390 and 1440`, async ({
    browser,
  }) => {
    const { context, page, id } = await setUp(browser, "Asia/Ho_Chi_Minh");
    await show(page, screen, id);
    await expect(page.getByText(NOTE)).toHaveCount(1);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await load(page, screen, id);
      await expect(page.getByText(NOTE)).toBeVisible();
      await expectNoSidewaysScroll(page);
      if (width === 390 || width === 1440) {
        await expectNoAxeViolations(page);
        await shot(page, screen.name);
      }
    }
    await context.close();
  });

  test(`${screen.name}: a browser in London shows no time-zone note`, async ({
    browser,
  }) => {
    const { context, page, id } = await setUp(browser, "Europe/London");
    await show(page, screen, id);
    await expect(page.getByText(/^Times are in .+ time\.$/)).toHaveCount(0);
    await expect(page.getByText(/\(.+ time\)/)).toHaveCount(0);
    await context.close();
  });
}

test("my appointments at dealerships in two zones: no page note, and each card in another zone than the browser's says its own (Q-0001-252)", async ({
  browser,
}) => {
  for (const [zone, london, saigon] of [
    ["Asia/Ho_Chi_Minh", "10:00 to 11:00 (London time)", "09:00 to 10:00"],
    ["Europe/London", "10:00 to 11:00", "09:00 to 10:00 (Ho Chi Minh time)"],
  ] as const) {
    const { context, page } = await setUp(browser, zone);
    // 09:00 Saigon time on Fri 30 Oct is 02:00 in London.
    const answer = await api(page, A, "POST", "/appointments", {
      dealershipId: SAIGON,
      serviceTypeId: "service-oil-change",
      vehicleId: "vehicle-a",
      start: "2026-10-30T02:00:00Z",
      transport: "drop_off",
    });
    expect(answer.status, JSON.stringify(answer.body)).toBe(201);
    await open(page, "/appointments");
    await expect(
      page.getByRole("link", { name: `Fri 30 Oct ${london}` }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: `Fri 30 Oct ${saigon}` }),
    ).toBeVisible();
    await expect(page.getByText(/^Times are in .+ time\.$/)).toHaveCount(0);
    await context.close();
  }
});
