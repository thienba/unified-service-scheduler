import { expect, test } from "@playwright/test";

test("the page opens and says nobody is signed in", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "You are not signed in." }),
  ).toBeVisible();
  // Nobody is picked, so the first call is answered 401: the browser reports it, and that is expected.
  expect(problems.filter((p) => !p.includes("401"))).toEqual([]);
});
