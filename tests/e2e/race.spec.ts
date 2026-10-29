// The two-tab race on the real booking screen (C8; REQ-BOOK-009, scorecard S1). Two pages of one Chromium context
// are signed in as Demo Customer A and Demo Customer B and press Confirm in the same instant. The clock is the real
// one: the contested time is read from the data (the seeded EV check of customer A, when Oliver Hughes is busy and
// Tom Fletcher is the one free EV technician), so the race works on whichever weekday it is run. The London sample
// data is closed on Sundays (D-0001-38 B): the seed then moves the booking to the next open day, and the test
// still finds it. With EVIDENCE_DIR set the two race videos are kept for the side-by-side cut.
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { recordPosts, posts } from "./customer-support";
import {
  A,
  B,
  LONDON,
  MANAGER,
  STAFF,
  api,
  beat,
  keepVideo,
  londonDate,
  londonDay,
  londonTime,
  noteVideoStart,
  open,
  plusMinutes,
  resetDemo,
  signInAs,
} from "./demo-support";
import { chooseOption } from "./support";

const EV = "service-ev-check";
const OIL = "service-oil-change";
const OLIVER = "tech-lon-ash";
const AMARA = "tech-lon-birch";
const TOM = "tech-lon-cedar";

interface Appointment {
  id: string;
  start: string;
  end: string;
  technicianId: string;
  serviceBayId: string;
  status: string;
}

interface Racer {
  page: Page;
  user: string;
  vehicle: string;
  /** When the page (and its video) began, in ms. */
  born: number;
}

async function racer(
  context: BrowserContext,
  user: string,
  width: number,
): Promise<Racer> {
  const page = await context.newPage();
  const born = Date.now();
  await page.setViewportSize({ width, height: width < 640 ? 844 : 900 });
  await signInAs(page, user);
  await open(page, "/");
  return { page, user, vehicle: user === A ? "vehicle-a" : "vehicle-b", born };
}

/** Is one start free for one technician (staff may name the technician)? */
async function freeFor(
  page: Page,
  service: string,
  start: string,
  tech: string,
) {
  const answer = await api<{ available: boolean }>(
    page,
    STAFF,
    "POST",
    "/availability-checks",
    {
      dealershipId: LONDON,
      serviceTypeId: service,
      start,
      transport: "wait",
      technicianId: tech,
    },
  );
  expect(answer.status).toBe(200);
  return answer.body.available;
}

/**
 * The seeded EV check of customer A. Oliver Hughes (EV) does it in bay 1, so Tom Fletcher is the one free EV
 * technician and bay 2 the one free bay at that start. Fails with a plain message when the data has no such time.
 */
async function contestedStart(page: Page): Promise<string> {
  const mine = await api<Appointment[]>(page, A, "GET", "/appointments");
  const ev = mine.body.find(
    (a) => (a as unknown as { serviceTypeId: string }).serviceTypeId === EV,
  );
  if (!ev)
    throw new Error(
      "No contested time: the seed has no EV check for customer A. The race needs one.",
    );
  const oliver = await freeFor(page, EV, ev.start, OLIVER);
  const tom = await freeFor(page, EV, ev.start, TOM);
  if (oliver || !tom)
    throw new Error(
      `No contested time: at ${ev.start} Oliver Hughes should be busy and Tom Fletcher free, ` +
        `but Oliver is ${oliver ? "free" : "busy"} and Tom is ${tom ? "free" : "busy"}. ` +
        "The London sample data is closed on Sundays, so the seed moves the booking to the next open day.",
    );
  return ev.start;
}

/** The appointments of the start's London day, as staff read them. */
async function dayList(page: Page, start: string) {
  const answer = await api<Appointment[]>(
    page,
    STAFF,
    "GET",
    `/appointments?dealershipId=${LONDON}&date=${londonDate(start)}`,
  );
  expect(answer.status).toBe(200);
  return answer.body.filter((a) => a.status === "confirmed");
}

const confirm = (page: Page) =>
  page.getByRole("button", { name: "Confirm booking" });
const booked = (page: Page) =>
  page.getByRole("heading", { level: 1, name: "You are booked" });
const apologyText = (start: string) =>
  `Sorry, ${londonTime(start)} on ${londonDay(start)} was just taken.`;

/** Opens the booking page on the start's day and makes every choice, up to Confirm. */
async function choose(
  r: Racer,
  service: string,
  start: string,
  minutes: number,
  pace = false,
) {
  const page = r.page;
  await page.goto(
    `/book?dealership=${LONDON}&service=${service}&date=${londonDate(start)}`,
  );
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  if (pace) await beat(page);
  await chooseOption(page.getByRole("button", { name: /^Car/ }), r.vehicle);
  if (pace) await beat(page);
  await page
    .getByRole("radio", { name: new RegExp(`^${londonDay(start)},`) })
    .check();
  if (pace) await beat(page);
  await page
    .getByRole("radio", {
      name: `${londonTime(start)} to ${londonTime(plusMinutes(start, minutes))}`,
      exact: true,
    })
    .check();
  if (pace) await beat(page);
  await page.getByRole("radio", { name: "Wait on site" }).check();
  await expect(confirm(page)).toBeEnabled();
}

/** Which page shows the confirmation and which the apology, once both have answered. */
async function outcome(pages: Racer[], start: string) {
  for (const r of pages)
    await expect(
      booked(r.page).or(r.page.getByText(apologyText(start))),
    ).toBeVisible({ timeout: 15_000 });
  const won: Racer[] = [];
  const lost: Racer[] = [];
  for (const r of pages)
    ((await booked(r.page).isVisible()) ? won : lost).push(r);
  return { won, lost };
}

const idFromUrl = (page: Page) =>
  new URL(page.url()).pathname.split("/").pop()!;

async function read(page: Page, user: string, id: string) {
  const answer = await api<Appointment>(
    page,
    user,
    "GET",
    `/appointments/${id}`,
  );
  expect(answer.status).toBe(200);
  return answer.body;
}

/** The loser's page as REQ-BOOK-009.AC-2 wants it: apology, up to five closest times, every choice kept. */
async function expectApology(r: Racer, start: string) {
  const page = r.page;
  await expect(page.getByText(apologyText(start))).toBeFocused();
  const closest = page
    .getByRole("radiogroup", { name: "Closest to your time" })
    .getByRole("radio");
  expect(await closest.count()).toBeGreaterThan(0);
  expect(await closest.count()).toBeLessThanOrEqual(5);
  await expect(
    page.getByRole("button", { name: "Pick a new time to confirm" }),
  ).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^Car/ })).toHaveAttribute(
    "data-value",
    r.vehicle,
  );
  await expect(page.getByRole("radio", { name: "Wait on site" })).toBeChecked();
  await expect(
    page.getByRole("radio", { name: new RegExp(`^${londonDay(start)},`) }),
  ).toBeChecked();
}

const overlap = (x: Appointment, y: Appointment) =>
  x.start < y.end && y.start < x.end;

/** One race at the contested start; returns the winner's and the loser's pages. */
async function race(pages: Racer[], start: string) {
  const before = (await dayList(pages[0]!.page, start)).filter(
    (a) => a.start === start,
  ).length;
  for (const r of pages) await choose(r, EV, start, 60);
  // The barrier: both pages are ready; the two clicks are issued together.
  await Promise.all(pages.map((r) => confirm(r.page).click()));
  const { won, lost } = await outcome(pages, start);
  expect(won, "exactly one page shows You are booked").toHaveLength(1);
  expect(lost, "exactly one page shows the apology").toHaveLength(1);
  await expectApology(lost[0]!, start);
  const after = (await dayList(pages[0]!.page, start)).filter(
    (a) => a.start === start,
  );
  expect(after, "exactly one new appointment for that start").toHaveLength(
    before + 1,
  );
  const winner = await read(
    won[0]!.page,
    won[0]!.user,
    idFromUrl(won[0]!.page),
  );
  expect(winner.start).toBe(start);
  expect(winner.technicianId).toBe(TOM);
  return { winner: won[0]!, loser: lost[0]!, winnerAppointment: winner };
}

test("REQ-BOOK-009.AC-1, AC-2, S1: both press Confirm together; one is booked, one gets the apology, one appointment is stored; the loser then books a closest time on other resources", async ({
  context,
}) => {
  const pages = [await racer(context, A, 1440), await racer(context, B, 1440)];
  const start = await contestedStart(pages[0]!.page);
  const { loser, winnerAppointment } = await race(pages, start);

  await loser.page
    .getByRole("radiogroup", { name: "Closest to your time" })
    .getByRole("radio")
    .first()
    .check();
  await confirm(loser.page).click();
  await expect(booked(loser.page)).toBeVisible();
  const second = await read(loser.page, loser.user, idFromUrl(loser.page));
  expect(second.id).not.toBe(winnerAppointment.id);
  if (overlap(second, winnerAppointment)) {
    expect(second.technicianId).not.toBe(winnerAppointment.technicianId);
    expect(second.serviceBayId).not.toBe(winnerAppointment.serviceBayId);
  }
});

test("REQ-BOOK-009 (5 runs): the race on a fresh reset of the demo data five times has exactly one winner every time", async ({
  context,
}) => {
  test.setTimeout(240_000);
  const pages = [await racer(context, A, 1440), await racer(context, B, 1440)];
  const winners: string[] = [];
  for (let run = 1; run <= 5; run += 1) {
    await resetDemo(pages[0]!.page);
    const start = await contestedStart(pages[0]!.page);
    const { winner } = await race(pages, start);
    winners.push(winner.user);
  }
  expect(winners).toHaveLength(5);
});

test("REQ-BOOK-009.AC-5: at a start where two mechanics and two bays are free, both confirmations go through on different technicians and bays", async ({
  context,
}) => {
  const pages = [await racer(context, A, 1440), await racer(context, B, 1440)];
  const contested = await contestedStart(pages[0]!.page);
  // From the data: the first later day with nothing booked at the contested wall time and both mechanics free then.
  let start: string | null = null;
  for (let days = 1; days <= 10 && !start; days += 1) {
    // The same wall time as the contested start (no clock change falls in these days of the data).
    const at10 = plusMinutes(contested, days * 24 * 60);
    const day = await dayList(pages[0]!.page, at10);
    const busy = day.some(
      (a) => a.start < plusMinutes(at10, 60) && at10 < a.end,
    );
    if (
      !busy &&
      (await freeFor(pages[0]!.page, OIL, at10, OLIVER)) &&
      (await freeFor(pages[0]!.page, OIL, at10, AMARA))
    )
      start = at10;
  }
  if (!start)
    throw new Error(
      "No start with two free mechanics and two free bays in the ten days after the seeded EV check.",
    );
  for (const r of pages) await choose(r, OIL, start, 60);
  await Promise.all(pages.map((r) => confirm(r.page).click()));
  for (const r of pages) await expect(booked(r.page)).toBeVisible();
  const [one, two] = await Promise.all(
    pages.map((r) => read(r.page, r.user, idFromUrl(r.page))),
  );
  expect(one!.start).toBe(start);
  expect(two!.start).toBe(start);
  expect(one!.technicianId).not.toBe(two!.technicianId);
  expect(one!.serviceBayId).not.toBe(two!.serviceBayId);
});

test("REQ-BOOK-009.AC-3: the second page confirms the same time one second after the first; it gets the same apology and no second appointment exists", async ({
  context,
}) => {
  const pages = [await racer(context, A, 1440), await racer(context, B, 1440)];
  const start = await contestedStart(pages[0]!.page);
  const before = (await dayList(pages[0]!.page, start)).length;
  for (const r of pages) await choose(r, EV, start, 60);
  await confirm(pages[0]!.page).click();
  await pages[1]!.page.waitForTimeout(1000);
  await confirm(pages[1]!.page).click();
  await expect(booked(pages[0]!.page)).toBeVisible();
  await expectApology(pages[1]!, start);
  expect(await dayList(pages[0]!.page, start)).toHaveLength(before + 1);
});

test("REQ-BOOK-009.AC-4: a double press on Confirm sends one booking request (the page ignores the second press while the first is out) and leaves one appointment", async ({
  context,
}) => {
  const r = await racer(context, A, 1440);
  await recordPosts(r.page);
  const start = await contestedStart(r.page);
  const before = (await dayList(r.page, start)).length;
  await choose(r, EV, start, 60);
  await confirm(r.page).dblclick();
  await expect(booked(r.page)).toBeVisible();
  // The page's own guard drops the second press, so there is exactly one request (and so one key).
  expect(await posts(r.page, "/appointments")).toHaveLength(1);
  expect(await dayList(r.page, start)).toHaveLength(before + 1);
});

test("REQ-BOOK-009.AC-4, S1: the first confirm is stored but its answer is lost (a 500); Try again with the same Idempotency-Key gets the same appointment back, replayed, and one appointment is stored", async ({
  context,
}) => {
  const r = await racer(context, A, 1440);
  // The first booking call reaches the mock and is stored; the page is then handed a 500 instead of the 201
  // (D-0001-64: the fake sits in the page's own fetch, in front of the mock). The real answer is kept.
  await r.page.addInitScript(() => {
    const original = window.fetch.bind(window);
    let faked = false;
    window.fetch = async (input, init) => {
      const request = input instanceof Request ? input : null;
      const url = new URL(request ? request.url : String(input), location.href);
      const method = (request?.method ?? init?.method ?? "GET").toUpperCase();
      const response = await original(input, init);
      if (faked || method !== "POST" || !url.pathname.endsWith("/appointments"))
        return response;
      faked = true;
      (window as unknown as { lost: unknown }).lost = {
        status: response.status,
        body: await response.json(),
      };
      return new Response(
        JSON.stringify({
          type: "about:blank",
          title: "INTERNAL",
          status: 500,
          code: "INTERNAL",
          traceId: "4bf92f35a1b2c3d4e5f60718293a4b5c",
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "X-Trace-Id": "4bf92f35a1b2c3d4e5f60718293a4b5c",
          },
        },
      );
    };
  });
  await recordPosts(r.page);
  await open(r.page, "/");
  const replays = async () => {
    const telemetry = await api<{
      counters: { name: string; value: number }[];
    }>(r.page, MANAGER, "GET", "/_demo/telemetry");
    return telemetry.body.counters
      .filter((c) => c.name === "idempotent_replays_total")
      .reduce((n, c) => n + c.value, 0);
  };
  const start = await contestedStart(r.page);
  const before = (await dayList(r.page, start)).length;
  const replaysBefore = await replays();
  await choose(r, EV, start, 60);
  await confirm(r.page).click();
  await r.page.getByRole("button", { name: "Try again" }).click();
  await expect(booked(r.page)).toBeVisible();
  const lost = await r.page.evaluate(
    () =>
      (window as unknown as { lost: { status: number; body: Appointment } })
        .lost,
  );
  // The first request was really stored (201); its answer never reached the page.
  expect(lost.status).toBe(201);
  const sent = await posts(r.page, "/appointments");
  expect(sent).toHaveLength(2);
  expect(sent[0]!.key).toBe(sent[1]!.key);
  // The retry got the stored appointment back: the confirmation is for the first request's appointment.
  expect(idFromUrl(r.page)).toBe(lost.body.id);
  expect(await replays()).toBe(replaysBefore + 1);
  expect(await dayList(r.page, start)).toHaveLength(before + 1);
});

for (const width of [1440, 390]) {
  test(`race video ${width} wide per side: both on the booking page, both confirm together, one booked and one apology`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(120_000);
    const size = { width, height: width < 640 ? 844 : 900 };
    const context = await browser.newContext({
      viewport: size,
      recordVideo: { dir: testInfo.outputPath("race-video"), size },
    });
    const pages = [
      await racer(context, A, width),
      await racer(context, B, width),
    ];
    const start = await contestedStart(pages[0]!.page);
    for (const r of pages) await choose(r, EV, start, 60, true);
    // Both pages are on the booking page with every choice made: the side-by-side cut starts two seconds before.
    const ready = Date.now();
    await beat(pages[0]!.page, 1500);
    await Promise.all(pages.map((r) => confirm(r.page).click()));
    const { won, lost } = await outcome(pages, start);
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    await expectApology(lost[0]!, start);
    await beat(pages[0]!.page, 3000);
    for (const [i, r] of pages.entries()) {
      const name = `race-${width}-${i === 0 ? "a" : "b"}`;
      noteVideoStart(name, Math.max(0, (ready - r.born) / 1000 - 2));
      await keepVideo(r.page, name);
    }
    await context.close();
  });
}
