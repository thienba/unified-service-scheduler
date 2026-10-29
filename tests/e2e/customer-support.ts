// Shared steps of the customer-appointments tests (C5): opening the app as a customer at a fixed time, booking
// and cancelling through the API as real use does, and the screenshots of D-0000-13. The mock backend runs in
// the page, so every call is made from the page with `fetch`.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { api } from "./schedule-data";
import {
  expectNoAxeViolations,
  expectNoSidewaysScroll,
  openApp,
  pickRole,
  chooseOption,
  selectNamed,
} from "./support";

export { api };

/** Wed 28 Oct 2026, 10:40 in London (GMT). The seed puts Customer A on Sat 31 Oct and B on Mon 2 Nov. */
export const NOW = new Date("2026-10-28T10:40:00Z");
export const LONDON = "dealership-london";
export const A = "user-customer-a";
export const B = "user-customer-b";
export const STAFF = "user-staff-london";
export const MANAGER = "user-manager-london";
export const FRI_10 = "2026-10-30T10:00:00Z";
export const MON_14 = "2026-11-02T14:00:00Z";

export interface Appointment {
  id: string;
  start: string;
  end: string;
  status: string;
  cancelledAt: string | null;
  version: number;
}

/** Opens the app as Customer A (or B) at a fixed time, then the given address. */
export async function start(
  page: Page,
  width: number,
  address: string,
  options: { now?: Date; user?: "A" | "B" | "Staff" | "Manager" } = {},
) {
  await page.setViewportSize({ width, height: 900 });
  await page.clock.setFixedTime(options.now ?? NOW);
  await openApp(page);
  const user = options.user ?? "A";
  await pickRole(
    page,
    user === "Staff" ? "Staff" : user === "Manager" ? "Manager" : "Customer",
  );
  if (user === "B") await switchToB(page);
  await page.goto(address);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
}

/** Picks Demo Customer B in the header's "Who" select (from 640 wide). */
export async function switchToB(page: Page) {
  await chooseOption(selectNamed(page, "Who"), { label: "Demo Customer B" });
  await expect(selectNamed(page, "Who")).toHaveAttribute("data-value", B);
}

/** Saves `<screen>-<state>-<width>.png` after the axe and sideways-scroll checks (NFR-4, NFR-7, D-0000-13). */
export async function shot(page: Page, screen: string, state: string) {
  await expectNoAxeViolations(page);
  await expectNoSidewaysScroll(page);
  const dir = process.env["EVIDENCE_DIR"];
  if (!dir) return;
  mkdirSync(path.join(dir, "shots"), { recursive: true });
  const width = page.viewportSize()?.width ?? 0;
  await page.screenshot({
    path: path.join(dir, "shots", `${screen}-${state}-${width}.png`),
    fullPage: true,
  });
}

/** A customer books for themselves with their own car (A: vehicle-a, B: vehicle-b). */
export async function bookAs(
  page: Page,
  user: string,
  startAt: string,
  options: { service?: string; transport?: string } = {},
): Promise<Appointment> {
  const answer = await api(page, user, "POST", "/appointments", {
    dealershipId: LONDON,
    serviceTypeId: options.service ?? "service-full",
    vehicleId: user === A ? "vehicle-a" : "vehicle-b",
    start: startAt,
    transport: options.transport ?? "drop_off",
  });
  if (answer.status !== 201) {
    throw new Error(`Booking failed: ${JSON.stringify(answer)}`);
  }
  return answer.body as Appointment;
}

export async function cancelAs(page: Page, user: string, id: string) {
  const answer = await api(page, user, "POST", `/appointments/${id}/cancel`);
  expect(answer.status).toBe(200);
  return answer.body as Appointment;
}

export async function read(page: Page, user: string, id: string) {
  return (await api(page, user, "GET", `/appointments/${id}`)) as {
    status: number;
    body: Appointment;
  };
}

export async function mine(page: Page, user: string) {
  const answer = await api(
    page,
    user,
    "GET",
    "/appointments?includeCancelled=true&includePast=true",
  );
  return answer.body as Appointment[];
}

/** From the `from`-th call to `path` (with `query` in its address) on, answers `status` with `body` (D-0001-58). */
export async function answerFrom(
  page: Page,
  rule: {
    path: string;
    method?: string;
    query?: string;
    from: number;
    status: number;
    body: unknown;
    /** Only this many answers are faked; the calls after them go through. */
    times?: number;
  },
) {
  await page.addInitScript((r) => {
    const original = window.fetch.bind(window);
    let count = 0;
    window.fetch = async (input, init) => {
      const request = input instanceof Request ? input : null;
      const url = new URL(request ? request.url : String(input), location.href);
      const method = (request?.method ?? init?.method ?? "GET").toUpperCase();
      if (
        !url.pathname.endsWith(r.path) ||
        !url.search.includes(r.query ?? "") ||
        (r.method !== undefined && method !== r.method)
      )
        return original(input, init);
      count += 1;
      if (count < r.from) return original(input, init);
      if (r.times !== undefined && count >= r.from + r.times)
        return original(input, init);
      return new Response(JSON.stringify(r.body), {
        status: r.status,
        headers: {
          "Content-Type": "application/json",
          "X-Trace-Id": "4bf92f35a1b2c3d4e5f60718293a4b5c",
        },
      });
    };
  }, rule);
}

/** Keeps the Idempotency-Key and the address of every POST the page sends, in `window.posts`. */
export async function recordPosts(page: Page) {
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    const posts: { url: string; key: string }[] = [];
    (window as unknown as { posts: typeof posts }).posts = posts;
    window.fetch = async (input, init) => {
      const request = input instanceof Request ? input : null;
      const method = (request?.method ?? init?.method ?? "GET").toUpperCase();
      if (method === "POST") {
        const headers = new Headers(request?.headers ?? init?.headers);
        posts.push({
          url: new URL(request ? request.url : String(input), location.href)
            .pathname,
          key: headers.get("Idempotency-Key") ?? "",
        });
      }
      return original(input, init);
    };
  });
}

export async function posts(page: Page, ending: string) {
  const all = await page.evaluate(
    () =>
      (window as unknown as { posts: { url: string; key: string }[] }).posts,
  );
  return all.filter((p) => p.url.endsWith(ending));
}

/** Keeps every availability check the page has had answered (D-0001-107: one runs when a time is chosen). */
export async function recordChecks(page: Page) {
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    const answered: { start: string; transport: string }[] = [];
    (window as unknown as { checks: typeof answered }).checks = answered;
    window.fetch = async (input, init) => {
      const request = input instanceof Request ? input : null;
      const url = new URL(request ? request.url : String(input), location.href);
      const body = url.pathname.endsWith("/availability-checks")
        ? await (request ? request.clone().text() : String(init?.body))
        : null;
      const response = await original(input, init);
      if (body !== null) answered.push(JSON.parse(body));
      return response;
    };
  });
}

/**
 * Waits until the page's own early check for `start` has been answered (any car choice but the courtesy car,
 * whose check the booking page also sends for another reason).
 */
export async function checkAnswered(page: Page, start: string) {
  await expect
    .poll(() =>
      page.evaluate(
        (at) =>
          (
            window as unknown as {
              checks: { start: string; transport: string }[];
            }
          ).checks.filter(
            (c) => c.start === at && c.transport !== "courtesy_car",
          ).length,
        start,
      ),
    )
    .toBeGreaterThan(0);
}
