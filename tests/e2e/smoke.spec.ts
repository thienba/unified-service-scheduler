import { expect, test } from "@playwright/test";
import { webKitSelectMessage } from "./policy-support";

test("the page opens on the booking page as Demo Customer A", async ({
  page,
}) => {
  const problems: string[] = [];
  page.on("console", (message) => {
    // WebKit's own message for a native <select> is set aside (D-0001-109); nothing else is.
    if (message.type() === "error" && message.text() !== webKitSelectMessage) {
      problems.push(message.text());
    }
  });
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Book a service" }),
  ).toBeVisible();
  expect(problems).toEqual([]);
});
