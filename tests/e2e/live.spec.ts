// A booking on the hosted demo (ticket 2026-10-28-demo-hosting; SEC-15.AC-3 on the live host). It runs only
// when LIVE_URL is set, with `npx playwright test -c playwright.live.config.ts`; otherwise it is skipped.
// A customer books a time, staff see it on the schedule, and every request and console message is recorded:
// every request goes to the site's own origin and there is no Content Security Policy violation. With
// EVIDENCE_DIR set (Chromium only) the screenshots and the log are saved there.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  isWebKitSelectStyle,
  recordPolicyViolations,
  withoutWebKitSelectMessage,
} from "./policy-support";
import { openApp, pickRole } from "./support";

const liveUrl = process.env["LIVE_URL"];
const evidence = process.env["EVIDENCE_DIR"];

test("the live site: a customer books, staff see it, every request is the site's own, no policy message", async ({
  context,
  page,
  browserName,
}) => {
  test.skip(!liveUrl, "LIVE_URL is not set");
  test.setTimeout(120_000);
  const own = new URL(liveUrl!).origin;
  const violations = await recordPolicyViolations(context);
  const requests: string[] = [];
  const consoleLines: string[] = [];
  const foreign: string[] = [];
  context.on("request", (r) => {
    requests.push(`${r.method()} ${r.url()} (${r.resourceType()})`);
    // data: and blob: are not network requests; the page may make them itself.
    if (!/^(data|blob):/.test(r.url()) && new URL(r.url()).origin !== own)
      foreign.push(r.url());
  });
  page.on("console", (m) => consoleLines.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => consoleLines.push(`pageerror: ${e.message}`));
  context.on("serviceworker", (w) =>
    consoleLines.push(`[service worker started] ${w.url()}`),
  );
  const shot = async (name: string, width: number) => {
    if (!evidence || browserName !== "chromium") return;
    mkdirSync(path.join(evidence, "shots"), { recursive: true });
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({
      path: path.join(evidence, "shots", `live-${name}-${width}.png`),
      fullPage: true,
    });
  };

  await page.setViewportSize({ width: 1280, height: 800 });
  // No reload: a first visit must start the mock worker by itself.
  await openApp(page, "/");
  await pickRole(page, "Customer");
  await page.goto("/book?dealership=dealership-london&service=service-full");
  await expect(page.getByRole("combobox", { name: /^Car/ })).toBeVisible();
  const slow = () => page.waitForTimeout(900);
  await slow();
  await page.getByRole("combobox", { name: /^Car/ }).selectOption("vehicle-a");
  await slow();
  await page
    .getByRole("radio", { name: /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d+ \w+,/ })
    .and(page.locator(":enabled"))
    .first()
    .check();
  await slow();
  await page
    .getByRole("radio", { name: /^\d\d:\d\d to \d\d:\d\d$/ })
    .first()
    .check();
  await slow();
  await page.getByRole("radio", { name: "Wait on site" }).check();
  await shot("book", 390);
  await shot("book", 1440);
  await page.setViewportSize({ width: 1280, height: 800 });
  await slow();
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "You are booked" }),
  ).toBeVisible();
  await page.waitForTimeout(2000);

  // The schedule opens on today; go to the day that was booked (a London date).
  const id = new URL(page.url()).pathname.split("/").pop();
  const start = await page.evaluate(async (id) => {
    const response = await fetch(`/api/appointments/${id}`, {
      headers: { "X-Demo-User": "user-customer-a" },
    });
    return ((await response.json()) as { start: string }).start;
  }, id);
  const day = new Date(start).toLocaleDateString("en-CA", {
    timeZone: "Europe/London",
  });
  await pickRole(page, "Staff");
  await page.goto(`/schedule?date=${day}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(
    page.getByRole("button", { name: /Full service, Demo Motors Hatch/ }),
  ).toBeVisible();
  await shot("schedule", 390);
  await shot("schedule", 1440);

  // Let late requests and messages arrive.
  await page.waitForTimeout(1000);
  if (evidence && browserName === "chromium") {
    mkdirSync(path.join(evidence, "logs"), { recursive: true });
    writeFileSync(
      path.join(evidence, "logs", "live-run.txt"),
      [
        `Live site: ${liveUrl}`,
        `Browser: ${browserName}`,
        "",
        `Requests (${requests.length}):`,
        ...requests,
        "",
        `Console (${consoleLines.length}):`,
        ...consoleLines,
        "",
        `Policy violations (${violations.length}):`,
        ...violations.map((v) => JSON.stringify(v)),
        "",
      ].join("\n"),
    );
  }

  expect(foreign).toEqual([]);
  // The mock worker of the site's own origin is running and answered the /api calls.
  expect(
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return registration?.active?.scriptURL;
    }),
  ).toBe(`${own}/mockServiceWorker.js`);
  expect(
    violations.filter((v) => !isWebKitSelectStyle(v, browserName)),
  ).toEqual([]);
  const problems = withoutWebKitSelectMessage(
    consoleLines,
    violations,
    browserName,
  )
    // Nobody is picked on a first visit, so the first call is answered 401 and the browser reports it.
    .filter((l) => /^(error|warning|pageerror)/.test(l) && !l.includes("401"));
  expect(problems).toEqual([]);
});
