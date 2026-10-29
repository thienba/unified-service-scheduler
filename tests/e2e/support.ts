import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, type Page } from "@playwright/test";

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
