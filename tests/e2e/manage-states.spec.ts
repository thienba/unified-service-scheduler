// Every state of `dealership-settings` and `shifts` reached by real use at 390 and 1440 wide, each checked with
// axe-core and for sideways scroll (NFR-4, NFR-7), and the layout at five widths. With EVIDENCE_DIR set, each
// state is also saved as `<screen>-<state>-<width>.png` there (D-0000-13).
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  expectNoAxeViolations,
  expectNoSidewaysScroll,
  interceptApi,
  problemBody,
  widths,
} from "./support";
import {
  LONDON,
  SAIGON,
  book,
  day,
  instant,
  next,
  openAs,
  today,
} from "./manage-support";

const MANAGER = "user-manager-london";
const evidence = process.env["EVIDENCE_DIR"];

async function shot(page: Page, name: string) {
  await expectNoAxeViolations(page);
  await expectNoSidewaysScroll(page);
  if (evidence) {
    const width = page.viewportSize()!.width;
    await page.screenshot({
      path: path.join(evidence, `${name}-${width}.png`),
      fullPage: true,
    });
  }
}

const settingsSave = (page: Page) =>
  page.getByRole("button", { name: "Save settings" }).first();
const shiftsSave = (page: Page) =>
  page.getByRole("button", { name: "Save shifts" }).first();

for (const width of [390, 1440] as const) {
  test.describe(`at ${width} wide`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: width < 640 ? 844 : 900 });
    });

    test("settings: idle, dirty, validation, checking, confirm-flags, saving, saved-with-flags", async ({
      page,
    }) => {
      await interceptApi(page, { path: "/settings", delayMs: 3000 });
      await openAs(page, MANAGER, "/manage/dealership");
      await expect(day(page, "Saturday")).toBeVisible();
      const saturday = next(6);
      await book(page, "a", instant(saturday, "14:30"));
      await book(page, "b", instant(saturday, "15:00"));
      await shot(page, "dealership-settings-idle");

      await day(page, "Saturday").getByLabel("Closes").fill("14:00");
      await shot(page, "dealership-settings-dirty");

      await day(page, "Monday").getByLabel("Closes").fill("07:00");
      await day(page, "Tuesday").getByLabel("Opens").fill("08:10");
      await page.getByLabel("Shortest notice (hours)").fill("80");
      await page.getByLabel("Furthest ahead (days)").fill("0");
      await settingsSave(page).click();
      await expect(
        page.getByText("4 things need fixing before we can save."),
      ).toBeVisible();
      await shot(page, "dealership-settings-validation");

      await day(page, "Monday").getByLabel("Closes").fill("18:00");
      await day(page, "Tuesday").getByLabel("Opens").fill("08:00");
      await page.getByLabel("Shortest notice (hours)").fill("2");
      await page.getByLabel("Furthest ahead (days)").fill("30");
      await settingsSave(page).click();
      await expect(
        page
          .getByText(/^Checking/)
          .filter({ visible: true })
          .first(),
      ).toBeVisible();
      await shot(page, "dealership-settings-checking");

      const dialog = page.getByRole("dialog", {
        name: "Saving will flag 2 bookings",
      });
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      await shot(page, "dealership-settings-confirm-flags");

      await dialog
        .getByRole("button", { name: "Save and flag 2 bookings" })
        .click();
      await expect(dialog.getByText("Saving…")).toBeVisible();
      await shot(page, "dealership-settings-saving");

      await expect(
        page.getByRole("heading", { name: "Saved. 2 bookings no longer fit." }),
      ).toBeVisible({ timeout: 10_000 });
      await shot(page, "dealership-settings-saved-with-flags");
    });

    test("settings: saved, leave-dialog, save-error", async ({ page }) => {
      await openAs(page, MANAGER, "/manage/dealership");
      await page.getByLabel("Furthest ahead (days)").fill("40");
      await settingsSave(page).click();
      await expect(
        page.getByRole("heading", { name: "Settings saved" }),
      ).toBeVisible();
      await shot(page, "dealership-settings-saved");

      await page.getByLabel("Furthest ahead (days)").fill("45");
      // The footer link: on a phone the action bar takes the place of the tab bar.
      await page.getByRole("link", { name: "Dev panel" }).click();
      await expect(
        page.getByRole("dialog", { name: "Leave without saving?" }),
      ).toBeVisible();
      await shot(page, "dealership-settings-leave-dialog");
    });

    test("settings: save-error", async ({ page }) => {
      await interceptApi(page, {
        path: "/settings",
        status: 500,
        body: problemBody(500, "INTERNAL"),
      });
      await openAs(page, MANAGER, "/manage/dealership");
      await page.getByLabel("Furthest ahead (days)").fill("40");
      await settingsSave(page).click();
      await expect(
        page.getByRole("heading", { name: "Your changes were not saved" }),
      ).toBeVisible();
      await shot(page, "dealership-settings-save-error");
    });

    test("settings: loading", async ({ page }) => {
      await interceptApi(page, {
        path: `/dealerships/${LONDON}`,
        delayMs: 5000,
      });
      await openAs(page, MANAGER, "/manage/dealership");
      await expect(
        page.getByRole("status").filter({ hasText: "Loading the settings" }),
      ).toBeAttached();
      await shot(page, "dealership-settings-loading");
    });

    test("settings: error", async ({ page }) => {
      await interceptApi(page, {
        path: `/dealerships/${LONDON}`,
        status: 500,
        body: problemBody(500, "INTERNAL"),
      });
      await openAs(page, MANAGER, "/manage/dealership");
      await expect(
        page.getByRole("heading", {
          name: "Something went wrong on our side.",
        }),
      ).toBeVisible();
      await shot(page, "dealership-settings-error");
    });

    test("settings and shifts: no-permission, no-permission-dealership, not-found, empty", async ({
      page,
    }) => {
      await openAs(page, "user-staff-london", "/manage/dealership");
      await expect(
        page.getByRole("heading", { name: "You cannot do that as Staff." }),
      ).toBeVisible();
      await shot(page, "dealership-settings-no-permission");
      await page.goto("/manage/shifts");
      await expect(
        page.getByText("Only the garage manager can change shifts.", {
          exact: false,
        }),
      ).toBeVisible();
      await shot(page, "shifts-no-permission");

      await openAs(page, MANAGER, `/manage/dealership?dealership=${SAIGON}`);
      await expect(
        page.getByRole("heading", {
          name: "You do not manage this dealership.",
        }),
      ).toBeVisible();
      await shot(page, "dealership-settings-no-permission-dealership");

      await page.goto("/manage/shifts?technicianId=tech-sgn-an");
      await expect(
        page.getByRole("heading", { name: "We cannot find that technician." }),
      ).toBeVisible();
      await shot(page, "shifts-not-found");
    });

    test("shifts: empty", async ({ page }) => {
      await interceptApi(page, { path: "/technicians", status: 200, body: [] });
      await openAs(page, MANAGER, "/manage/shifts");
      await expect(
        page.getByRole("heading", { name: "No technicians yet" }),
      ).toBeVisible();
      await shot(page, "shifts-empty");
    });

    test("shifts: idle, dirty, validation, checking, confirm-flags, saving, saved-with-flags", async ({
      page,
    }) => {
      await interceptApi(page, { path: "/shifts", delayMs: 3000 });
      await openAs(page, MANAGER, "/manage/shifts");
      const monday = next(1);
      const booked = await book(page, "a", instant(monday, "10:00"));
      await page.goto(`/manage/shifts?technicianId=${booked.technicianId}`);
      await expect(day(page, "Saturday")).toBeVisible();
      await shot(page, "shifts-idle");

      await day(page, "Monday")
        .getByLabel("Ends", { exact: true })
        .fill("16:00");
      await shot(page, "shifts-dirty");

      await day(page, "Tuesday")
        .getByLabel("Ends", { exact: true })
        .fill("07:00");
      await page.getByLabel("First day").fill(monday);
      await page.getByLabel("Last day (optional)").fill(today());
      await shiftsSave(page).click();
      await expect(page.getByText(/things? needs? fixing/)).toBeVisible();
      await shot(page, "shifts-validation");

      // Start again from the saved shifts, then add the leave.
      await page.reload();
      await expect(day(page, "Saturday")).toBeVisible();
      await page.getByLabel("First day").fill(monday);
      await page.getByRole("button", { name: "Add to the list" }).click();
      await shiftsSave(page).click();
      await expect(
        page
          .getByText(/^Checking/)
          .filter({ visible: true })
          .first(),
      ).toBeVisible();
      await shot(page, "shifts-checking");

      const dialog = page.getByRole("dialog", {
        name: "Saving will flag 1 booking",
      });
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      await shot(page, "shifts-confirm-flags");
      await dialog
        .getByRole("button", { name: "Save and flag 1 booking" })
        .click();
      await expect(dialog.getByText("Saving…")).toBeVisible();
      await shot(page, "shifts-saving");
      await expect(
        page.getByRole("heading", { name: "Saved. 1 booking no longer fits." }),
      ).toBeVisible({ timeout: 10_000 });
      await shot(page, "shifts-saved-with-flags");
    });

    test("shifts: saved, leave-dialog", async ({ page }) => {
      await openAs(page, MANAGER, "/manage/shifts");
      await expect(day(page, "Saturday")).toBeVisible();
      await page.getByLabel("First day").fill(next(2, today(), 7));
      await page.getByRole("button", { name: "Add to the list" }).click();
      await shiftsSave(page).click();
      await expect(
        page.getByRole("heading", { name: "Shifts saved" }),
      ).toBeVisible();
      await shot(page, "shifts-saved");

      await day(page, "Monday")
        .getByLabel("Ends", { exact: true })
        .fill("16:00");
      // The footer link: on a phone the action bar takes the place of the tab bar.
      await page.getByRole("link", { name: "Dev panel" }).click();
      await expect(
        page.getByRole("dialog", { name: "Leave without saving?" }),
      ).toBeVisible();
      await shot(page, "shifts-leave-dialog");
    });

    test("shifts: save-error", async ({ page }) => {
      await interceptApi(page, { path: "/shifts", networkError: true });
      await openAs(page, MANAGER, "/manage/shifts");
      await expect(day(page, "Saturday")).toBeVisible();
      await day(page, "Monday")
        .getByLabel("Ends", { exact: true })
        .fill("16:00");
      await shiftsSave(page).click();
      await expect(
        page.getByRole("heading", { name: "Your changes were not saved" }),
      ).toBeVisible();
      await shot(page, "shifts-save-error");
    });

    test("shifts: loading", async ({ page }) => {
      await interceptApi(page, { path: "/technicians", delayMs: 5000 });
      await openAs(page, MANAGER, "/manage/shifts");
      await expect(
        page.getByRole("status").filter({ hasText: "Loading the shifts" }),
      ).toBeAttached();
      await shot(page, "shifts-loading");
    });

    test("shifts: error", async ({ page }) => {
      await interceptApi(page, {
        path: "/technicians",
        status: 500,
        body: problemBody(500, "INTERNAL"),
      });
      await openAs(page, MANAGER, "/manage/shifts");
      await expect(
        page.getByRole("heading", {
          name: "Something went wrong on our side.",
        }),
      ).toBeVisible();
      await shot(page, "shifts-error");
    });
  });
}

test("at every width: no sideways scroll; rows stack on a phone, two per line from 640, one line per weekday from 1024; the form is at most 60rem", async ({
  page,
}) => {
  for (const screen of ["/manage/dealership", "/manage/shifts"]) {
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await openAs(page, MANAGER, screen);
      await expect(day(page, "Monday")).toBeVisible();
      await expectNoSidewaysScroll(page);
      const inputs = day(page, "Monday").locator('input[type="time"]');
      const tops = await inputs.evaluateAll((els) =>
        els.map((e) => {
          // The top of the field's cell in the row (a long label can push its input lower in the same line).
          let cell: Element = e;
          while (
            cell.parentElement &&
            cell.parentElement.getAttribute("role") !== "group"
          )
            cell = cell.parentElement;
          return Math.round(cell.getBoundingClientRect().top);
        }),
      );
      const lines = new Set(tops).size;
      const shift = screen.endsWith("shifts");
      // design.md 8.23: two fields per line on a phone, four on one line from 640, one line per weekday from 1024.
      expect(lines, `${screen} at ${width}`).toBe(width < 640 && shift ? 2 : 1);
      // Each field is at least 44 px tall.
      const heights = await inputs.evaluateAll((els) =>
        els.map((e) => e.getBoundingClientRect().height),
      );
      expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
      const form = page.locator("main form");
      const formWidth = await form.evaluate(
        (e) => e.parentElement!.getBoundingClientRect().width,
      );
      expect(formWidth).toBeLessThanOrEqual(960);
    }
  }
});
