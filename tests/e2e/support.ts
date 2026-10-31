import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, type Locator, type Page } from "@playwright/test";

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

export const widths = [320, 390, 768, 1024, 1440] as const;

/** Opens the app and waits until the shell has answered (the mock backend starts before the page renders). */
export async function openApp(page: Page, path = "/") {
  await page.goto(path);
  await expect(
    page.getByText("Service Scheduler", { exact: true }),
  ).toBeVisible();
}

/** Picks a role with the header control (from 640 wide) or the bottom sheet (below). */
export async function pickRole(
  page: Page,
  role: "Customer" | "Staff" | "Manager",
) {
  const wide = (page.viewportSize()?.width ?? 1440) >= 640;
  // A first visit already opens as Customer A (D-0001-145); picking the role in use does nothing. Wait until
  // the shell shows who is in use before deciding.
  const shown = wide
    ? page
        .getByRole("group", { name: "Viewing as" })
        .getByRole("button", { pressed: true })
    : page.getByRole("button", { name: /^Viewing as/ });
  await expect(shown).toBeVisible();
  await expect(shown).not.toContainText("Not signed in");
  if (new RegExp(role).test((await shown.textContent()) ?? "")) return;
  if (wide) {
    await page
      .getByRole("group", { name: "Viewing as" })
      .getByRole("button", { name: role })
      .click();
  } else {
    await page.getByRole("button", { name: /^Viewing as/ }).click();
    await page
      .getByRole("dialog", { name: "Viewing as" })
      .getByRole("radio", { name: new RegExp(`^${role}, `) })
      .click();
  }
  await expect(
    page.getByText(new RegExp(`^Now viewing as ${role}, `)),
  ).toBeVisible();
}

/** Runs axe-core with the tags NFR-4 names, and fails with the rules that broke. */
export async function expectNoAxeViolations(page: Page) {
  // Let colour transitions finish: axe reads the colours as they are drawn.
  await page.waitForTimeout(400);
  await page.evaluate(axeSource);
  const violations = await page.evaluate(async () => {
    interface Axe {
      run: (
        context: Document,
        options: object,
      ) => Promise<{
        violations: {
          id: string;
          nodes: { target: string[]; html: string }[];
        }[];
      }>;
    }
    const axe = (window as unknown as { axe: Axe }).axe;
    const result = await axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
      },
    });
    return result.violations.map(
      (v) =>
        `${v.id}: ${v.nodes.map((n) => n.target.join(" ") + " " + n.html.slice(0, 120)).join(" | ")}`,
    );
  });
  expect(violations).toEqual([]);
}

export async function expectNoSidewaysScroll(page: Page) {
  const [scroll, client] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(scroll).toBeLessThanOrEqual(client!);
}

/**
 * Makes calls to the API fail or slow down, as a test needs (D-0001-58). `page.route` cannot do this: the service
 * worker answers `/api` before the network, so Playwright never sees the call (proved in shell.spec.ts). The page's
 * `fetch` is wrapped instead, from the test, before the app starts. Nothing is added to the product.
 */
export async function interceptApi(
  page: Page,
  rule: {
    path: string;
    status?: number;
    body?: unknown;
    delayMs?: number;
    networkError?: boolean;
  },
) {
  await page.addInitScript((r) => {
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (!new URL(url, location.href).pathname.endsWith(r.path))
        return original(input, init);
      if (r.delayMs) await new Promise((done) => setTimeout(done, r.delayMs));
      if (r.networkError) throw new TypeError("Failed to fetch");
      if (r.status) {
        return new Response(JSON.stringify(r.body ?? {}), {
          status: r.status,
          headers: { "Content-Type": "application/json" },
        });
      }
      return original(input, init);
    };
  }, rule);
}

export const problemBody = (status: number, code: string) => ({
  type: "about:blank",
  title: code,
  status,
  code,
  traceId: "4bf92f35a1b2c3d4e5f60718293a4b5c",
});

// The themed controls (design.md 8.27 to 8.30, D-0001-131). They replace the native drop-down, date and time
// inputs, so a test chooses the way a person does: open the control, press the option or the day.

/** The button of a Select or TimeField: its name is the label, then the value. */
export function selectNamed(scope: Page | Locator, label: string): Locator {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return scope
    .getByRole("button", { name: new RegExp(`^${escaped}( |$)`) })
    .and(scope.locator('[aria-haspopup="listbox"]'));
}

/**
 * Opens a Select or TimeField and chooses the option with this value (`"vehicle-a"`, `"14:00"`), or with this
 * visible label. Waits until the list has closed.
 */
export async function chooseOption(
  trigger: Locator,
  choice: string | { label: string },
) {
  const page = trigger.page();
  const list = page.getByRole("listbox");
  const option =
    typeof choice === "string"
      ? list.locator(`[role="option"][data-value="${choice}"]`)
      : list.getByRole("option", { name: choice.label, exact: true });
  // The rows can be drawn again while the list is open, when the day's hours arrive just after a date was
  // typed; Linux WebKit is slow enough to show it. So the open, scroll and press are tried again as one step.
  await expect(async () => {
    if ((await list.count()) === 0) await trigger.click();
    await option.scrollIntoViewIfNeeded({ timeout: 2000 });
    await option.click({ timeout: 2000 });
    await expect(list).toHaveCount(0, { timeout: 5000 });
  }).toPass({ timeout: 15_000 });
  // On a phone the sheet locks the page's scroll while open and gives it back a frame after it closes. Wait
  // until the page has stopped moving, or the next click can land where a control was a moment ago.
  await expect(page.locator(".ctl-scrim")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<boolean>((done) => {
            const before = scrollY;
            requestAnimationFrame(() =>
              requestAnimationFrame(() => done(scrollY === before)),
            );
          }),
      ),
    )
    .toBe(true);
}

/**
 * Waits until the start times of the booking page are shown. Press the car choice only after this: at phone
 * width the choice sits below the times, and a press that spans their arrival can end on another element.
 * (times-space.spec.ts holds the test that proves the page itself keeps the press.)
 */
export async function waitForTimes(page: Page) {
  await expect(
    page.getByRole("radio", { name: /^\d\d:\d\d to \d\d:\d\d$/ }).first(),
  ).toBeVisible();
}

/** A DatePicker by its label: the group of its three segments and the calendar button. */
export function dateNamed(scope: Page | Locator, label: string): Locator {
  return scope.getByRole("group", { name: label, exact: true });
}

/** Types a date (`YYYY-MM-DD`) into a DatePicker's segments, day first (dd/mm/yyyy); empty clears it. */
export async function typeDate(group: Locator, date: string) {
  const page = group.page();
  const segments = group.getByRole("spinbutton");
  if (date === "") {
    for (const i of [0, 1, 2]) {
      await segments.nth(i).click();
      for (let n = 0; n < 4; n += 1) await page.keyboard.press("Backspace");
    }
    return;
  }
  const [year, month, day] = date.split("-");
  await segments.nth(0).click();
  await page.keyboard.type(`${day}${month}${year}`);
}
