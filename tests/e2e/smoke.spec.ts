import { expect, test } from "@playwright/test";

test("the page opens on the booking page as Demo Customer A", async ({
  page,
}) => {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Book a service" }),
  ).toBeVisible();
  expect(problems).toEqual([]);
});
