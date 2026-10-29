// The mock API in a real browser (VITE_API_MODE=mock, the default): the service worker answers `/api`,
// the data survives a reload, and two pages of one browser race for the same time (AD-4, S1).
import { expect, test, type Page } from "@playwright/test";

const LONDON = "dealership-london";
const EV_CHECK = "service-ev-check";

interface Answer {
  status: number;
  traceId: string | null;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** Calls the API from inside the page, as the app's own code would. */
function api(
  page: Page,
  path: string,
  options: { user: string; method?: string; body?: unknown; key?: string },
): Promise<Answer> {
  return page.evaluate(
    async ({ path, options }) => {
      const response = await fetch(`/api${path}`, {
        method: options.method ?? "GET",
        headers: {
          "X-Demo-User": options.user,
          ...(options.key ? { "Idempotency-Key": options.key } : {}),
          ...(options.body ? { "Content-Type": "application/json" } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      return {
        status: response.status,
        traceId: response.headers.get("X-Trace-Id"),
        body: await response.json(),
      };
    },
    { path, options },
  );
}

/** Opens the page and waits for the mock backend, which starts before the page renders. */
async function open(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "You are not signed in." }),
  ).toBeVisible();
}

/** The seeded EV check of customer A: Ash is busy then, so Cedar is the one free EV technician. */
async function contestedStart(page: Page): Promise<string> {
  const mine = await api(page, "/appointments", { user: "user-customer-a" });
  expect(mine.status).toBe(200);
  return mine.body[0].start;
}

const booking = (start: string) => ({
  dealershipId: LONDON,
  serviceTypeId: EV_CHECK,
  start,
  transport: "wait",
  vehicleId: "vehicle-a",
});

test("the service worker answers /api/me with an X-Trace-Id", async ({
  page,
}) => {
  await open(page);
  const me = await api(page, "/me", { user: "user-manager-london" });
  expect(me.status).toBe(200);
  expect(me.body).toMatchObject({ role: "manager", dealershipIds: [LONDON] });
  expect(me.traceId).toMatch(/^[0-9a-f]{32}$/);
  expect((await api(page, "/me", { user: "nobody" })).status).toBe(401);
});

test("a booking is still there after the page is reloaded", async ({
  page,
}) => {
  await open(page);
  const start = await contestedStart(page);
  const free = new Date(new Date(start).getTime() + 3 * 3_600_000)
    .toISOString()
    .replace(".000Z", "Z");
  const booked = await api(page, "/appointments", {
    user: "user-customer-a",
    method: "POST",
    key: crypto.randomUUID(),
    body: { ...booking(free), serviceTypeId: "service-oil-change" },
  });
  expect(booked.status).toBe(201);

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "You are not signed in." }),
  ).toBeVisible();
  const after = await api(page, "/appointments", { user: "user-customer-a" });
  expect(after.body.map((a: { id: string }) => a.id)).toContain(booked.body.id);
});

for (const gapMs of [0, 1000]) {
  test(`two pages post the same booking ${gapMs === 0 ? "together" : "one second apart"}: one 201, one 409 with suggestions, one appointment stored`, async ({
    context,
  }) => {
    const first = await context.newPage();
    await open(first);
    const second = await context.newPage();
    await open(second);
    const start = await contestedStart(first);
    // Seed dates count from today, so a closed Sunday can put both seeded bookings on one day.
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/London",
    }).format(new Date(start));
    const dayPath = `/appointments?dealershipId=${LONDON}&date=${date}`;
    const before = (await api(first, dayPath, { user: "user-staff-london" }))
      .body.length;

    const post = (page: Page, delay: number) =>
      page.evaluate(
        async ({ body, delay }) => {
          await new Promise((resolve) => setTimeout(resolve, delay));
          const response = await fetch("/api/appointments", {
            method: "POST",
            headers: {
              "X-Demo-User": "user-customer-a",
              "Idempotency-Key": crypto.randomUUID(),
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          });
          return { status: response.status, body: await response.json() };
        },
        { body: booking(start), delay },
      );
    const answers = await Promise.all([post(first, 0), post(second, gapMs)]);

    expect(answers.map((a) => a.status).sort()).toEqual([201, 409]);
    const lost = answers.find((a) => a.status === 409)!;
    expect(lost.body.code).toBe("SLOT_UNAVAILABLE");
    expect(lost.body.suggestions.length).toBeGreaterThan(0);

    // The seeded appointments and exactly one new one, seen from either page.
    for (const page of [first, second]) {
      const day = await api(page, dayPath, { user: "user-staff-london" });
      expect(day.body).toHaveLength(before + 1);
    }
  });
}

test("the console shows JSON lines with the trace id, the telemetry answers, and reset brings the seed back", async ({
  page,
}) => {
  const logged: string[] = [];
  page.on("console", (message) => logged.push(message.text()));
  await open(page);
  const start = await contestedStart(page);
  // Cedar is the one free EV technician: the first booking takes them, the second is refused.
  const first = await api(page, "/appointments", {
    user: "user-customer-a",
    method: "POST",
    key: crypto.randomUUID(),
    body: booking(start),
  });
  expect(first.status).toBe(201);
  const booked = await api(page, "/appointments", {
    user: "user-customer-b",
    method: "POST",
    key: crypto.randomUUID(),
    body: { ...booking(start), vehicleId: "vehicle-b" },
  });
  expect(booked.status).toBe(409);
  const lines = logged.flatMap((text) => {
    try {
      return [JSON.parse(text) as Record<string, unknown>];
    } catch {
      return [];
    }
  });
  expect(lines).toContainEqual(
    expect.objectContaining({
      msg: "appointment.book",
      traceId: booked.traceId,
      status: 409,
      outcome: "slot_unavailable",
    }),
  );

  const telemetry = await api(page, "/_demo/telemetry", {
    user: "user-customer-a",
  });
  expect(telemetry.status).toBe(200);
  expect(telemetry.body.counters).toContainEqual(
    expect.objectContaining({ name: "appointment_conflicts_total", value: 1 }),
  );

  const reset = await page.evaluate(async () => {
    const response = await fetch("/api/_demo/reset", {
      method: "POST",
      headers: { "X-Demo-User": "user-customer-a" },
    });
    return response.status;
  });
  expect(reset).toBe(204);
  const mine = await api(page, "/appointments", { user: "user-customer-a" });
  expect(mine.body[0].start).toBe(start);
});
