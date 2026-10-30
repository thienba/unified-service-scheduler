// The themed Select, DatePicker and TimeField on real screens (D-0001-131, 132, 133; design.md 8.27 to 8.30):
// each one open and closed at 390 and 1440 with axe, 44 px rows and days, no sideways scroll (also at 320), the
// popover from 640 wide and the bottom sheet below, keys only, and focus back on the control when it closes.
// With EVIDENCE_DIR set, each open control is saved as a screenshot there; with VIDEO_DIR set, the last test
// records a booking made with the keyboard only.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { BIRCH, book, start } from "./adjust-support";
import {
  expectNoAxeViolations,
  expectNoSidewaysScroll,
  openApp,
  pickRole,
  selectNamed,
} from "./support";

const DEEP = "/book?dealership=dealership-london&service=service-full";

async function check(page: Page, name?: string) {
  await expectNoSidewaysScroll(page);
  await expectNoAxeViolations(page);
  const dir = process.env["EVIDENCE_DIR"];
  if (!dir || !name) return;
  mkdirSync(path.join(dir, "shots"), { recursive: true });
  const width = page.viewportSize()?.width ?? 0;
  await page.screenshot({
    path: path.join(dir, "shots", `${name}-${width}.png`),
  });
}

/** Every row of the open list, or every day of the open calendar, is at least 44 by 44 px. */
async function expectTargets(targets: Locator) {
  const boxes = await targets.evaluateAll((els) =>
    els
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => [r.width, r.height]),
  );
  expect(boxes.length).toBeGreaterThan(0);
  for (const [w, h] of boxes) {
    expect(w).toBeGreaterThanOrEqual(43.5);
    expect(h).toBeGreaterThanOrEqual(43.5);
  }
}

/**
 * Below 640 the popup is the bottom sheet: full width, on the bottom edge, titled with the label, with a Close
 * button. From 640 it is a popover, so there is no sheet. `name` is the dialog's name when it differs.
 */
async function expectPopup(page: Page, title: string, name = title) {
  const width = page.viewportSize()?.width ?? 0;
  const sheets = page.locator(".ctl-sheet");
  if (width >= 640) {
    await expect(sheets).toHaveCount(0);
    return;
  }
  const dialog = page.getByRole("dialog", { name, exact: true });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close" })).toBeVisible();
  // Once it has slid up (240 ms): the whole width, resting on the bottom edge, at most 90% high.
  await expect
    .poll(async () => {
      // No box yet while the sheet is still being drawn: keep waiting rather than fail.
      const box = await sheets.first().boundingBox();
      if (!box) return null;
      return [
        Math.round(box.width),
        Math.round(box.y + box.height),
        box.height <= page.viewportSize()!.height * 0.9 + 1,
      ];
    })
    .toEqual([width, page.viewportSize()!.height, true]);
}

const focused = (target: Locator) =>
  expect
    .poll(() => target.evaluate((el) => el === document.activeElement))
    .toBe(true);

async function openAdjust(page: Page) {
  await start(page);
  const id = await book(page, {
    date: "2026-10-30",
    time: "09:15",
    technicianId: BIRCH,
    serviceTypeId: "service-full",
    name: "Marta Kowalska",
    make: "Vauxhall",
    model: "Corsa",
    registration: "CD34 FGH",
  });
  await page.goto(`/appointments/${id}/adjust`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Adjust appointment" }),
  ).toBeVisible();
}

for (const width of [390, 1440] as const) {
  test.describe(`at ${width} wide`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: width < 640 ? 844 : 900 });
    });

    test("Select (book, Car): closed and open pass axe, rows are 44 px, Esc closes and focus returns", async ({
      page,
    }) => {
      await page.clock.setFixedTime(new Date("2026-10-28T10:40:00Z"));
      await openApp(page);
      await pickRole(page, "Customer");
      await page.goto(DEEP);
      const car = selectNamed(page, "Car (required)");
      await expect(car).toHaveText("Choose a car");
      await expect(car).toHaveAttribute("aria-haspopup", "listbox");
      await check(page);
      await car.click();
      await expect(car).toHaveAttribute("aria-expanded", "true");
      const list = page.getByRole("listbox", { name: /^Car/ });
      await expect(list).toBeVisible();
      await expectPopup(page, "Car");
      await expectTargets(list.getByRole("option"));
      await check(page, "select-book-car-open");
      await page.keyboard.press("Escape");
      await expect(list).toHaveCount(0);
      await focused(car);
    });

    test("DatePicker (adjust, Date): the calendar crosses out days outside the limits and hatches closed days; the edge is even", async ({
      page,
    }) => {
      await openAdjust(page);
      const date = page.getByRole("group", { name: "Date", exact: true });
      await expect(date.getByRole("spinbutton")).toHaveText([
        "30",
        "10",
        "2026",
      ]);
      await check(page);
      const button = date.getByRole("button", { name: /^Calendar/ });
      await button.click();
      const grid = page.getByRole("grid", { name: /October 2026/ });
      await expect(grid).toBeVisible();
      await expectPopup(page, "Date");
      // Before today (27 Oct) is not offered; a Sunday the dealership is closed (1 Nov) is hatched.
      const cell = (label: RegExp) =>
        page.getByRole("button", { name: label, includeHidden: true });
      await expect(cell(/27 October 2026/)).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await expect(
        page.getByText(/^Crossed-out days cannot be chosen: bookings need/),
      ).toBeVisible();
      await expectTargets(grid.locator(".cd:not([data-outside-month])"));
      // design.md 8.29 (D-0001-134): in the open state the button sits inside the 2px edge.
      const margins = await button.evaluate((b) => {
        const s = getComputedStyle(b);
        return [s.marginTop, s.marginBottom, s.marginRight];
      });
      expect(margins).toEqual(["1px", "1px", "1px"]);
      await check(page, "datepicker-adjust-date-open");
      await page.getByRole("button", { name: "Next month" }).click();
      await expect(
        page.getByRole("grid", { name: /November 2026/ }),
      ).toBeVisible();
      // Linux WebKit names the day without the comma ("Sunday 1 November 2026").
      await expect(cell(/Sunday,? 1 November 2026/)).toHaveAttribute(
        "data-unavailable",
        "true",
      );
      await expect(cell(/28 November 2026/)).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await expect(
        page.getByRole("button", { name: "Next month" }),
      ).toBeDisabled();
      await page.keyboard.press("Escape");
      await expect(grid).toHaveCount(0);
    });

    test("TimeField (adjust, Start time): 96 quarter hours on a 24-hour clock, opened with the chosen time in view", async ({
      page,
    }) => {
      await openAdjust(page);
      const time = selectNamed(page, "Start time");
      await expect(time).toHaveText("09:15");
      await time.click();
      const list = page.getByRole("listbox", { name: /^Start time/ });
      await expect(list).toBeVisible();
      await expectPopup(page, "Start time");
      const options = list.getByRole("option");
      await expect(options).toHaveCount(96);
      const labels = await options.allTextContents();
      expect(
        labels.every((t) => /^([01]\d|2[0-3]):(00|15|30|45)$/.test(t)),
      ).toBe(true);
      // The chosen time is in view, with rows above it.
      const chosen = list.locator('[data-value="09:15"]');
      await expect(chosen).toHaveAttribute("aria-selected", "true");
      await expect(chosen).toBeInViewport();
      const [listBox, rowBox] = [
        (await list.boundingBox())!,
        (await chosen.boundingBox())!,
      ];
      expect(rowBox.y - listBox.y).toBeGreaterThanOrEqual(rowBox.height * 2);
      // Times outside the day's opening hours (Fri 08:00 to 18:00) are crossed out, with the reason once.
      await expect(list.locator('[data-value="07:45"]')).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      // A 3-hour job must also end by closing time, so the last start is 15:00 (review finding 4).
      await expect(list.locator('[data-value="15:00"]')).not.toHaveAttribute(
        "aria-disabled",
        "true",
      );
      for (const late of ["15:15", "17:45"]) {
        await expect(list.locator(`[data-value="${late}"]`)).toHaveAttribute(
          "aria-disabled",
          "true",
        );
      }
      await expect(
        page.getByText(
          "The dealership is closed then (opens 08:00, closes 18:00). This job takes 3 hours, so it must start by 15:00.",
          { exact: true },
        ),
      ).toBeVisible();
      await expectTargets(options);
      await check(page, "timefield-adjust-start-open");
      await page.keyboard.press("Escape");
      await focused(time);
    });

    test("the schedule's day button opens the same calendar; a day is chosen and focus returns", async ({
      page,
    }) => {
      await page.clock.setFixedTime(new Date("2026-10-28T10:40:00Z"));
      await openApp(page);
      await pickRole(page, "Manager");
      await page.goto("/schedule");
      const day = page.getByRole("button", {
        name: "Choose a date. Showing Wed 28 Oct",
      });
      await expect(day).toBeVisible();
      await day.click();
      await expect(
        page.getByRole("grid", { name: /October 2026/ }),
      ).toBeVisible();
      await expectPopup(page, "Date", "Choose a date");
      await check(page, "calendar-schedule-day-open");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/date=2026-10-29/);
      await focused(
        page.getByRole("button", { name: "Choose a date. Showing Thu 29 Oct" }),
      );
    });

    test("the Who picker in the header (staff) and the dealership picker open their lists", async ({
      page,
    }) => {
      test.skip(width < 640, "On a phone, Who sits in the Viewing as sheet");
      await page.clock.setFixedTime(new Date("2026-10-28T10:40:00Z"));
      await openApp(page);
      await pickRole(page, "Staff");
      const who = selectNamed(page, "Who");
      await who.click();
      await expect(page.getByRole("listbox", { name: /^Who/ })).toBeVisible();
      await check(page, "select-header-who-open");
      await page.keyboard.press("Escape");
      await focused(who);
    });
  });
}

/** The open list's left edge and width match its control's, within 1 px (D-0001-140). */
async function expectListAsWide(page: Page, control: Locator) {
  const pop = page.locator(".ctl-pop.is-list");
  await expect(pop).toBeVisible();
  const [a, b] = [(await control.boundingBox())!, (await pop.boundingBox())!];
  expect(Math.abs(b.x - a.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(b.width - a.width)).toBeLessThanOrEqual(1);
}

for (const width of [768, 1440]) {
  test(`at ${width} wide an open list is exactly as wide as its control, wide or narrow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.setFixedTime(new Date("2026-10-28T10:40:00Z"));
    await openApp(page);
    await pickRole(page, "Customer");
    await page.goto("/book");
    const dealership = selectNamed(page, "Dealership (required)");
    await dealership.click();
    await expectListAsWide(page, dealership);
    await check(page, "select-book-dealership-open");
    await page.keyboard.press("Escape");
    await pickRole(page, "Staff");
    const who = selectNamed(page, "Who");
    await who.click();
    await expectListAsWide(page, who);
  });
}

test("at 320 wide every popup is a sheet that fits: the calendar keeps 44 px days, nothing scrolls sideways", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await openAdjust(page);
  await page
    .getByRole("group", { name: "Date", exact: true })
    .getByRole("button", { name: /^Calendar/ })
    .click();
  await expectPopup(page, "Date");
  await expectTargets(
    page.getByRole("grid").locator(".cd:not([data-outside-month])"),
  );
  await check(page);
  await page.keyboard.press("Escape");
  await selectNamed(page, "Technician").click();
  await expectPopup(page, "Technician");
  await expectTargets(page.getByRole("listbox").getByRole("option"));
  await check(page);
});

test("keys only: Select, TimeField and DatePicker open, move, choose and close, and focus goes back", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openAdjust(page);

  // TimeField: Down arrow opens on the chosen time; typing the four digits jumps to a time; Enter chooses.
  const time = selectNamed(page, "Start time");
  await time.focus();
  await page.keyboard.press("ArrowDown");
  const times = page.getByRole("listbox", { name: /^Start time/ });
  await expect(times).toBeVisible();
  await focused(times.locator('[data-value="09:15"]'));
  await page.keyboard.press("ArrowDown");
  await focused(times.locator('[data-value="09:30"]'));
  await page.keyboard.type("1045");
  await focused(times.locator('[data-value="10:45"]'));
  await page.keyboard.press("Enter");
  await expect(times).toHaveCount(0);
  await expect(time).toHaveAttribute("data-value", "10:45");
  await focused(time);

  // Select: Enter opens, Down arrow moves, Home and End go to the ends, Esc leaves it unchanged.
  const tech = selectNamed(page, "Technician");
  await tech.focus();
  await page.keyboard.press("Enter");
  const techs = page.getByRole("listbox", { name: /^Technician/ });
  await expect(techs).toBeVisible();
  await page.keyboard.press("End");
  await page.keyboard.press("Home");
  await focused(techs.getByRole("option").first());
  await page.keyboard.press("Escape");
  await expect(techs).toHaveCount(0);
  await expect(tech).toHaveAttribute("data-value", "");
  await focused(tech);
  await page.keyboard.press("ArrowDown");
  await expect(techs).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(tech).not.toHaveAttribute("data-value", "");

  // DatePicker: segments take digits; Alt + Down arrow opens the calendar on the chosen day; the arrows and
  // Page Down move; Enter chooses and closes.
  const date = page.getByRole("group", { name: "Date", exact: true });
  const dayPart = date.getByRole("spinbutton").first();
  await dayPart.focus();
  await page.keyboard.type("02112026");
  await expect(date.getByRole("spinbutton")).toHaveText(["02", "11", "2026"]);
  await expect(page.getByText("Mon 2 Nov", { exact: true })).toBeVisible();
  await dayPart.focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect(page.getByRole("grid", { name: /November 2026/ })).toBeVisible();
  const active = () =>
    page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  await expect.poll(active).toMatch(/2 November 2026/);
  await page.keyboard.press("ArrowRight");
  await expect.poll(active).toMatch(/3 November 2026/);
  // Page Up and Page Down go a month, and stop at the limits: 3 Oct is before the first day (28 Oct), and
  // 28 Nov after the last (27 Nov).
  await page.keyboard.press("PageUp");
  await expect.poll(active).toMatch(/28 October 2026/);
  await page.keyboard.press("PageDown");
  await expect.poll(active).toMatch(/27 November 2026/);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("grid")).toHaveCount(0);
  await expect(date.getByRole("spinbutton")).toHaveText(["27", "11", "2026"]);
});

test("video: a booking made with the keyboard only, through the themed Select controls", async ({
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
  const page = await context.newPage();
  const beat = () => page.waitForTimeout(700);
  await page.clock.setFixedTime(new Date("2026-10-28T10:40:00Z"));
  await openApp(page);
  await pickRole(page, "Customer");
  await page.goto("/book");
  await expect(
    page.getByRole("heading", { level: 1, name: "Book a service" }),
  ).toBeVisible();
  await beat();
  const tabTo = async (target: Locator) => {
    for (let i = 0; i < 40; i += 1) {
      await page.keyboard.press("Tab");
      if (await target.evaluate((el) => el === document.activeElement)) return;
    }
    throw new Error(`Not reached by Tab: ${String(target)}`);
  };
  // Dealership: Tab to it, Down arrow opens the list, Enter chooses.
  const dealership = selectNamed(page, "Dealership (required)");
  await tabTo(dealership);
  await beat();
  await page.keyboard.press("ArrowDown");
  await beat();
  await page.keyboard.press("Enter");
  await expect(dealership).not.toHaveAttribute("data-value", "");
  await beat();
  // Car: Space opens the list, Down arrow moves, Enter chooses.
  const car = selectNamed(page, "Car (required)");
  await tabTo(car);
  await page.keyboard.press("Space");
  await beat();
  await page.keyboard.press("ArrowDown");
  await beat();
  await page.keyboard.press("Enter");
  await expect(car).not.toHaveAttribute("data-value", "");
  await beat();
  // Service: typing on the closed control picks by its first letters, then the list confirms it.
  const service = selectNamed(page, "Service (required)");
  await tabTo(service);
  await page.keyboard.press("ArrowDown");
  await beat();
  await page.keyboard.type("Full");
  await beat();
  await page.keyboard.press("Enter");
  await expect(service).toContainText("Full service");
  await beat();
  // The day strip and the times are radio groups: Tab in, arrows move, Space chooses.
  const friday = page.getByRole("radio", { name: /^Fri 30 Oct,/ });
  await tabTo(page.getByRole("radio", { checked: true }).first());
  for (let i = 0; i < 2; i += 1) {
    await page.keyboard.press("ArrowRight");
    await beat();
  }
  await expect(friday).toBeChecked();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Space");
  await beat();
  const wait = page.getByRole("radio", { name: "Wait on site" });
  await tabTo(wait);
  await page.keyboard.press("Space");
  await expect(wait).toBeChecked();
  await beat();
  const confirm = page
    .getByRole("button", { name: "Confirm booking" })
    .filter({ visible: true })
    .first();
  await tabTo(confirm);
  await beat();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { level: 1, name: "You are booked" }),
  ).toBeVisible();
  await page.waitForTimeout(2000);
  const video = page.video();
  await context.close();
  await video?.saveAs(path.join(dir!, "keyboard-booking-themed-controls.webm"));
  await video?.delete();
});

// A mouse opens a list on press. On a phone-width screen the sheet rises under the pointer, and the release must
// not choose the row that is there.
test("at 390 wide a press held on a time control opens the sheet, and the release chooses nothing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openAdjust(page);
  const time = selectNamed(page, "Start time");
  await time.scrollIntoViewIfNeeded();
  const box = (await time.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const list = page.getByRole("listbox", { name: /^Start time/ });
  await expect(list).toBeVisible();
  await page.waitForTimeout(400);
  await page.mouse.up();
  await page.waitForTimeout(300);
  await expect(list).toBeVisible();
  await expect(time).toHaveText("09:15");
  // The sheet answers the pointer again: a press on a row chooses it.
  await list.locator('[data-value="10:00"]').click();
  await expect(list).toHaveCount(0);
  await expect(time).toHaveText("10:00");
});
