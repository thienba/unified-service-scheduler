import { test } from "@playwright/test";
import { pickRole } from "./support";
import { seedBusyDay } from "./schedule-data";
const out = "/private/tmp/claude-501/-Users-bason--claude-spares-spare-JQLRSg/e0116503-a2b2-4d39-810f-fca6a3ec2556/scratchpad/pw";
test("look", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seedBusyDay(page);
  await page.goto("/");
  await pickRole(page, "Staff");
  await page.getByRole("heading", { name: "Schedule" }).waitFor();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/tl-1440.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/list-390.png`, fullPage: true });
});
