// Helpers for the manager screens' tests: who is signed in, the API from inside the page, and local dates.
import { expect, type Page } from "@playwright/test";

export const LONDON = "dealership-london";
export const SAIGON = "dealership-saigon";
export const ZONE = "Europe/London";

/** Opens a path as one seeded demo user (the switcher keeps its choice in the same place). */
export async function openAs(page: Page, user: string, path: string) {
  await page.addInitScript((id) => {
    localStorage.setItem("service-scheduler-demo-user", id);
  }, user);
  await page.goto(path);
  await expect(
    page.getByText("Service Scheduler", { exact: true }),
  ).toBeVisible();
}

export interface Answer {
  status: number;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** Calls the API from inside the page, as the app's own code would. */
export function api(
  page: Page,
  path: string,
  options: { user: string; method?: string; body?: unknown },
): Promise<Answer> {
  return page.evaluate(
    async ({ path, options }) => {
      const response = await fetch(`/api${path}`, {
        method: options.method ?? "GET",
        headers: {
          "X-Demo-User": options.user,
          ...(options.method === "POST"
            ? { "Idempotency-Key": crypto.randomUUID() }
            : {}),
          ...(options.body ? { "Content-Type": "application/json" } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      const text = await response.text();
      return { status: response.status, body: text ? JSON.parse(text) : null };
    },
    { path, options },
  );
}

/** Every call the page makes to the API that changes something, in order: "PUT /api/…?preview=true". */
export function writes(page: Page): string[] {
  const seen: string[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (url.pathname.startsWith("/api") && r.method() !== "GET")
      seen.push(`${r.method()} ${url.pathname}${url.search}`);
  });
  return seen;
}

/** Today's date at the dealership, `YYYY-MM-DD`. */
export function today(zone = ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(
    new Date(),
  );
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

/** 1 Monday to 7 Sunday. */
export function weekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return ((new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay() + 6) % 7) + 1;
}

/** The first date after `from` (at least `minDays` later) that falls on `day` (1 Monday to 7 Sunday). */
export function next(day: number, from = today(), minDays = 2): string {
  let date = addDays(from, minDays);
  while (weekday(date) !== day) date = addDays(date, 1);
  return date;
}

/** The instant of a local date and clock time in a zone, as the API writes it ("2026-10-31T14:30:00Z"). */
export function instant(date: string, time: string, zone = ZONE): string {
  const guess = new Date(`${date}T${time}:00Z`);
  const offsetOf = (at: Date) => {
    const name = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      timeZoneName: "longOffset",
    })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")!.value;
    const match = /GMT([+-])(\d\d):(\d\d)/.exec(name);
    return match
      ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]))
      : 0;
  };
  const first = new Date(guess.getTime() - offsetOf(guess) * 60_000);
  const at = new Date(guess.getTime() - offsetOf(first) * 60_000);
  return at.toISOString().replace(".000Z", "Z");
}

/** The clock time of an instant in a zone, "14:30". */
export function clock(at: string, zone = ZONE): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(at));
}

/** Books an oil change as a seeded customer; fails the test unless it is booked. */
export async function book(
  page: Page,
  customer: "a" | "b",
  start: string,
  serviceTypeId = "service-oil-change",
) {
  const answer = await api(page, "/appointments", {
    user: `user-customer-${customer}`,
    method: "POST",
    body: {
      dealershipId: LONDON,
      serviceTypeId,
      start,
      transport: "wait",
      vehicleId: `vehicle-${customer}`,
    },
  });
  expect(answer.status, JSON.stringify(answer.body)).toBe(201);
  return answer.body as {
    id: string;
    technicianId: string;
    serviceBayId: string;
  };
}

/** The free starts of an oil change on one date, as clock times of start and end. */
export async function freeStarts(
  page: Page,
  date: string,
  options: { technicianId?: string; user?: string; dealership?: string } = {},
) {
  const query = new URLSearchParams({
    serviceTypeId: "service-oil-change",
    date,
    transport: "wait",
    ...(options.technicianId ? { technicianId: options.technicianId } : {}),
  });
  const answer = await api(
    page,
    `/dealerships/${options.dealership ?? LONDON}/availability?${query}`,
    { user: options.user ?? "user-manager-london" },
  );
  expect(answer.status, JSON.stringify(answer.body)).toBe(200);
  return (answer.body.slots as { start: string; end: string }[]).map((s) => ({
    start: clock(s.start),
    end: clock(s.end),
  }));
}

export async function appointmentsOn(page: Page, date: string) {
  const answer = await api(
    page,
    `/appointments?dealershipId=${LONDON}&date=${date}`,
    { user: "user-manager-london" },
  );
  expect(answer.status).toBe(200);
  return answer.body as {
    id: string;
    start: string;
    end: string;
    technicianId: string;
    serviceBayId: string;
    version: number;
    flags: unknown[];
    status: string;
  }[];
}

/** The day's group in the weekly editor. */
export const day = (page: Page, name: string) =>
  page.getByRole("group", { name, exact: true });
