// Shared steps of the end-to-end demo scenarios and the two-tab race (C8): who is signed in, the API from inside
// the page, London dates from the data, and the evidence of D-0000-13 (videos, end-of-scenario screenshots).
// With EVIDENCE_DIR set the videos and screenshots are saved there; scripts/e2e-media.mjs turns the videos
// into MP4 and GIF files and builds the side-by-side race video.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { expectNoAxeViolations, expectNoSidewaysScroll } from "./support";

export const LONDON = "dealership-london";
export const SAIGON = "dealership-saigon";
export const ZONE = "Europe/London";
export const USER_KEY = "service-scheduler-demo-user";
export const A = "user-customer-a";
export const B = "user-customer-b";
export const STAFF = "user-staff-london";
export const MANAGER = "user-manager-london";

export const evidenceDir = process.env["EVIDENCE_DIR"];

export interface Answer<T = unknown> {
  status: number;
  traceId: string | null;
  body: T;
}

/** Calls the API from inside the page, as the app's own code would. */
export async function api<T = unknown>(
  page: Page,
  user: string,
  method: string,
  url: string,
  body?: unknown,
  key?: string,
): Promise<Answer<T>> {
  return (await page.evaluate(
    async ({ user, method, url, body, key }) => {
      const response = await fetch(`/api${url}`, {
        method,
        headers: {
          "X-Demo-User": user,
          ...(method === "POST"
            ? { "Idempotency-Key": key ?? crypto.randomUUID() }
            : {}),
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      return {
        status: response.status,
        traceId: response.headers.get("X-Trace-Id"),
        body: text ? JSON.parse(text) : null,
      };
    },
    { user, method, url, body, key },
  )) as Answer<T>;
}

/** Signs this page in as one seeded demo user for every load (the role switcher keeps its choice there). */
export async function signInAs(page: Page, user: string) {
  await page.addInitScript(({ key, id }) => localStorage.setItem(key, id), {
    key: USER_KEY,
    id: user,
  });
}

/** Opens a path and waits until the shell has answered (the mock starts before the page renders). */
export async function open(page: Page, address: string) {
  await page.goto(address);
  await expect(
    page.getByText("Service Scheduler", { exact: true }),
  ).toBeVisible();
}

/** "Reset demo data" through the API: the seed is written again, counting from the page's today. */
export async function resetDemo(page: Page) {
  const status = await page.evaluate(async () => {
    const response = await fetch("/api/_demo/reset", {
      method: "POST",
      headers: { "X-Demo-User": "user-manager-london" },
    });
    return response.status;
  });
  expect(status).toBe(204);
}

/**
 * A time for two customers to race for (D-0001-146). Customer A's seeded EV check holds Oliver Hughes for A's own car,
 * and one car cannot be at two places, so A could not take part in a race at that time. Three hours later the same kind
 * of check is booked for customer C's car with Oliver named. At that time the cars of A and B are free, Oliver is busy
 * and Tom Fletcher is the one free EV technician.
 */
export async function contestedEvStart(page: Page): Promise<string> {
  const mine = await api<{ start: string; serviceTypeId: string }[]>(
    page,
    A,
    "GET",
    "/appointments",
  );
  const seeded = mine.body.find((a) => a.serviceTypeId === "service-ev-check");
  if (!seeded) throw new Error("The seed has no EV check for customer A.");
  const start = plusMinutes(seeded.start, 180);
  // Another tab of the browser books it, so a test that fakes or counts the calls of its own page is not disturbed.
  const other = await page.context().newPage();
  await other.goto("/");
  await expect(
    other.getByText("Service Scheduler", { exact: true }),
  ).toBeVisible();
  const held = await api(other, STAFF, "POST", "/appointments", {
    dealershipId: LONDON,
    serviceTypeId: "service-ev-check",
    customerId: "customer-c",
    vehicleId: "vehicle-c",
    start,
    transport: "wait",
    technicianId: "tech-lon-ash",
  });
  await other.close();
  expect(held.status).toBe(201);
  return start;
}

/** The London date of an instant, `YYYY-MM-DD`. */
export const londonDate = (at: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(new Date(at));

/** The London wall time of an instant, "10:00". */
export const londonTime = (at: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(at));

/** The day as the screens write it: "Sat 31 Oct". */
export const londonDay = (at: string) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).formatToParts(new Date(at));
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("weekday")} ${part("day")} ${part("month")}`;
};

/** An instant `minutes` later, written as the API writes it. */
export const plusMinutes = (at: string, minutes: number) =>
  new Date(new Date(at).getTime() + minutes * 60_000)
    .toISOString()
    .replace(".000Z", "Z");

/** The instant of a London date and wall time. */
export function instant(date: string, time: string): string {
  const guess = new Date(`${date}T${time}:00Z`);
  const offset = (at: Date) => {
    const name = new Intl.DateTimeFormat("en-GB", {
      timeZone: ZONE,
      timeZoneName: "longOffset",
    })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")!.value;
    const m = /GMT([+-])(\d\d):(\d\d)/.exec(name);
    return m ? (m[1] === "-" ? -1 : 1) * (+m[2]! * 60 + +m[3]!) : 0;
  };
  const first = new Date(guess.getTime() - offset(guess) * 60_000);
  return new Date(guess.getTime() - offset(first) * 60_000)
    .toISOString()
    .replace(".000Z", "Z");
}

/** Checks the end of a scenario (axe, no sideways scroll) at 1440 and 390 and saves both screenshots. */
export async function endShots(page: Page, name: string) {
  const height = page.viewportSize()?.height ?? 900;
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height });
    // Some screens swap their layout in script when the width changes (the timeline becomes a list), so the
    // page is given a moment to redraw; a page that stays wider than the window still fails.
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      )
      .toBe(true);
    await expectNoSidewaysScroll(page);
    await expectNoAxeViolations(page);
    if (!evidenceDir) continue;
    mkdirSync(path.join(evidenceDir, "shots"), { recursive: true });
    await page.screenshot({
      path: path.join(evidenceDir, "shots", `${name}-end-${width}.png`),
      fullPage: true,
    });
  }
}

/** Closes the page and keeps its video as `video/<name>.webm` (turned into MP4 and GIF afterwards). */
export async function keepVideo(page: Page, name: string) {
  const video = page.video();
  await page.close();
  if (!evidenceDir || !video) return;
  mkdirSync(path.join(evidenceDir, "video"), { recursive: true });
  await video.saveAs(path.join(evidenceDir, "video", `${name}.webm`));
}

/** Notes, next to a video, how many seconds in the part worth watching starts (for the side-by-side cut). */
export function noteVideoStart(name: string, seconds: number) {
  if (!evidenceDir) return;
  mkdirSync(path.join(evidenceDir, "video"), { recursive: true });
  writeFileSync(
    path.join(evidenceDir, "video", `${name}.start.json`),
    JSON.stringify({ seconds }),
  );
}

/** A short pause so a person can follow the video. */
export const beat = (page: Page, ms = 700) => page.waitForTimeout(ms);
