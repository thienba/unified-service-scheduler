import { expect, test } from "@playwright/test";

test("the page opens and shows its heading", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Keyloop Service Scheduler" }),
  ).toBeVisible();
  expect(problems).toEqual([]);
});
