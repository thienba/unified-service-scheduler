// The shell in a real browser: roles, routes, the guard, the picker, failure states, accessibility, width (C1).
import { expect, test } from "@playwright/test";
import {
  expectNoAxeViolations,
  expectNoSidewaysScroll,
  interceptApi,
  openApp,
  pickRole,
  problemBody,
  widths,
  selectNamed,
} from "./support";
import { shot } from "./customer-support";

const nav = (page: import("@playwright/test").Page) =>
  page.getByRole("navigation", { name: "Main" });

test("with nobody picked, / says so and the header says Not signed in", async ({
  page,
}) => {
  await openApp(page);
  await expect(
    page.getByRole("heading", { level: 1, name: "You are not signed in." }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Pick who you are with Viewing as at the top of the page. This is a demo, so there is no password.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Not signed in").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Dev panel" })).toBeVisible();
});

test("picking each role sends X-Demo-User, lands on the home, and shows the toast", async ({
  page,
}) => {
  const sent: string[] = [];
  page.on("request", (r) => {
    const user = r.headers()["x-demo-user"];
    if (r.url().includes("/api/me") && user) sent.push(user);
  });
  await openApp(page);
  for (const [role, home, items] of [
    ["Customer", "/book", ["Book", "My appointments"]],
    ["Staff", "/schedule", ["Schedule", "Book for a customer"]],
    [
      "Manager",
      "/schedule",
      ["Schedule", "Flagged", "Settings", "Shifts", "Outbox"],
    ],
  ] as const) {
    await pickRole(page, role);
    await expect(page).toHaveURL(new RegExp(`${home}$`));
    await expect(nav(page).getByRole("link")).toHaveText(
      items.map((i) => new RegExp(`^${i}`)),
    );
    await expect(nav(page).getByRole("link").first()).toHaveAttribute(
      "aria-current",
      "page",
    );
  }
  expect(sent.length).toBeGreaterThanOrEqual(3);
  expect(new Set(sent).size).toBeGreaterThanOrEqual(3);
});

test("a role that may not open a route sees no-permission in place, and Switch role moves focus to the header control", async ({
  page,
}) => {
  await openApp(page);
  await pickRole(page, "Customer");
  await page.goto("/schedule");
  await expect(
    page.getByRole("heading", { name: "You cannot do that as Customer." }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Only garage staff and the garage manager can see the schedule. Switch role, or go to Book a service.",
    ),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/schedule$/);
  await page.getByRole("button", { name: "Switch role" }).click();
  await expect(
    page
      .getByRole("group", { name: "Viewing as" })
      .getByRole("button", { pressed: true }),
  ).toBeFocused();

  await page.goto("/manage/flagged");
  await expect(
    page.getByText(
      /Only the garage manager can change opening hours, shifts and flagged bookings/,
    ),
  ).toBeVisible();
  await page.goto("/book/for-customer");
  await expect(
    page.getByText(/Only garage staff can book for a customer/),
  ).toBeVisible();

  await pickRole(page, "Staff");
  await page.goto("/manage/flagged");
  await expect(
    page.getByRole("heading", { name: "You cannot do that as Staff." }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Only the garage manager can review flagged bookings. Switch role, or go to your schedule.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Go to the schedule" }),
  ).toBeVisible();
});

test("an unknown route shows not-found with the role's home", async ({
  page,
}) => {
  await openApp(page);
  await pickRole(page, "Customer");
  await page.goto("/nowhere");
  await expect(
    page.getByRole("heading", { name: "We cannot find that page." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Go to Book a service" }),
  ).toBeVisible();
});

for (const width of [390, 1440]) {
  test(`at ${width} wide: a staff member works at one dealership: no dealership choice, and another dealership is refused (D-0001-89)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await openApp(page);
    await pickRole(page, "Staff");
    await expect(
      page.getByText(/Now viewing as Staff, Demo Staff London/),
    ).toBeVisible();
    await expect(selectNamed(page, "Dealership")).toHaveCount(0);
    await expect(
      page.getByText("Fakeford Motors (demo)").first(),
    ).toBeVisible();
    await shot(page, "staff-header", "one-dealership");
    await page.goto("/schedule?dealership=dealership-saigon");
    await expect(
      page.getByRole("heading", { name: "You cannot open that dealership." }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /^Go to the .* schedule$/ }),
    ).toBeVisible();
  });
}

test("remote proof: page.route does not see calls the service worker answers (D-0001-58)", async ({
  page,
}) => {
  await openApp(page);
  await page.route("**/api/dealerships", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify(problemBody(500, "INTERNAL")),
    }),
  );
  const status = await page.evaluate(
    async () =>
      (
        await fetch("/api/dealerships", {
          headers: { "X-Demo-User": "user-staff-london" },
        })
      ).status,
  );
  // Option A of D-0001-58 does not work with the mock: the worker answered, so the route never ran.
  expect(status).toBe(200);
});

test("a 500 from the API shows the error words with a reference and a Copy button; no network says the same without a reference", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await interceptApi(page, {
    path: "/me",
    status: 500,
    body: problemBody(500, "INTERNAL"),
  });
  await openApp(page);
  await expect(
    page.getByRole("heading", { name: "Something went wrong on our side." }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Nothing was changed. Try again; if it keeps happening, quote reference 4bf92f35.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Reference 4bf92f35", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Copy reference 4bf92f35" }).click();
  await expect(page.getByText("Reference 4bf92f35 copied")).toBeAttached();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "4bf92f35",
  );
  await expect(page.getByText("INTERNAL")).toHaveCount(0);
});

test("a slow answer shows the skeleton only after 200 ms", async ({ page }) => {
  await interceptApi(page, { path: "/me", delayMs: 1500 });
  await page.goto("/");
  await expect(page.getByText("Loading", { exact: true })).toBeAttached();
  const skeleton = page.locator('[aria-busy="true"] > [aria-hidden="true"]');
  await expect(skeleton).toHaveClass(/invisible/);
  await expect(skeleton).not.toHaveClass(/invisible/, { timeout: 1000 });
});

test("the first Tab stop is the skip link, and a page has one h1 and the landmarks", async ({
  page,
}) => {
  await openApp(page);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to main content" }),
  ).toBeFocused();
  await pickRole(page, "Manager");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("banner")).toHaveCount(1);
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(1);
});

for (const width of widths) {
  test(`no sideways scroll and 44px targets at ${width} wide`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/components"]) {
      await openApp(page, path);
      await expectNoSidewaysScroll(page);
    }
    await pickRole(page, "Manager");
    // The role switch keeps the page it was on (/components). Open the manager's home and let it load
    // before measuring, or a slow machine measures the component sheet mid-switch.
    await openApp(page, "/");
    await expect(page).toHaveURL(/\/schedule/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    await expectNoSidewaysScroll(page);
    const small = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          "button, a[href], input, select",
        ),
      ]
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return (
            r.width > 0 &&
            r.height > 0 &&
            getComputedStyle(e).opacity !== "0" &&
            !e.matches(".sr-only, [class*='sr-only']") &&
            // React Aria's Select keeps a 1px native select for autofill: hidden from sight and from screen
            // readers, and out of the tab order, so no one can reach it (Q-0001-265).
            !(e.closest('[aria-hidden="true"]') && e.tabIndex < 0) &&
            (r.width < 43.5 || r.height < 43.5)
          );
        })
        .map((e) => `${e.tagName} ${e.textContent?.slice(0, 20)}`),
    );
    // Footer and body links are inline text: they are exempt as links in a sentence.
    expect(small.filter((s) => !s.includes("Dev panel"))).toEqual([]);
  });
}

for (const width of [390, 1440]) {
  test(`axe finds nothing on the shell, the guard states and the component sheet at ${width} wide`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await openApp(page);
    await expectNoAxeViolations(page); // signed-out
    await pickRole(page, "Customer");
    await expectNoAxeViolations(page);
    await page.goto("/schedule");
    await expect(
      page.getByRole("heading", { name: "You cannot do that as Customer." }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
    await page.goto("/nowhere");
    await expectNoAxeViolations(page);
    await pickRole(page, "Staff");
    await expectNoAxeViolations(page);
    await pickRole(page, "Manager");
    await expectNoAxeViolations(page);
    await page.goto("/components");
    await expect(
      page.getByRole("heading", { level: 1, name: "Component sheet" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });
}

for (const width of [360, 390]) {
  test(`on a phone the role button shows the whole name at ${width} wide, and the sheet names the current user`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await openApp(page);
    for (const role of ["Customer", "Staff", "Manager"] as const) {
      await pickRole(page, role);
      const label = page
        .getByRole("button", { name: /^Viewing as/ })
        .locator(".truncate");
      await expect(label).toHaveText(new RegExp(`^${role} · Demo `));
      const cut = await label.evaluate((el) => el.scrollWidth > el.clientWidth);
      expect(cut).toBe(false);
      await expectNoSidewaysScroll(page);
    }
    // The current role's row in the sheet names the user in use.
    await page.getByRole("button", { name: /^Viewing as/ }).click();
    const current = (await page
      .getByRole("button", { name: /^Viewing as/ })
      .locator(".truncate")
      .textContent())!.split(" · ")[1]!;
    await expect(
      page
        .getByRole("dialog")
        .getByRole("radio", { name: new RegExp(`^Manager, ${current}`) }),
    ).toBeChecked();
  });
}
