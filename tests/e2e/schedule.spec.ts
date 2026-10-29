// The staff schedule and the appointment page in a real browser (C3, REQ-BOOK-004, staff.md 5.1 and 5.2).
// Every state is reached by real use through the API: bookings by staff, a manager cutting a shift, leave,
// a closed date, a cancel. Only the failure, slow and very busy days are faked, test-side (interceptApi).
// The default config runs these against the built app under its Content Security Policy.
import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import {
  LONDON,
  TODAY,
  api,
  book,
  cancelAsManager,
  changeShift,
  closeDate,
  seedBusyDay,
} from "./schedule-data";
import {
  expectNoAxeViolations,
  expectNoSidewaysScroll,
  interceptApi,
  openApp,
  pickRole,
  problemBody,
  widths,
} from "./support";

// Screenshots go to the ticket's evidence folder when EVIDENCE_DIR is set (D-0000-13).
const evidence = process.env["EVIDENCE_DIR"] ?? "test-results/evidence";
const shotsDir = `${evidence}/shots`;
mkdirSync(shotsDir, { recursive: true });

async function shot(page: Page, name: string) {
  const width = page.viewportSize()?.width ?? 0;
  await page.screenshot({
    path: `${shotsDir}/${name}-${width}.png`,
    fullPage: true,
  });
}

/** Picks the role and closes the "Now viewing as" toast so it does not cover the page. */
async function signIn(page: Page, role: "Customer" | "Staff" | "Manager") {
  await pickRole(page, role);
  await page.getByRole("button", { name: "Dismiss" }).click();
}

async function openSchedule(page: Page, query = "") {
  await page.goto(`/schedule${query}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Schedule" }),
  ).toBeVisible();
  await expect(
    page.getByText(/appointment|Nothing is booked|is closed on/).first(),
  ).toBeVisible();
}

const timeline = (page: Page) =>
  page.getByRole("region", { name: "Day timeline, scrolls sideways" });

async function checkState(page: Page, name: string) {
  await expectNoSidewaysScroll(page);
  await expectNoAxeViolations(page);
  await shot(page, name);
}

for (const width of [390, 1440]) {
  const wide = width >= 1024;
  test.describe(`at ${width} wide`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
    });

    test("the day: timeline (desktop) or list (phone), selected, selected-flagged, list, list-bays, bays", async ({
      page,
    }) => {
      await seedBusyDay(page);
      await signIn(page, "Staff");
      await openSchedule(page);
      const facts =
        "4 appointments, 1 flagged, 2 free gaps. 2 technicians working, 1 on leave.";
      await expect(page.getByText(facts)).toBeVisible();
      await checkState(page, "schedule-timeline");

      if (wide) {
        // State selected: a 3px outline, the panel filled, focus stays on the block.
        const jan = timeline(page).getByRole("button", {
          name: "09:15 to 12:15, Full service, Vauxhall Corsa CD34 FGH, Demo Tech Birch, Bay 1, Drop-off",
        });
        await jan.click();
        await expect(jan).toHaveAttribute("aria-pressed", "true");
        await expect(jan).toBeFocused();
        expect(
          await jan.evaluate((e) => getComputedStyle(e).outlineWidth),
        ).toBe("3px");
        await expect(
          page.getByRole("link", { name: "Open appointment" }),
        ).toBeVisible();
        await expect(page.getByText("Jan Nowak")).toBeVisible();
        await checkState(page, "schedule-selected");

        // State selected-flagged, reached with Show flagged.
        await page.getByRole("button", { name: "Show flagged" }).click();
        const flagged = timeline(page).getByRole("button", {
          name: /, flagged: /,
        });
        await expect(flagged).toBeFocused();
        await expect(flagged).toHaveAttribute("aria-pressed", "true");
        await expect(
          page.getByText(
            "The booking is still valid. The garage manager can move it.",
          ),
        ).toBeVisible();
        await expect(page.getByText("Courtesy car, Car 1")).toBeVisible();
        await checkState(page, "schedule-selected-flagged");

        await page
          .getByRole("group", { name: "View" })
          .getByRole("button", { name: "List" })
          .click();
        await expect(page).toHaveURL(/view=list/);
      }
      // Below 1024 wide there is no timeline and no detail panel, so the states selected and selected-flagged
      // exist only on the desktop (staff.md 5.1 draws no phone version). No 390 shots are taken of them.

      // The list: time order, gap rows between, each row 64px or more.
      const list = page.getByRole("list", { name: /in time order/ });
      await expect(list).toBeVisible();
      const rows = list.getByRole("listitem");
      await expect(rows.first()).toContainText("08:00");
      await expect(rows.first()).toContainText("Waiting");
      for (const box of await rows.evaluateAll((items) =>
        items.map((i) => i.getBoundingClientRect().height),
      )) {
        expect(box).toBeGreaterThanOrEqual(63.5);
      }
      const gapRow = list
        .getByRole("link", { name: /^Free, .* Book this time\.$/ })
        .first();
      await expect(gapRow).toHaveAttribute(
        "href",
        /^\/book\/for-customer\?start=.*&technicianId=tech-lon-/,
      );
      await checkState(page, "schedule-list");

      // Rows to Bays: one row per bay, no free gaps, and the facts line says why.
      await page
        .getByRole("group", { name: "Rows" })
        .getByRole("button", { name: "Bays" })
        .click();
      await expect(page).toHaveURL(/rows=bays/);
      await expect(
        page.getByText(
          "4 appointments across 1 of 2 bays. Free time is shown by technician.",
        ),
      ).toBeVisible();
      await expect(page.getByRole("link", { name: /^Free, / })).toHaveCount(0);
      await checkState(page, "schedule-list-bays");

      if (wide) {
        await page
          .getByRole("group", { name: "View" })
          .getByRole("button", { name: "Timeline" })
          .click();
        await expect(
          timeline(page).getByRole("group", { name: "Bay 2" }),
        ).toBeVisible();
        await expect(
          timeline(page)
            .getByRole("group", { name: "Bay 2" })
            .getByRole("button"),
        ).toHaveCount(0);
        await expect(
          timeline(page)
            .getByRole("group", { name: "Bay 1" })
            .getByRole("button"),
        ).toHaveCount(4);
        await checkState(page, "schedule-bays");
      } else {
        // The phone has no bay timeline: Bays is the bay list, checked like any state.
        await checkState(page, "schedule-bays");
      }
    });

    test("one technician's day and one bay's day (technician, bay-day)", async ({
      page,
    }) => {
      await seedBusyDay(page);
      await signIn(page, "Staff");
      await openSchedule(page, wide ? "" : "?view=technician");
      if (wide) {
        // Desktop falls back to the timeline.
        await expect(timeline(page)).toBeVisible();
        await checkState(page, "schedule-technician");
        await openSchedule(page, "?rows=bays&view=technician");
        await expect(timeline(page)).toBeVisible();
        await checkState(page, "schedule-bay-day");
        return;
      }
      await expect(page.getByLabel("Technician", { exact: true })).toHaveValue(
        "tech-lon-ash",
      );
      await page.getByRole("button", { name: "Next technician" }).click();
      await expect(page).toHaveURL(/row=tech-lon-birch/);
      await expect(
        page.getByText(
          "Mechanic, shift 09:00 to 17:30. 2 appointments, 2 free gaps.",
        ),
      ).toBeVisible();
      // Hours run down at 88px an hour: the 3 hour block is 264px high.
      const jan = page.getByRole("link", {
        name: /^09:15 to 12:15, Full service/,
      });
      expect(Math.round((await jan.boundingBox())!.height)).toBe(264);
      await checkState(page, "schedule-technician");

      await page
        .getByRole("group", { name: "Rows" })
        .getByRole("button", { name: "Bays" })
        .click();
      await expect(page.getByLabel("Service bay")).toHaveValue("bay-lon-1");
      await checkState(page, "schedule-bay-day");
    });

    test("empty-day, closed-day, past-day, and a closed day that still holds bookings", async ({
      page,
    }) => {
      await seedBusyDay(page);
      // Cedar is on leave on Mon 2 Nov too, so the facts line has the leave count.
      await changeShift(page, "tech-lon-cedar", "2026-11-02", {
        kind: "leave",
      });
      await signIn(page, "Staff");
      await openSchedule(page);

      // Past day: by stepping back.
      await page.getByRole("button", { name: "Previous day" }).click();
      await expect(page).toHaveURL(/date=2026-10-27/);
      await expect(
        page.getByText(
          "2 appointments, 0 flagged. This day has passed, so no free gaps are shown.",
        ),
      ).toBeVisible();
      await expect(page.getByRole("link", { name: /^Free, / })).toHaveCount(0);
      await expect(page.getByText(/^Now \d/)).toHaveCount(0);
      await checkState(page, "schedule-past-day");

      // Today is disabled on today, and says why.
      await page.getByRole("button", { name: "Today" }).click();
      await expect(page).toHaveURL(/date=2026-10-28/);
      const todayButton = page.getByRole("button", { name: "Today" });
      await expect(todayButton).toBeDisabled();
      await expect(todayButton).toHaveAttribute(
        "title",
        "You are already looking at today",
      );

      // Closed day: Sun 1 Nov (London is closed on Sundays, D-0001-38 B).
      await openSchedule(page, "?date=2026-11-01");
      await expect(
        page.getByRole("heading", {
          name: "Fakeford Motors (demo) is closed on Sun 1 Nov.",
        }),
      ).toBeVisible();
      await expect(timeline(page)).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Back to today" }),
      ).toBeVisible();
      await checkState(page, "schedule-closed-day");

      // Empty day: Mon 2 Nov, from the closed day's button.
      await page.getByRole("button", { name: "Go to Mon 2 Nov" }).click();
      await expect(page).toHaveURL(/date=2026-11-02/);
      await expect(
        page.getByRole("heading", {
          name: "Nothing is booked for Mon 2 Nov yet.",
        }),
      ).toBeVisible();
      await expect(
        page.getByText("No appointments. 2 technicians working, 1 on leave."),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: /^Free, / }).first(),
      ).toBeVisible();
      await expect(
        page
          .getByRole("main")
          .getByRole("link", { name: "Book for a customer" }),
      ).toHaveCount(2);
      await checkState(page, "schedule-empty-day");

      // A closed day with bookings (the demo data has one on Fri 30 Oct): the notice above, the bookings
      // still drawn (AD-14).
      await closeDate(page, "2026-10-30");
      await openSchedule(page, "?date=2026-10-30");
      await expect(
        page.getByText(
          "Fakeford Motors (demo) is closed on Fri 30 Oct, but 1 booking is still on it.",
        ),
      ).toBeVisible();
      await expect(page.getByText(/1 appointment, 1 flagged/)).toBeVisible();
      await checkState(page, "schedule-closed-day-with-bookings");
    });

    test("loading and error", async ({ page }) => {
      await interceptApi(page, { path: "/schedule", delayMs: 1500 });
      await page.goto("/");
      await signIn(page, "Staff");
      await expect(page.getByText("Loading the schedule")).toBeAttached();
      await expect(page.locator("[aria-busy=true]")).toBeVisible();
      await shot(page, "schedule-loading");
      await expectNoAxeViolations(page);

      const failing = await page.context().newPage();
      await failing.setViewportSize({ width, height: 900 });
      await failing.clock.setFixedTime(new Date("2026-10-28T10:40:00Z"));
      await interceptApi(failing, {
        path: "/schedule",
        status: 500,
        body: problemBody(500, "INTERNAL"),
      });
      await failing.goto("/schedule");
      await expect(
        failing.getByRole("heading", {
          name: "We could not load the schedule for Wed 28 Oct.",
        }),
      ).toBeVisible();
      await expect(
        failing.getByRole("button", { name: "Try again" }),
      ).toBeVisible();
      await expect(failing.getByText("4bf92f35").first()).toBeVisible();
      await expect(
        failing.getByRole("button", { name: /^Copy/ }),
      ).toBeVisible();
      await checkState(failing, "schedule-error");
    });

    test("the appointment page: confirmed, flagged, cancelled, not-found, loading, error", async ({
      page,
    }) => {
      const ids = await seedBusyDay(page);
      await signIn(page, "Staff");
      await page.goto(`/appointments/${ids.jan}`);
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Wed 28 Oct, 09:15 to 12:15",
        }),
      ).toBeVisible();
      await expect(page.getByText("Full service for Jan Nowak")).toBeVisible();
      await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Need to change or cancel this?" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /cancel|reschedule|adjust/i }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: "Book another visit for Jan" }),
      ).toHaveAttribute(
        "href",
        /^\/book\?dealership=dealership-london&customerId=[^&]+&vehicleId=[^&]+$/,
      );
      await expect(page.getByText("sample@example.com")).toHaveCount(0);
      await checkState(page, "appointment-confirmed");

      await page.goto(`/appointments/${ids.leila}`);
      await expect(
        page.getByRole("heading", { name: /^Flagged: / }),
      ).toBeVisible();
      await expect(
        page.getByText(
          "It is still booked and still holds its technician and bay. The garage manager can move it from the Flagged list.",
        ),
      ).toBeVisible();
      await checkState(page, "appointment-flagged");

      await cancelAsManager(page, ids.jan);
      await page.goto(`/appointments/${ids.jan}`);
      await expect(
        page.getByText(
          /^This appointment was cancelled on Wed 28 Oct, 10:40\.$/,
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "What next?" }),
      ).toBeVisible();
      await checkState(page, "appointment-cancelled");

      await page.goto("/appointments/no-such-appointment");
      await expect(
        page.getByRole("heading", { name: "We cannot find that appointment." }),
      ).toBeVisible();
      await expect(
        page.getByText(
          "It may have been removed, or it belongs to another dealership.",
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Go to the schedule" }),
      ).toBeVisible();
      await checkState(page, "appointment-not-found");

      const slow = await page.context().newPage();
      await slow.setViewportSize({ width, height: 900 });
      await interceptApi(slow, {
        path: `/appointments/${ids.leila}`,
        delayMs: 1500,
      });
      await slow.goto(`/appointments/${ids.leila}`);
      await expect(slow.getByText("Loading the appointment")).toBeAttached();
      await shot(slow, "appointment-loading");
      await expectNoAxeViolations(slow);

      const failing = await page.context().newPage();
      await failing.setViewportSize({ width, height: 900 });
      await interceptApi(failing, {
        path: `/appointments/${ids.leila}`,
        status: 500,
        body: problemBody(500, "INTERNAL"),
      });
      await failing.goto(`/appointments/${ids.leila}`);
      await expect(
        failing.getByRole("heading", {
          name: "We could not load this appointment.",
        }),
      ).toBeVisible();
      await expect(
        failing.getByRole("button", { name: "Try again" }),
      ).toBeVisible();
      await checkState(failing, "appointment-error");
    });

    test("no-permission: a customer on /schedule, and London staff asking for Saigon", async ({
      page,
    }) => {
      await page.clock.setFixedTime(new Date("2026-10-28T10:40:00Z"));
      const asked: string[] = [];
      page.on("request", (r) => {
        if (r.url().includes("/api/") && r.url().includes("/schedule"))
          asked.push(r.url());
      });
      await page.goto("/");
      await signIn(page, "Customer");
      await page.goto("/schedule");
      await expect(
        page.getByRole("heading", { name: "You cannot do that as Customer." }),
      ).toBeVisible();
      await checkState(page, "schedule-no-permission");
      expect(asked).toEqual([]);

      await signIn(page, "Staff");
      if (wide) {
        await page
          .getByLabel("Who")
          .selectOption({ label: "Demo Staff London" });
      } else {
        await page.getByRole("button", { name: /^Viewing as/ }).click();
        await page
          .getByRole("dialog", { name: "Viewing as" })
          .getByLabel("Who")
          .selectOption({ label: "Demo Staff London" });
        await page.keyboard.press("Escape");
      }
      await expect(
        page.getByText(/Now viewing as Staff, Demo Staff London/),
      ).toBeVisible();
      asked.length = 0;
      await page.goto("/schedule?dealership=dealership-saigon");
      await expect(
        page.getByRole("heading", { name: "You cannot open that dealership." }),
      ).toBeVisible();
      await checkState(page, "schedule-other-dealership");
      expect(asked.filter((u) => u.includes("saigon"))).toEqual([]);

      // Another dealership's appointment is not-found for London staff, as a random id is (D-0000-27).
      const saigon = await api(
        page,
        "user-staff-saigon",
        "POST",
        "/appointments",
        {
          dealershipId: "dealership-saigon",
          serviceTypeId: "service-oil-change",
          start: "2026-10-30T03:00:00Z",
          transport: "wait",
          newCustomer: {
            name: "Saigon Customer",
            phone: "0901 234 567",
            email: "saigon@example.com",
          },
          newVehicle: {
            registration: "51A 12345",
            make: "Toyota",
            model: "Vios",
          },
        },
      );
      expect(saigon.status).toBe(201);
      await page.goto(`/appointments/${(saigon.body as { id: string }).id}`);
      await expect(
        page.getByRole("heading", { name: "We cannot find that appointment." }),
      ).toBeVisible();
      await expect(
        page.getByText(
          "It may have been removed, or it belongs to another dealership.",
        ),
      ).toBeVisible();
      await shot(page, "appointment-not-found-other-dealership");
    });
  });
}

test("a new booking shows on opening and on reloading the day (REQ-BOOK-004.AC-2)", async ({
  page,
}) => {
  await seedBusyDay(page);
  await signIn(page, "Staff");
  await openSchedule(page);
  await expect(page.getByText(/^4 appointments/)).toBeVisible();
  await book(page, {
    date: TODAY,
    time: "16:15",
    technicianId: "tech-lon-birch",
    name: "Newly Booked",
    make: "Honda",
    model: "Jazz",
    registration: "NB26 AAA",
  });
  await page.reload();
  await expect(page.getByText(/^5 appointments/)).toBeVisible();
  await expect(
    timeline(page).getByRole("button", { name: /Honda Jazz NB26 AAA/ }),
  ).toBeVisible();
  await openSchedule(page, "?date=2026-10-28&view=list");
  await expect(page.getByRole("link", { name: /Honda Jazz/ })).toBeVisible();
});

test("the timeline: shading, break, leave, Now line, gaps, names and Tab order", async ({
  page,
}) => {
  await seedBusyDay(page);
  await signIn(page, "Staff");
  await openSchedule(page);
  const ash = timeline(page).getByRole("group", { name: "Demo Tech Ash" });
  await expect(ash).toContainText("Mechanic, ev · shift 08:00 to 14:00");
  await expect(ash.getByText("Break 12:00 to 12:30")).toBeAttached();
  await expect(
    timeline(page).getByRole("group", { name: "Demo Tech Cedar, on leave" }),
  ).toContainText("On leave today. No bookings.");
  await expect(timeline(page).getByText("Now 10:40")).toBeVisible();
  // Hatching outside the shift: one before and one after.
  await expect(ash.locator(".hatched")).toHaveCount(2);

  const flagged = ash.getByRole("button", { name: /, flagged: / });
  await expect(flagged).toHaveAccessibleName(
    /^13:15 to 14:15, Oil and filter change, Kia Ceed EF56 JKL, Demo Tech Ash, Bay 1, Courtesy car, Car 1, flagged: .+$/,
  );
  const birch = timeline(page).getByRole("group", { name: "Demo Tech Birch" });
  const gap = birch.getByRole("link").first();
  await expect(gap).toHaveAccessibleName(
    /^Free, \d\d:\d\d to \d\d:\d\d, .+, Demo Tech Birch\. Book this time\.$/,
  );
  // Rows are groups; Tab walks each row in time order, no custom arrow keys. The expected order comes
  // from the start times in the names, not from the page, so a wrong sort in the row fails here.
  for (const row of [ash, birch]) {
    const names = await row
      .locator("button, a")
      .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")!));
    expect(names.length).toBeGreaterThan(1);
    const startOf = (name: string) => /(\d\d:\d\d) to /.exec(name)![1]!;
    const inTimeOrder = [...names].sort((x, y) =>
      startOf(x).localeCompare(startOf(y)),
    );
    await row.getByRole("button").or(row.getByRole("link")).first().focus();
    await expect(page.locator(":focus")).toHaveAttribute(
      "aria-label",
      inTimeOrder[0]!,
    );
    for (const name of inTimeOrder.slice(1)) {
      await page.keyboard.press("Tab");
      await expect(page.locator(":focus")).toHaveAttribute("aria-label", name);
    }
  }
});

test("a date that is not a real date opens today, like no date", async ({
  page,
}) => {
  await seedBusyDay(page);
  await signIn(page, "Staff");
  await openSchedule(page, "?date=2026-13-45");
  await expect(
    page.getByText(
      "4 appointments, 1 flagged, 2 free gaps. 2 technicians working, 1 on leave.",
    ),
  ).toBeVisible();
});

test("the manager's gaps link to the booking too, and the manager has no top Book button (D-0001-54)", async ({
  page,
}) => {
  await seedBusyDay(page);
  await signIn(page, "Manager");
  await openSchedule(page);
  await expect(
    timeline(page)
      .getByRole("link", { name: /^Free, / })
      .first(),
  ).toHaveAttribute(
    "href",
    /^\/book\/for-customer\?start=[^&]+&technicianId=tech-lon-[a-z]+$/,
  );
  await expect(
    page.getByRole("main").getByRole("link", { name: "Book for a customer" }),
  ).toHaveCount(0);
});

test("the built app places blocks and gaps at the right offset and width under its CSP (SEC-15.AC-1)", async ({
  page,
}) => {
  const violations: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to/.test(m.text()))
      violations.push(m.text());
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedBusyDay(page);
  await signIn(page, "Staff");
  await openSchedule(page);
  const hourPx = 88;
  const lane = await timeline(page)
    .getByText("08:00", { exact: true })
    .boundingBox();
  const block = await timeline(page)
    .getByRole("button", { name: /^09:15 to 12:15/ })
    .boundingBox();
  expect(Math.round(block!.x - lane!.x)).toBe(Math.round(1.25 * hourPx));
  expect(Math.round(block!.width)).toBe(3 * hourPx);
  const gap = timeline(page)
    .getByRole("link", { name: /^Free, / })
    .first();
  const name = (await gap.getAttribute("aria-label"))!;
  const [, from, to] = /Free, (\d\d:\d\d) to (\d\d:\d\d)/.exec(name)!;
  const minutes = (t: string) =>
    Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const gapBox = await gap.boundingBox();
  expect(Math.round(gapBox!.x - lane!.x)).toBe(
    Math.round(((minutes(from!) - 8 * 60) / 60) * hourPx),
  );
  expect(Math.round(gapBox!.width)).toBe(
    Math.round(((minutes(to!) - minutes(from!)) / 60) * hourPx),
  );
  // No inline style text in the served HTML.
  const html = await (await page.request.get("/schedule")).text();
  expect(html).not.toMatch(/style="/);
  expect(violations).toEqual([]);
});

test("the time-zone note shows only when the viewer's zone differs (design.md 8.3)", async ({
  browser,
}) => {
  for (const [zone, shown] of [
    ["Asia/Ho_Chi_Minh", true],
    ["Europe/London", false],
  ] as const) {
    const context = await browser.newContext({ timezoneId: zone });
    const page = await context.newPage();
    await page.goto("/");
    await signIn(page, "Staff");
    await openSchedule(page);
    await expect(page.getByText("Times are in London time.")).toHaveCount(
      shown ? 1 : 0,
    );
    await context.close();
  }
});

test("stored text is shown as text on the schedule and the appointment page (SEC-11.AC-2)", async ({
  page,
}) => {
  const hostile = [
    '<img src=x onerror="window.__xss=1">',
    '"><script>window.__xss=1</script>',
  ];
  await page.clock.setFixedTime(new Date("2026-10-26T07:00:00Z"));
  await openApp(page);
  const ids: string[] = [];
  for (const [i, text] of hostile.entries()) {
    // The plate's own pattern refuses markup, so the name, make and model carry it.
    ids.push(
      await book(page, {
        date: TODAY,
        time: i === 0 ? "09:00" : "11:00",
        technicianId: "tech-lon-birch",
        name: text,
        make: text,
        model: text,
      }),
    );
  }
  await page.clock.setFixedTime(new Date("2026-10-28T07:00:00Z"));
  await signIn(page, "Staff");
  const check = async (texts = hostile) => {
    for (const text of texts)
      await expect(page.getByText(text).first()).toBeAttached();
    expect(await page.locator("main img, main script").count()).toBe(0);
    expect(
      await page.evaluate(() => (window as { __xss?: number }).__xss),
    ).toBeUndefined();
  };
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSchedule(page);
  await timeline(page).getByRole("button").first().click();
  await check();
  await openSchedule(page, "?view=list");
  await check();
  await page.goto(`/appointments/${ids[0]}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await check([hostile[0]!]);
});

/** A very busy day, as the API would send it: 10 technicians, 60 appointments (S7 data size). */
function busyDay() {
  const at = (h: number, m = 0) =>
    `2026-10-28T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`;
  const technicians = Array.from({ length: 10 }, (_, i) => ({
    id: `t${i}`,
    name: i === 0 ? "Bartholomew Wojciechowski" : `Test Technician ${i + 1}`,
    skills: ["mechanic"],
    onLeave: false,
    shift: { start: at(8), end: at(17, 30) },
    break: { start: at(12, 30), end: at(13) },
    free: [],
  }));
  const appointments = technicians
    .flatMap((t, i) =>
      [8, 9, 10, 11, 14, 15].map((h, j) => ({
        id: `a-${i}-${j}`,
        dealershipId: LONDON,
        timeZone: "Europe/London",
        customerId: "c",
        vehicleId: "v",
        serviceTypeId: "s",
        technicianId: t.id,
        serviceBayId: `b${i % 6}`,
        courtesyCarId: null,
        transport: "drop_off",
        start: at(h),
        end: at(h, 45),
        status: "confirmed",
        flags: [],
        version: 1,
        createdAt: at(7),
        updatedAt: at(7),
        cancelledAt: null,
        display: {
          serviceTypeName: "Oil and filter change",
          vehicle: {
            make: "Ford",
            model: "Focus",
            registration: `AB${i}${j} CDE`,
          },
          technicianName: t.name,
          serviceBayName: `Bay ${(i % 6) + 1}`,
          customerName: "Test Customer",
        },
      })),
    )
    .sort((a, b) => a.start.localeCompare(b.start));
  return {
    date: TODAY,
    timeZone: "Europe/London",
    opening: { start: at(8), end: at(18) },
    nextOpenDate: "2026-10-29",
    technicians,
    serviceBays: Array.from({ length: 6 }, (_, i) => ({
      id: `b${i}`,
      dealershipId: LONDON,
      name: `Bay ${i + 1}`,
      active: true,
    })),
    appointments,
  };
}

for (const width of widths) {
  test(`a 60-appointment day at ${width} wide: no sideways page scroll, 44px targets, the box scrolls on its own`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.setFixedTime(new Date("2026-10-28T10:40:00Z"));
    await interceptApi(page, {
      path: "/schedule",
      status: 200,
      body: busyDay(),
    });
    await page.goto("/");
    await signIn(page, "Staff");
    await openSchedule(page);
    await expect(page.getByText(/^60 appointments, 0 flagged/)).toBeVisible();
    await expectNoSidewaysScroll(page);
    if (width >= 1024) {
      await expect(timeline(page).getByRole("group")).toHaveCount(10);
      await expect(timeline(page)).toHaveAttribute("tabindex", "0");
      // The page grows downward to hold the rows.
      expect(
        await page.evaluate(() => document.documentElement.scrollHeight),
      ).toBeGreaterThan(900);
    }
    const small = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          "main button, main a[href], main select",
        ),
      ]
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return (
            r.width > 0 && r.height > 0 && (r.width < 43.5 || r.height < 43.5)
          );
        })
        .map((e) => e.getAttribute("aria-label") ?? e.textContent),
    );
    expect(small).toEqual([]);
    for (const view of width >= 1024 ? ["list"] : ["technician"]) {
      await openSchedule(page, `?view=${view}`);
      await expectNoSidewaysScroll(page);
    }
  });
}

test("video of the main flow: open the day, Technicians and Bays, List, select a block, open the appointment", async ({
  browser,
}) => {
  const dir = `${evidence}/video`;
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();
  await seedBusyDay(page);
  await signIn(page, "Staff");
  await openSchedule(page);
  const pause = () => page.waitForTimeout(900);
  await pause();
  await page
    .getByRole("group", { name: "Rows" })
    .getByRole("button", { name: "Bays" })
    .click();
  await pause();
  await page
    .getByRole("group", { name: "Rows" })
    .getByRole("button", { name: "Technicians" })
    .click();
  await pause();
  await page
    .getByRole("group", { name: "View" })
    .getByRole("button", { name: "List" })
    .click();
  await pause();
  await page
    .getByRole("group", { name: "View" })
    .getByRole("button", { name: "Timeline" })
    .click();
  await pause();
  await timeline(page)
    .getByRole("button", { name: /^09:15 to 12:15/ })
    .click();
  await pause();
  await page.getByRole("link", { name: "Open appointment" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Wed 28 Oct, 09:15 to 12:15" }),
  ).toBeVisible();
  await pause();
  const video = page.video()!;
  await context.close();
  await video.saveAs(`${dir}/staff-schedule-flow.webm`);
  await video.delete();
});
