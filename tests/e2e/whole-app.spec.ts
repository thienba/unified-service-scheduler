// Whole-app checks that need every screen in place (C8): the Content Security Policy run of the three role journeys
// (SEC-15.AC-3), stored script text through the staff booking form (SEC-11.AC-3), the role switch memory
// (SEC-13.AC-2), the axe sweep of every route (NFR-4), no sideways scroll at five widths (NFR-7) and the remote
// build (SEC-14). They run against the built app served by `vite preview`, so the policy in index.html is in force.
// With EVIDENCE_DIR set the CSP run's log is written to logs/csp-run.txt.
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { devPanelPath, routeRules } from "../../src/ui/app/guard";
import {
  A,
  LONDON,
  MANAGER,
  STAFF,
  api,
  evidenceDir,
  open,
  signInAs,
} from "./demo-support";
import {
  isWebKitSelectStyle,
  recordPolicyViolations,
  withoutWebKitSelectMessage,
} from "./policy-support";
import {
  expectNoAxeViolations,
  expectNoSidewaysScroll,
  pickRole,
  widths,
  chooseOption,
  waitForTimes,
  selectNamed,
} from "./support";

const NOW = new Date("2026-10-28T10:40:00Z");

// Firefox now and then prints this, with no file or line, as the test moves a page on. It comes from
// MSW 3.0.3: `get-worker-instance.ts` calls `registration.update()` without catching it, and the update
// can reject while the worker of the page just left is unregistering itself. Reported upstream as
// https://github.com/mswjs/msw/issues/2827. Set aside in Firefox only (D-0001-110, D-0001-130); every
// other console error still fails the test. Remove this once MSW catches that rejection.
const firefoxMockWorkerMessage =
  '[JavaScript Error: "InvalidStateError: An attempt was made to use an object that is not, or is no longer, usable"]';

async function pageAs(page: Page, user: string) {
  await page.clock.setFixedTime(NOW);
  await signInAs(page, user);
  await open(page, "/");
}

test("SEC-15.AC-3: the three role journeys on the built app send every request to the app's own origin, with no blocked resource or policy message", async ({
  context,
  baseURL,
  browserName,
}) => {
  test.setTimeout(180_000);
  const own = new URL(baseURL!).origin;
  const violations = await recordPolicyViolations(context);
  const requests: string[] = [];
  const consoleLines: string[] = [];
  context.on("request", (r) =>
    requests.push(`${r.method()} ${r.url()} (${r.resourceType()})`),
  );
  const watch = (page: Page, who: string) => {
    page.on("console", (m) =>
      consoleLines.push(`[${who}] ${m.type()}: ${m.text()}`),
    );
    page.on("pageerror", (e) =>
      consoleLines.push(`[${who}] pageerror: ${e.message}`),
    );
  };
  context.on("serviceworker", (worker) =>
    consoleLines.push(`[service worker started] ${worker.url()}`),
  );

  // Customer A books a full service on Fri 30 Oct at 10:00 and cancels it.
  const customer = await context.newPage();
  watch(customer, "customer");
  await pageAs(customer, A);
  await customer.goto(
    `/book?dealership=${LONDON}&service=service-full&date=2026-10-30`,
  );
  await chooseOption(
    customer.getByRole("button", { name: /^Car/ }),
    "vehicle-a",
  );
  await customer
    .getByRole("radio", { name: "10:00 to 13:00", exact: true })
    .check();
  await customer.getByRole("radio", { name: "Wait on site" }).check();
  await customer.getByRole("button", { name: "Confirm booking" }).click();
  await expect(
    customer.getByRole("heading", { level: 1, name: "You are booked" }),
  ).toBeVisible();
  await customer
    .getByRole("link", { name: "change or cancel this appointment" })
    .click();
  await customer
    .getByRole("main")
    .getByRole("button", { name: "Cancel appointment" })
    .click();
  await customer
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel appointment" })
    .click();
  await expect(customer.getByText(/^Cancelled on /)).toBeVisible();
  await customer.close();

  // Staff open the schedule, tap a free gap and book Demo Walk-in Carol.
  const staff = await context.newPage();
  watch(staff, "staff");
  await pageAs(staff, STAFF);
  await staff.goto("/schedule?date=2026-10-30&view=list");
  await staff
    .getByRole("list", { name: /in time order/ })
    .getByRole("link", { name: /^Free, .* Book this time\.$/ })
    .first()
    .click();
  await staff
    .getByRole("searchbox", { name: "Name, phone or number plate" })
    .fill("Carol");
  await staff
    .getByRole("group", { name: /found$/ })
    .getByRole("radio", { name: /^Demo Walk-in Carol/ })
    .check();
  await staff
    .getByRole("radio", { name: "Demo Motors Coupe, EF22 DMC" })
    .check();
  await staff.getByRole("button", { name: "Continue", exact: true }).click();
  await chooseOption(
    selectNamed(staff, "Service (required)"),
    "service-oil-change",
  );
  await waitForTimes(staff);
  await staff.getByRole("radio", { name: "Waits on site" }).check();
  await staff.getByRole("button", { name: "Confirm booking" }).click();
  await expect(
    staff.getByRole("heading", {
      level: 1,
      name: "Demo Walk-in Carol is booked in.",
    }),
  ).toBeVisible();
  await staff.close();

  // The manager saves the settings (one more day ahead) and reads the outbox.
  const manager = await context.newPage();
  watch(manager, "manager");
  await pageAs(manager, MANAGER);
  await manager.goto("/manage/dealership");
  const ahead = manager.getByLabel("Furthest ahead (days)");
  await ahead.fill("31");
  await manager.getByRole("button", { name: "Save settings" }).first().click();
  await expect(
    manager.getByRole("heading", { name: "Settings saved" }),
  ).toBeVisible();
  await manager.goto("/manage/outbox");
  await expect(
    manager.getByRole("heading", { level: 1, name: "Outbox" }),
  ).toBeVisible();
  await expect(
    manager.getByRole("main").getByRole("listitem").getByRole("button").first(),
  ).toBeVisible();
  await manager.close();

  const origins = [
    ...new Set(
      requests
        .map((line) => line.split(" ")[1]!)
        .filter((url) => /^https?:/.test(url))
        .map((url) => new URL(url).origin),
    ),
  ];
  if (evidenceDir) {
    mkdirSync(path.join(evidenceDir, "logs"), { recursive: true });
    writeFileSync(
      path.join(evidenceDir, "logs", "csp-run.txt"),
      [
        `Content Security Policy run (SEC-15.AC-3), ${browserName}, built app served by vite preview.`,
        `App origin: ${own}`,
        `Request origins seen: ${origins.join(", ")}`,
        `Requests: ${requests.length}; console messages: ${consoleLines.length}`,
        "",
        "## Every request (method, address, resource type)",
        ...requests,
        "",
        "## Every console message",
        ...(consoleLines.length ? consoleLines : ["(none)"]),
        "",
        "## Every policy violation event (directive, blocked, element, source)",
        ...(violations.length
          ? violations.map(
              (v) =>
                `${v.directive} ${v.blocked} ${v.target} ${v.source}${isWebKitSelectStyle(v, browserName) ? " (WebKit's own <select> style, set aside: Q-0001-253)" : ""}`,
            )
          : ["(none)"]),
        "",
      ].join("\n"),
    );
  }
  expect(origins).toEqual([own]);
  expect(
    violations.filter((v) => !isWebKitSelectStyle(v, browserName)),
  ).toEqual([]);
  expect(
    withoutWebKitSelectMessage(consoleLines, violations, browserName).filter(
      (l) => /Content Security Policy|Refused to|blocked|violat/i.test(l),
    ),
  ).toEqual([]);
});

test("SEC-11.AC-3: script text stored through the staff booking form is shown as text on the schedule, the search, the appointment page and the outbox; no dialog, no console error, no window.__xss", async ({
  page,
  context,
  browserName,
}) => {
  test.setTimeout(120_000);
  const violations = await recordPolicyViolations(context);
  const name = '<img src=x onerror="window.__xss=1">';
  const make = '"><script>window.__xss=1</script>';
  const dialogs: string[] = [];
  const errors: string[] = [];
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  // Firefox reports the loads a page still has running when the test moves it on (its fonts through
  // the mock's service worker, a storage call) as console errors of the page being left. A person
  // reads a page before leaving it, so the test lets each page finish loading first.
  const leaveFor = async (address: string) => {
    await page.waitForLoadState("networkidle");
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await page.goto(address);
  };
  await page.setViewportSize({ width: 1440, height: 900 });
  await pageAs(page, STAFF);
  await leaveFor("/book/for-customer");
  await page.getByRole("button", { name: "Add a new customer" }).click();
  const field = (label: string) =>
    page.getByRole("textbox", { name: label, exact: true });
  await field("Full name (required)").fill(name);
  await field("Phone number (required)").fill("07700 900555");
  // The plate's own pattern refuses markup (it is checked as a plate), so it is a plain plate here.
  await field("Registration (required)").fill("XS11 XSS");
  await field("Make (required)").fill(make);
  await field("Model (required)").fill(name);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await chooseOption(
    selectNamed(page, "Service (required)"),
    "service-oil-change",
  );
  await page.getByRole("radio", { name: /^Fri 30 Oct,/ }).check();
  await page
    .getByRole("radio", { name: "09:00 to 10:00", exact: true })
    .check();
  await page.getByRole("radio", { name: "Waits on site" }).check();
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: /is booked in\.$/ }),
  ).toBeVisible();

  const shownAsText = async (texts: string[]) => {
    for (const text of texts)
      await expect(
        page.getByText(text, { exact: false }).first(),
      ).toBeAttached();
    expect(await page.locator("main img, main script").count()).toBe(0);
    expect(await page.evaluate(() => "__xss" in window)).toBe(false);
  };
  await shownAsText([name]);

  const day = await api<{ id: string; display: { customerName?: string } }[]>(
    page,
    STAFF,
    "GET",
    `/appointments?dealershipId=${LONDON}&date=2026-10-30`,
  );
  const stored = day.body.find((a) => a.display.customerName === name)!;
  expect(stored).toBeTruthy();

  await leaveFor("/schedule?date=2026-10-30");
  await page
    .getByRole("region", { name: "Day timeline, scrolls sideways" })
    .getByRole("button", { name: /^09:00 to 10:00, / })
    .click();
  await shownAsText([name, make]);
  await leaveFor("/book/for-customer");
  await page
    .getByRole("searchbox", { name: "Name, phone or number plate" })
    .fill("XS11");
  await shownAsText([name]);
  await leaveFor(`/appointments/${stored.id}`);
  await shownAsText([name, make]);
  await signInAs(page, MANAGER);
  await leaveFor(`/manage/outbox?appointmentId=${stored.id}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Outbox" }),
  ).toBeVisible();
  // The outbox writes the first name only (its first word, Q-0001-219).
  await shownAsText(["<img"]);
  await page
    .getByRole("contentinfo")
    .getByRole("link", { name: "Dev panel" })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Dev panel" }),
  ).toBeVisible();
  // The panel never shows customer details (SEC-10); typed script stays text there too.
  await page.getByRole("searchbox", { name: "Find a reference" }).fill(name);
  await expect(
    page.getByRole("searchbox", { name: "Find a reference" }),
  ).toHaveValue(name);
  expect(await page.locator("main img, main script").count()).toBe(0);
  expect(await page.evaluate(() => "__xss" in window)).toBe(false);
  expect(dialogs).toEqual([]);
  expect(
    withoutWebKitSelectMessage(errors, violations, browserName).filter(
      (e) => !(browserName === "firefox" && e === firefoxMockWorkerMessage),
    ),
  ).toEqual([]);
  expect(
    violations.filter((v) => !isWebKitSelectStyle(v, browserName)),
  ).toEqual([]);
});

/**
 * Finds the app's TanStack Query client through React's own fiber tree (test-side only) and returns, for every
 * query in the cache, its key and when its data came in.
 */
async function cacheEntries(page: Page) {
  return page.evaluate(() => {
    const root = document.getElementById("root")!;
    const key = Object.keys(root).find((k) =>
      k.startsWith("__reactContainer$"),
    )!;
    type Fiber = {
      child: Fiber | null;
      sibling: Fiber | null;
      memoizedProps?: { client?: unknown };
    };
    interface Client {
      getQueryCache(): {
        getAll(): { queryKey: unknown; state: { dataUpdatedAt: number } }[];
      };
    }
    const stack: Fiber[] = [(root as unknown as Record<string, Fiber>)[key]!];
    let client: Client | null = null;
    while (stack.length && !client) {
      const f = stack.pop()!;
      const c = f.memoizedProps?.client as Client | undefined;
      if (c && typeof c.getQueryCache === "function") client = c;
      if (f.sibling) stack.push(f.sibling);
      if (f.child) stack.push(f.child);
    }
    if (!client) throw new Error("No QueryClient found in the React tree");
    return client
      .getQueryCache()
      .getAll()
      .map((q) => ({
        key: JSON.stringify(q.queryKey),
        at: q.state.dataUpdatedAt,
      }));
  });
}

test("SEC-13.AC-2: after staff load the schedule and a search with results, switching to the customer role leaves no staff name, phone or plate in the page, and the cache holds nothing from before the switch", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.setFixedTime(NOW);
  await open(page, "/");
  await pickRole(page, "Staff");
  await page.goto("/schedule?date=2026-10-31");
  await expect(page.getByText("Oliver Hughes").first()).toBeVisible();
  await page.goto("/book/for-customer");
  await page
    .getByRole("searchbox", { name: "Name, phone or number plate" })
    .fill("Demo");
  await expect(page.getByText("Demo Walk-in Carol")).toBeVisible();
  const before = await cacheEntries(page);
  expect(before.length).toBeGreaterThan(0);

  // Watch the page from the switch on: no staff text may be drawn again.
  const markers = [
    "Oliver Hughes",
    "Amara Okafor",
    "Tom Fletcher",
    "Demo Walk-in Carol",
    "900103",
    "900102",
    "EF22 DMC",
    "CD11 DMB",
  ];
  await page.evaluate((markers) => {
    const seen: string[] = [];
    (window as unknown as { __seen: string[] }).__seen = seen;
    new MutationObserver((records) => {
      for (const r of records)
        for (const n of Array.from(r.addedNodes)) {
          // The header's "Viewing as" lists every customer by name (D-0001-144): that is the switcher, not staff data.
          const element = n instanceof Element ? n : n.parentElement;
          if (element?.closest("header")) continue;
          const text = n.textContent ?? "";
          for (const m of markers) if (text.includes(m)) seen.push(m);
        }
    }).observe(document.getElementById("root")!, {
      childList: true,
      subtree: true,
    });
  }, markers);
  const switchedAt = await page.evaluate(() => Date.now());
  await pickRole(page, "Customer");
  await expect(
    page.getByRole("heading", { level: 1, name: "Book a service" }),
  ).toBeVisible();
  const text = await page.locator("main").innerText();
  for (const m of markers) expect(text).not.toContain(m);
  expect(
    await page.evaluate(
      () => (window as unknown as { __seen: string[] }).__seen,
    ),
  ).toEqual([]);
  // Every query now in the cache was answered after the switch: nothing from the staff screens was kept.
  const after = await cacheEntries(page);
  for (const entry of after)
    expect(entry.at === 0 || entry.at >= switchedAt, entry.key).toBe(true);
  expect(after.map((e) => e.key)).not.toEqual(
    expect.arrayContaining(before.map((e) => e.key)),
  );
});

/** Where each route of the router is opened, for every role it allows. A route missing here fails the sweep. */
const addresses: Record<string, string> = {
  "/book": "/book",
  "/book/confirmed/:appointmentId": "/book/confirmed/appointment-customer-a",
  "/appointments": "/appointments",
  "/appointments/:appointmentId": "/appointments/appointment-customer-a",
  "/appointments/:appointmentId/reschedule":
    "/appointments/appointment-customer-a/reschedule",
  "/book/for-customer": "/book/for-customer",
  "/schedule": "/schedule",
  "/appointments/:appointmentId/adjust":
    "/appointments/appointment-customer-a/adjust",
  "/manage/flagged": "/manage/flagged",
  "/manage/dealership": "/manage/dealership",
  "/manage/shifts": "/manage/shifts",
  "/manage/outbox": "/manage/outbox",
  [devPanelPath]: devPanelPath,
  "/components": "/components",
};
const users = { customer: A, staff: STAFF, manager: MANAGER } as const;
const allRoles = ["customer", "staff", "manager"] as const;
// The demo build's routes: the guarded ones of `routeRules`, the dev panel and the component sheet (any role).
const everyRoute = [
  ...routeRules,
  { path: devPanelPath, roles: allRoles },
  { path: "/components", roles: allRoles },
];
/** The component sheet shows the loading state on purpose, so it is never free of aria-busy. */
const showsLoadingOnPurpose = new Set(["/components"]);

test("NFR-4: the route list of the router has an address for every route", () => {
  const missing = everyRoute
    .map((r) => r.path)
    .filter((p) => !(p in addresses));
  expect(missing, "routes with no accessibility check").toEqual([]);
});

test("NFR-4: every route written straight into the router (not through routeRules) is in the sweep", () => {
  // routes.tsx builds the guarded routes from routeRules (and the dev panel); any other <Route path="..."> is
  // written there by hand and has to be swept too. "*" is the not-found page, which has no address of its own.
  const source = readFileSync(
    path.join(process.cwd(), "src/ui/app/routes.tsx"),
    "utf8",
  );
  const written = [...source.matchAll(/<Route\b[^>]*\bpath="([^"]+)"/g)]
    .map((m) => m[1]!)
    .filter((p) => p !== "*")
    .map((p) => (p.startsWith("/") ? p : `/${p}`));
  expect(written.length, "routes.tsx was read").toBeGreaterThan(0);
  expect(source).toContain("rules.map((rule) =>");
  const swept = new Set(everyRoute.map((r) => r.path));
  expect(
    written.filter((p) => !swept.has(p)),
    "routes in routes.tsx with no accessibility check",
  ).toEqual([]);
});

for (const role of ["customer", "staff", "manager"] as const) {
  test(`NFR-4, NFR-7: every route a ${role} can open has 0 axe violations at 390 and 1440 and no sideways scroll at 320 to 1440`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await pageAs(page, users[role]);
    for (const rule of everyRoute.filter((r) =>
      (r.roles as readonly string[]).includes(role),
    )) {
      const address = addresses[rule.path];
      expect(address, `no address for ${rule.path}`).toBeTruthy();
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(address!);
        await expect(
          page.getByRole("heading", { level: 1 }).first(),
        ).toBeVisible();
        if (!showsLoadingOnPurpose.has(rule.path))
          await expect(page.locator("[aria-busy=true]")).toHaveCount(0);
        await test.step(`${rule.path} at ${width}`, async () => {
          await expectNoSidewaysScroll(page);
          if (width === 390 || width === 1440)
            await expectNoAxeViolations(page);
        });
      }
    }
  });
}

test("SEC-14: a VITE_API_MODE=remote preview has no role switcher, no dev panel link and no X-Demo-User header in any request", async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  const port = Number(process.env["E2E_PORT"] ?? 4173) + 1;
  const outDir = testInfo.outputPath("remote-dist");
  execFileSync("npx", ["vite", "build", "--outDir", outDir, "--emptyOutDir"], {
    stdio: "pipe",
    env: {
      ...process.env,
      VITE_API_MODE: "remote",
      VITE_API_BASE_URL: `http://localhost:${port}/api`,
    },
  });
  const server: ChildProcess = spawn(
    "npx",
    [
      "vite",
      "preview",
      "--outDir",
      outDir,
      "--port",
      String(port),
      "--strictPort",
    ],
    { stdio: "pipe" },
  );
  try {
    const origin = `http://localhost:${port}`;
    await expect
      .poll(
        async () => {
          try {
            return (await fetch(origin)).status;
          } catch {
            return 0;
          }
        },
        { timeout: 30_000 },
      )
      .toBe(200);
    const sent: { url: string; demoUser: string | undefined }[] = [];
    page.on("request", (r) =>
      sent.push({ url: r.url(), demoUser: r.headers()["x-demo-user"] }),
    );
    for (const address of ["/", "/book", "/schedule", "/dev"]) {
      await page.goto(`${origin}${address}`);
      await expect(
        page.getByText("Service Scheduler", { exact: true }),
      ).toBeVisible();
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("group", { name: "Viewing as" })).toHaveCount(
        0,
      );
      await expect(
        page.getByRole("button", { name: /^Viewing as/ }),
      ).toHaveCount(0);
      await expect(selectNamed(page, "Who")).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Dev panel" })).toHaveCount(
        0,
      );
    }
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.filter((s) => s.demoUser !== undefined)).toEqual([]);
    expect(sent.some((s) => s.url.includes("/api/"))).toBe(true);
  } finally {
    server.kill();
  }
});
