// The manager's main flow in one go, at a pace a person can follow in its video (D-0000-13): shorten Saturday,
// read the warning, go back, save with flags, open the flagged list, then mark a technician on leave.
import { expect, test, type Page } from "@playwright/test";
import { book, day, instant, next, openAs, today } from "./manage-support";
import { chooseOption, dateNamed, selectNamed, typeDate } from "./support";

const pause = (page: Page) => page.waitForTimeout(700);

test("a manager shortens Saturday, saves with flags, opens Flagged, then marks a technician on leave", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openAs(page, "user-manager-london", "/manage/dealership");
  const saturday = next(6);
  await book(page, "a", instant(saturday, "14:30"));
  await book(page, "b", instant(saturday, "15:00"));
  const monday = next(1, today(), 7); // past the seeded bookings, which sit in the first week
  const leave = await book(page, "b", instant(monday, "11:00"));
  await page.reload();
  await expect(day(page, "Saturday")).toBeVisible();
  await pause(page);

  const closes = selectNamed(day(page, "Saturday"), "Closes");
  await closes.scrollIntoViewIfNeeded();
  await chooseOption(closes, "14:00");
  await pause(page);
  const save = page.getByRole("button", { name: "Save settings" }).first();
  await save.click();
  const dialog = page.getByRole("dialog", {
    name: "Saving will flag 2 bookings",
  });
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(2000);
  await dialog.getByRole("button", { name: "Go back and edit" }).click();
  await expect(dialog).toBeHidden();
  await pause(page);

  await save.click();
  await expect(dialog).toBeVisible();
  await pause(page);
  await dialog
    .getByRole("button", { name: "Save and flag 2 bookings" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Saved. 2 bookings no longer fit." }),
  ).toBeVisible();
  await page.waitForTimeout(1500);
  await page.getByRole("link", { name: "Review flagged bookings" }).click();
  await expect(page).toHaveURL(/\/manage\/flagged$/);
  await pause(page);

  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Shifts" })
    .click();
  await chooseOption(selectNamed(page, "Technician"), leave.technicianId);
  await expect(day(page, "Saturday")).toBeVisible();
  await pause(page);
  const first = dateNamed(page, "First day");
  await first.scrollIntoViewIfNeeded();
  await typeDate(first, monday);
  await pause(page);
  await page.getByRole("button", { name: "Add to the list" }).click();
  await pause(page);
  await page.getByRole("button", { name: "Save shifts" }).first().click();
  const warning = page.getByRole("dialog", {
    name: "Saving will flag 1 booking",
  });
  await expect(warning).toBeVisible();
  await page.waitForTimeout(1500);
  await warning
    .getByRole("button", { name: "Save and flag 1 booking" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Saved. 1 booking no longer fits." }),
  ).toBeVisible();
  await page.waitForTimeout(1500);
});
