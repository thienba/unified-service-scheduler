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
import { webKitSelectMessage } from "./policy-support";

const nav = (page: import("@playwright/test").Page) =>
  page.getByRole("navigation", { name: "Main" });

const USER_KEY = "service-scheduler-demo-user";
const viewingAs = (page: import("@playwright/test").Page) =>
  page.getByRole("group", { name: "Viewing as" });

/** The header control (from 640 wide) or the phone button (below) names Customer. */
async function expectViewingAsCustomer(page: import("@playwright/test").Page) {
  if ((page.viewportSize()?.width ?? 1440) >= 640)
    await expect(
      viewingAs(page).getByRole("button", { pressed: true }),
    ).toHaveText("Customer");
  else
    await expect(
      page.getByRole("button", { name: /^Viewing as.*Customer/ }),
    ).toBeVisible();
}

/** Collects what the console reports and every /api/me answer. */
function watch(page: import("@playwright/test").Page) {
  const problems: string[] = [];
  const meStatuses: number[] = [];
  page.on("console", (m) => {
    // WebKit's own message for a native <select> is set aside (D-0001-109); nothing else is.
    if (m.type() === "error" && m.text() !== webKitSelectMessage) {
      problems.push(m.text());
    }
  });
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("response", (r) => {
    if (new URL(r.url()).pathname === "/api/me") meStatuses.push(r.status());
  });
  return { problems, meStatuses };
}

/** The log lines the mock backend holds, as one string. */
const logText = (page: import("@playwright/test").Page) =>
  page.evaluate(async () => {
    const response = await fetch("/api/_demo/telemetry", {
      headers: { "X-Demo-User": "user-customer-a" },
    });
    return JSON.stringify((await response.json()).logs).toLowerCase();
  });

for (const width of [390, 1440]) {
  test(`at ${width} wide, first visit: an empty browser opens / as Demo Customer A on the booking page, with no 401, no unknown_user log line, no console error, no toast and no axe violation`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await firstVisit(page);
  });
}

async function firstVisit(page: import("@playwright/test").Page) {
  const { problems, meStatuses } = watch(page);
  await openApp(page);
  await expect(
    page.getByRole("heading", { level: 1, name: "Book a service" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/book$/);
  await expectViewingAsCustomer(page);
  expect(await page.evaluate((k) => localStorage.getItem(k), USER_KEY)).toBe(
    "user-customer-a",
  );
  await expect(page.getByText("Not signed in")).toHaveCount(0);
  await expect(page.getByText(/^Now viewing as/)).toHaveCount(0);
  expect(meStatuses).toEqual([200]);
  expect(await logText(page)).not.toContain("unknown_user");
  expect(problems).toEqual([]);
  await expect(page.getByRole("link", { name: "Dev panel" })).toBeVisible();
  await expectNoAxeViolations(page);
}

test("first visit: a deep link to /book opens filled in, and /schedule shows no-permission with its way to switch role", async ({
  page,
}) => {
  await page.goto("/book?dealership=dealership-london&service=service-full");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Choose a time for your full service",
    }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/book\?dealership=dealership-london/);
  await expect(page.getByText(/^Now viewing as/)).toHaveCount(0);

  await page.goto("/schedule");
  await expect(
    page.getByRole("heading", { name: "You cannot do that as Customer." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Switch role" })).toBeVisible();
});

test("a stored user that no longer exists falls back to Demo Customer A, with no 401 on /me and no locked screen", async ({
  page,
}) => {
  await page.addInitScript(
    (k) => localStorage.setItem(k, "user-gone"),
    USER_KEY,
  );
  const { problems, meStatuses } = watch(page);
  await openApp(page);
  await expect(
    page.getByRole("heading", { level: 1, name: "Book a service" }),
  ).toBeVisible();
  await expectViewingAsCustomer(page);
  expect(await page.evaluate((k) => localStorage.getItem(k), USER_KEY)).toBe(
    "user-customer-a",
  );
  expect(meStatuses).toEqual([200]);
  expect(await logText(page)).not.toContain("unknown_user");
  expect(problems).toEqual([]);
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
}) => {
  // Clipboard permissions exist only in Chromium, so the copied text is recorded instead of read back.
  await page.addInitScript(() => {
    const copied: string[] = [];
    (window as unknown as { copied: string[] }).copied = copied;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          copied.push(text);
        },
      },
    });
  });
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
  expect(
    await page.evaluate(
      () => (window as unknown as { copied: string[] }).copied,
    ),
  ).toEqual(["4bf92f35"]);
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

test("first visit: once the booking page has settled, the first Tab stop is still the skip link", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Book a service" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/book$/);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to main content" }),
  ).toBeFocused();
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
            !(
              e.matches("select") &&
              e.closest('[aria-hidden="true"]') &&
              e.tabIndex < 0
            ) &&
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
    await expectNoAxeViolations(page); // first visit
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
