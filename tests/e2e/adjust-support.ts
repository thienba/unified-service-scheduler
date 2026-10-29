// Real use through the API for the manager's adjust and flagged tests (C6): the clock is fixed on Wed 28 Oct 2026
// 08:00 in London, so every date below is known; bookings are made by staff, flags by the manager's own shift and
// opening-hours calls, exactly as the settings and shifts screens make them.
import { mkdirSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { expectNoAxeViolations, expectNoSidewaysScroll } from "./support";
import { LONDON, MANAGER, api, book, changeShift } from "./schedule-data";

export { LONDON, MANAGER, api, book, changeShift };
export const STAFF = "user-staff-london";
export const NOW = "2026-10-28T08:00:00Z";
export const ASH = "tech-lon-ash";
export const BIRCH = "tech-lon-birch";

const evidence = process.env["EVIDENCE_DIR"] ?? "test-results/evidence";
export const shotsDir = `${evidence}/shots`;
export const videoDir = `${evidence}/video`;
mkdirSync(shotsDir, { recursive: true });
mkdirSync(videoDir, { recursive: true });

/** Checks the state (axe-core, no sideways scroll) and saves `<screen>-<state>-<width>.png`. */
export async function shot(page: Page, name: string) {
  await expectNoSidewaysScroll(page);
  await expectNoAxeViolations(page);
  const width = page.viewportSize()?.width ?? 0;
  // A dialog or sheet is fixed to the window, so it is shot as the window shows it.
  const dialog = await page.getByRole("dialog").count();
  await page.screenshot({
    path: `${shotsDir}/${name}-${width}.png`,
    fullPage: dialog === 0,
  });
}

/** Fixes the clock and opens the app once, so the seed is placed from Wed 28 Oct. */
export async function start(page: Page, user = MANAGER) {
  await page.clock.setFixedTime(new Date(NOW));
  // Only the first time: a later `openAsUser` keeps its own choice across page loads.
  await page.addInitScript((id) => {
    if (!localStorage.getItem("service-scheduler-demo-user"))
      localStorage.setItem("service-scheduler-demo-user", id);
  }, user);
  await page.goto("/");
  await expect(
    page.getByText("Service Scheduler", { exact: true }),
  ).toBeVisible();
}

/** Opens a page as another demo user, in the same browser data. */
export async function openAsUser(page: Page, user: string, path: string) {
  await page.evaluate((id) => {
    localStorage.setItem("service-scheduler-demo-user", id);
  }, user);
  await page.goto(path);
  await expect(
    page.getByText("Service Scheduler", { exact: true }),
  ).toBeVisible();
}

/** The manager sets one date's opening hours, through the API. */
export async function dateHours(
  page: Page,
  date: string,
  hours: { open: string; close: string },
) {
  const d = (await api(page, MANAGER, "GET", `/dealerships/${LONDON}`))
    .body as {
    weeklyHours: unknown;
    dateOverrides: Record<string, unknown>;
    policies: {
      leadTimeMinutes: number;
      horizonDays: number;
      breakMinutes: number;
    };
  };
  const answer = await api(
    page,
    MANAGER,
    "PUT",
    `/dealerships/${LONDON}/settings`,
    {
      weeklyHours: d.weeklyHours,
      dateOverrides: { ...d.dateOverrides, [date]: hours },
      policies: {
        leadTimeMinutes: d.policies.leadTimeMinutes,
        horizonDays: d.policies.horizonDays,
        breakMinutes: d.policies.breakMinutes,
      },
    },
  );
  expect(answer.status, JSON.stringify(answer.body)).toBe(200);
}

/** Puts a technician on leave for many dates in one save. */
export async function leaveOn(
  page: Page,
  technicianId: string,
  dates: string[],
) {
  const list = await api(
    page,
    MANAGER,
    "GET",
    `/dealerships/${LONDON}/technicians?from=2026-10-28&to=2026-10-28`,
  );
  const t = (
    list.body as {
      id: string;
      shiftPattern: unknown;
      shiftExceptions: Record<string, unknown>;
    }[]
  ).find((x) => x.id === technicianId)!;
  const answer = await api(
    page,
    MANAGER,
    "PUT",
    `/technicians/${technicianId}/shifts`,
    {
      shiftPattern: t.shiftPattern,
      shiftExceptions: {
        ...t.shiftExceptions,
        ...Object.fromEntries(dates.map((d) => [d, { kind: "leave" }])),
      },
    },
  );
  expect(answer.status, JSON.stringify(answer.body)).toBe(200);
}

export async function getAppointment(page: Page, id: string) {
  const answer = await api(page, MANAGER, "GET", `/appointments/${id}`);
  expect(answer.status).toBe(200);
  return answer.body as {
    start: string;
    end: string;
    technicianId: string;
    serviceBayId: string;
    version: number;
    flags: unknown[];
    cancelledAt: string | null;
  };
}

/**
 * Slows down or fails one kind of call from the page (D-0001-64 A2: the page's `fetch` is wrapped before the app
 * starts; nothing is added to the product). Unlike `interceptApi` it also matches the method, so the read of
 * the same address still answers.
 */
export async function onCall(
  page: Page,
  rule: {
    method: string;
    path: string;
    delayMs?: number;
    status?: number;
    body?: unknown;
  },
) {
  await page.addInitScript((r) => {
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const request = input instanceof Request ? input : null;
      const url = request ? request.url : String(input);
      const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
      if (
        method !== r.method ||
        !new URL(url, location.href).pathname.endsWith(r.path)
      )
        return original(input, init);
      if (r.delayMs) await new Promise((done) => setTimeout(done, r.delayMs));
      if (r.status) {
        return new Response(JSON.stringify(r.body ?? {}), {
          status: r.status,
          headers: { "Content-Type": "application/problem+json" },
        });
      }
      return original(input, init);
    };
  }, rule);
}
