// The browser's Back button is caught like a link (D-0001-75): with unsaved changes it opens "Leave without saving?",
// Keep editing stays with the edits, Leave goes back; with no changes Back leaves at once. At 390 and 1440 wide.
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { day, openAs } from "./manage-support";

const MANAGER = "user-manager-london";
const evidence = process.env["EVIDENCE_DIR"];

const screens = [
  {
    name: "settings",
    link: "Settings",
    url: /\/manage\/dealership$/,
    ready: (page: Page) => day(page, "Saturday"),
    edit: (page: Page) => day(page, "Saturday").getByLabel("Closes"),
    changed: "15:00",
  },
  {
    name: "shifts",
    link: "Shifts",
    url: /\/manage\/shifts$/,
    ready: (page: Page) => day(page, "Saturday"),
    edit: (page: Page) =>
      day(page, "Monday").getByLabel("Ends", { exact: true }),
    changed: "16:00",
  },
];

const back = (page: Page) => page.evaluate(() => window.history.back());

for (const width of [390, 1440] as const) {
  for (const screen of screens) {
    test(`at ${width} wide, Back on ${screen.name} leaves at once when nothing changed, and asks first when something did`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width < 640 ? 844 : 900 });
      await openAs(page, MANAGER, "/manage/outbox");
      await page
        .getByRole("navigation", { name: "Main" })
        .getByRole("link", { name: screen.link })
        .click();
      await expect(page).toHaveURL(screen.url);
      await expect(screen.ready(page)).toBeVisible();

      // No changes: Back leaves at once, no question.
      await back(page);
      await expect(page).toHaveURL(/\/manage\/outbox$/);
      await expect(
        page.getByRole("dialog", { name: "Leave without saving?" }),
      ).toBeHidden();
      await page.evaluate(() => window.history.forward());
      await expect(page).toHaveURL(screen.url);
      await expect(screen.ready(page)).toBeVisible();

      // Changes: Back asks; Keep editing stays with the edit.
      const field = screen.edit(page);
      await field.fill(screen.changed);
      await page.waitForTimeout(500);
      await back(page);
      const dialog = page.getByRole("dialog", {
        name: "Leave without saving?",
      });
      await expect(dialog).toBeVisible();
      await expect(page).toHaveURL(screen.url);
      if (evidence && screen.name === "settings") {
        await page.screenshot({
          path: path.join(
            evidence,
            `dealership-settings-back-dialog-${width}.png`,
          ),
          fullPage: true,
        });
      }
      await page.waitForTimeout(1200);
      await dialog.getByRole("button", { name: "Keep editing" }).click();
      await expect(dialog).toBeHidden();
      await expect(page).toHaveURL(screen.url);
      await expect(field).toHaveValue(screen.changed);
      await page.waitForTimeout(800);

      // Back again, then Leave goes back.
      await back(page);
      await expect(dialog).toBeVisible();
      await page.waitForTimeout(1200);
      await dialog
        .getByRole("button", { name: "Leave without saving" })
        .click();
      await expect(page).toHaveURL(/\/manage\/outbox$/);
      await page.waitForTimeout(800);
    });
  }
}
