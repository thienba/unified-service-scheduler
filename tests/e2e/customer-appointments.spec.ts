// The customer's own appointments in a real browser (C5; REQ-BOOK-012.AC-1..AC-5, REQ-BOOK-003.AC-2,
// REQ-BOOK-009.AC-2/AC-4, SEC-5, SEC-11.AC-4, SEC-17.AC-2, D-0001-22 a/f, D-0001-60 A, D-0001-77 A, NFR-4, NFR-7).
// The clock is fixed at Wed 28 Oct 2026, 10:40 in London and moved with Playwright's clock for the cutoff. Data is
// made by real calls to the mock API from the page. With VIDEO_DIR set, the video test records the main flow.
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  expectNoSidewaysScroll,
  interceptApi,
  openApp,
  pickRole,
  problemBody,
  widths,
} from "./support";
import {
  A,
  B,
  FRI_10,
  LONDON,
  MANAGER,
  NOW,
  STAFF,
  answerFrom,
  api,
  bookAs,
  cancelAs,
  mine,
  posts,
  read,
  recordPosts,
  start,
  switchToB,
} from "./customer-support";

const at = (iso: string) => new Date(iso);
const TUE_13 = "2026-11-03T13:00:00Z";
const h1 = (page: Page, name: string | RegExp) =>
  page.getByRole("heading", { level: 1, name });
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const dialog = (page: Page) => page.getByRole("dialog");
const upcoming = (page: Page) => page.getByRole("region", { name: "Upcoming" });
const earlier = (page: Page) =>
  page.getByRole("region", { name: "Past and cancelled" });

/** Waits until every CSS animation on `box` and inside it has ended, so its boxes no longer move. */
async function settled(box: Locator) {
  await box.evaluate((el) =>
    Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)),
  );
}

/** Staff book new customers at `start` until the time is full (every bay or technician then in use). */
async function fillTime(page: Page, startAt: string) {
  for (let i = 0; i < 4; i += 1) {
    const answer = await api(page, STAFF, "POST", "/appointments", {
      dealershipId: LONDON,
      serviceTypeId: "service-full",
      start: startAt,
      transport: "drop_off",
      newCustomer: {
        name: `Sample Walkin ${i}`,
        phone: `0161 496 099${i}`,
        email: `walkin${i}@example.com`,
      },
      newVehicle: {
        registration: `WK12 IN${i}`,
        make: "Ford",
        model: "Fiesta",
      },
    });
    if (answer.status === 409) return;
    expect(answer.status).toBe(201);
  }
  throw new Error("The time never filled up.");
}

/** Opens `/book` for full service as the page's customer and says whether `chip` is offered on Fri 30 Oct. */
async function offeredOnFriday(page: Page, chip: string) {
  await page.goto(`/book?dealership=${LONDON}&service=service-full`);
  await page.getByRole("radio", { name: /^Fri 30 Oct,/ }).check();
  await expect(
    page.getByRole("heading", { name: "Pick a start time" }),
  ).toBeVisible();
  await expect(page.getByRole("radio").first()).toBeVisible();
  return page.getByRole("radio", { name: chip, exact: true }).count();
}

test.describe("my-appointments", () => {
  test("REQ-BOOK-012.AC-1, SEC-5.AC-4: two customers with appointments on one day each see only their own, also after a reload", async ({
    page,
  }) => {
    await start(page, 1440, "/appointments");
    const ownA = await bookAs(page, A, FRI_10);
    const ownB = await bookAs(page, B, "2026-10-30T13:15:00Z");
    for (const who of ["A", "B"] as const) {
      if (who === "B") await switchToB(page);
      await page.goto("/appointments");
      await expect(upcoming(page).getByRole("article").first()).toBeVisible();
      const expected = (await mine(page, who === "A" ? A : B)).map((a) => a.id);
      const shown = await page
        .getByRole("main")
        .getByRole("link", { name: "View details" })
        .evaluateAll((links) =>
          links.map((l) => l.getAttribute("href")!.split("/").pop()),
        );
      expect(shown.sort()).toEqual(expected.sort());
      expect(shown).toContain(who === "A" ? ownA.id : ownB.id);
      expect(shown).not.toContain(who === "A" ? ownB.id : ownA.id);
      // REQ-BOOK-003.AC-2: a reload shows the same list.
      await page.reload();
      await expect(
        page.getByRole("main").getByRole("link", { name: "View details" }),
      ).toHaveCount(expected.length);
    }
  });

  test("a card shows the date line, time, badges, service, car, dealership and technician, with no bay; the first date is the largest", async ({
    page,
  }) => {
    await start(page, 1440, "/appointments");
    await bookAs(page, A, FRI_10);
    await page.reload();
    const cards = upcoming(page).getByRole("article");
    await expect(cards).toHaveCount(2);
    const first = cards.first();
    await expect(
      first.getByRole("link", { name: /^Fri 30 Oct\s*10:00 to 13:00$/ }),
    ).toBeVisible();
    for (const word of [
      "Confirmed",
      "Drop-off",
      "Service",
      "Car",
      "Dealership",
      "Technician",
      "Full service",
      "Fakeford Motors (demo)",
    ]) {
      await expect(first.getByText(word, { exact: true })).toBeVisible();
    }
    await expect(first.getByText(/bay/i)).toHaveCount(0);
    for (const name of ["View details", "Reschedule", "Cancel appointment"]) {
      await expect(
        first.getByRole(
          name === "View details" || name === "Reschedule" ? "link" : "button",
          { name },
        ),
      ).toBeVisible();
    }
    const size = (i: number) =>
      cards
        .nth(i)
        .locator("h3 a > span")
        .first()
        .evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    expect(await size(0)).toBeGreaterThan(await size(1));
    // Today's appointment reads "Today, …".
    await page.clock.setFixedTime(at("2026-10-30T07:00:00Z"));
    await page.reload();
    await expect(
      upcoming(page).getByRole("link", { name: /^Today, Fri 30 Oct/ }),
    ).toBeVisible();
  });

  test("REQ-BOOK-012.AC-4, D-0001-25 A: inside the change window a card has the sentence and the phone, and no Reschedule or Cancel", async ({
    page,
  }) => {
    await start(page, 1440, "/appointments");
    await bookAs(page, A, FRI_10);
    await page.clock.setFixedTime(at("2026-10-30T08:01:00Z"));
    await page.reload();
    const card = upcoming(page).getByRole("article").first();
    await expect(
      card.getByText(
        "It is too close to the start to change online. Contact Fakeford Motors (demo).",
      ),
    ).toBeVisible();
    await expect(
      card.getByRole("link", { name: /^Call \+44 1632 960 123/ }),
    ).toHaveAttribute("href", "tel:+441632960123");
    await expect(card.getByRole("link", { name: "Reschedule" })).toHaveCount(0);
    await expect(
      card.getByRole("button", { name: "Cancel appointment" }),
    ).toHaveCount(0);
  });

  test("Past and cancelled shows the latest 10, then Show earlier", async ({
    page,
  }) => {
    await start(page, 1440, "/appointments");
    for (let i = 0; i < 11; i += 1) {
      const day = i < 6 ? "2026-11-03" : "2026-11-04";
      const hour = String(8 + (i % 6)).padStart(2, "0");
      const booked = await bookAs(page, A, `${day}T${hour}:00:00Z`, {
        service: "service-oil-change",
      });
      await cancelAs(page, A, booked.id);
    }
    await page.reload();
    const cards = earlier(page).getByRole("article");
    await expect(cards).toHaveCount(10);
    // Newest first: the first is Wed 4 Nov 12:00, the last shown Tue 3 Nov 09:00.
    await expect(cards.first().getByRole("link").first()).toHaveAccessibleName(
      /^Wed 4 Nov\s*12:00/,
    );
    await button(page, "Show earlier").click();
    await expect(cards).toHaveCount(11);
    await expect(button(page, "Show earlier")).toHaveCount(0);
  });

  test("with nothing upcoming the list says so; staff on /appointments get the no-permission words", async ({
    page,
  }) => {
    await start(page, 1440, "/appointments");
    for (const a of await mine(page, A)) await cancelAs(page, A, a.id);
    await page.reload();
    await expect(
      upcoming(page).getByText(
        "You have nothing booked at the moment. Use Book a service to pick a time.",
      ),
    ).toBeVisible();
    await pickRole(page, "Staff");
    await page.goto("/appointments");
    await expect(h1(page, "You cannot do that as Staff.")).toBeVisible();
    await expect(
      page.getByText(
        "My appointments lists a customer's own bookings, so it is only for customers. Staff see appointments on the schedule. Switch role, or go to your schedule.",
      ),
    ).toBeVisible();
  });
});

test.describe("cancel", () => {
  test("REQ-BOOK-012.AC-1: the dialog, one POST, Cancelling…, the card moves, the toast, and the time is offered to customer B", async ({
    page,
  }) => {
    await start(page, 1440, "/appointments");
    const fri = await bookAs(page, A, FRI_10);
    await fillTime(page, FRI_10);
    await switchToB(page);
    expect(await offeredOnFriday(page, "10:00 to 13:00")).toBe(0);
    await page.getByLabel("Who").selectOption({ label: "Demo Customer A" });
    await expect(page.getByLabel("Who")).toHaveValue(A);

    const slow = await page.context().newPage();
    await interceptApi(slow, { path: "/cancel", delayMs: 1500 });
    await recordPosts(slow);
    await slow.setViewportSize({ width: 1440, height: 900 });
    await slow.clock.setFixedTime(NOW);
    await slow.goto("/appointments");
    const card = upcoming(slow)
      .getByRole("article")
      .filter({ hasText: "Fri 30 Oct" });
    const opener = card.getByRole("button", { name: "Cancel appointment" });
    await opener.click();
    const box = dialog(slow);
    await expect(
      box.getByRole("heading", { name: "Cancel this appointment?" }),
    ).toBeVisible();
    await expect(
      box.getByText(
        "Full service on Fri 30 Oct, 10:00 to 13:00 for your Demo Motors Hatch (AB00 DMA) at Fakeford Motors (demo).",
      ),
    ).toBeVisible();
    await expect(
      box.getByText(
        "The time will be free for other customers. We will send you a message to confirm, and your reminders are cancelled. You can book again at any time.",
      ),
    ).toBeVisible();
    await expect(
      box.getByRole("button", { name: "Keep appointment" }),
    ).toBeFocused();
    // Escape closes it and focus goes back to the opener; the scrim does not close it.
    await slow.keyboard.press("Escape");
    await expect(box).toHaveCount(0);
    await expect(opener).toBeFocused();
    await opener.click();
    await slow.mouse.click(5, 5);
    await expect(box).toBeVisible();
    await box.getByRole("button", { name: "Cancel appointment" }).click();
    await expect(
      box.getByRole("button", { name: /Cancelling…/ }),
    ).toHaveAttribute("aria-busy", "true");
    await expect(
      box.getByRole("button", { name: "Keep appointment" }),
    ).toBeDisabled();
    await expect(box.getByRole("button", { name: "Close" })).toBeDisabled();
    await slow.keyboard.press("Escape");
    await expect(box).toBeVisible();
    await expect(
      slow.getByText("Appointment cancelled. The time is free again."),
    ).toBeVisible();
    expect(await posts(slow, `/appointments/${fri.id}/cancel`)).toHaveLength(1);
    await expect(
      upcoming(slow).getByRole("article").filter({ hasText: "Fri 30 Oct" }),
    ).toHaveCount(0);
    await expect(
      earlier(slow)
        .getByRole("article")
        .filter({ hasText: "Fri 30 Oct" })
        .getByText("Cancelled", { exact: true }),
    ).toBeVisible();
    expect((await read(slow, A, fri.id)).body.status).toBe("cancelled");

    // The technician, bay and car are free again: customer B is offered that start.
    await switchToB(page);
    expect(await offeredOnFriday(page, "10:00 to 13:00")).toBe(1);
  });

  test("the cancelled page: badge, sunken facts, no actions, the line and Book a service", async ({
    page,
  }) => {
    await start(page, 1440, "/appointments");
    const fri = await bookAs(page, A, FRI_10);
    await page.clock.setFixedTime(at("2026-10-28T10:41:00Z"));
    await cancelAs(page, A, fri.id);
    await page.goto(`/appointments/${fri.id}`);
    await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        "Cancelled on Wed 28 Oct, 10:41. The time is free for other customers.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("main").getByRole("link", { name: "Book a service" }),
    ).toBeVisible();
    await expect(
      page.getByRole("main").getByRole("link", { name: "Reschedule" }),
    ).toHaveCount(0);
    await expect(button(page, "Cancel appointment")).toHaveCount(0);
  });

  test("cancel-error: a 500 keeps the dialog open with Keep appointment and Try again", async ({
    page,
  }) => {
    await interceptApi(page, {
      path: "/cancel",
      status: 500,
      body: problemBody(500, "INTERNAL"),
    });
    await start(page, 1440, "/appointments");
    const fri = await bookAs(page, A, FRI_10);
    await page.goto(`/appointments/${fri.id}`);
    await button(page, "Cancel appointment").click();
    await dialog(page)
      .getByRole("button", { name: "Cancel appointment" })
      .click();
    await expect(
      dialog(page).getByRole("heading", { name: "We could not cancel it." }),
    ).toBeVisible();
    await expect(
      dialog(page).getByText(
        "Something went wrong on our side. Your appointment is still booked. Try again; if it keeps happening, quote reference 4bf92f35.",
      ),
    ).toBeVisible();
    await expect(
      dialog(page).getByRole("button", { name: "Keep appointment" }),
    ).toBeEnabled();
    await expect(
      dialog(page).getByRole("button", { name: "Try again" }),
    ).toBeVisible();
    expect((await read(page, A, fri.id)).body.cancelledAt).toBeNull();
  });

  test("a second cancel from another tab answers the same cancelled appointment, shown without an error", async ({
    page,
  }) => {
    await start(page, 1440, "/appointments");
    const fri = await bookAs(page, A, FRI_10);
    await page.goto(`/appointments/${fri.id}`);
    const other = await page.context().newPage();
    await other.setViewportSize({ width: 1440, height: 900 });
    await other.clock.setFixedTime(NOW);
    await other.goto(`/appointments/${fri.id}`);
    await button(other, "Cancel appointment").click();
    await dialog(other)
      .getByRole("button", { name: "Cancel appointment" })
      .click();
    await expect(other.getByText(/^Cancelled on /)).toBeVisible();

    await page.bringToFront();
    await button(page, "Cancel appointment").click();
    await dialog(page)
      .getByRole("button", { name: "Cancel appointment" })
      .click();
    await expect(page.getByText(/^Cancelled on /)).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("We could not cancel it.")).toHaveCount(0);
  });
});

test.describe("reschedule", () => {
  test("REQ-BOOK-012.AC-2: the own day, the info panel, Your time, the summary and the Confirm words", async ({
    page,
  }) => {
    await start(page, 1440, "/appointments");
    const fri = await bookAs(page, A, FRI_10);
    await page.goto(`/appointments/${fri.id}/reschedule`);
    await expect(
      page.getByRole("radio", { name: /^Fri 30 Oct,/ }),
    ).toBeChecked();
    await expect(
      page.getByText(
        "Right now you are booked for Fri 30 Oct, 10:00 to 13:00. If the new time is taken before you confirm, nothing changes.",
      ),
    ).toBeVisible();
    const own = page.getByRole("radio", { name: "10:00, your time" });
    await expect(own).toBeDisabled();
    const ownText = page
      .locator("label", { has: own })
      .getByText("10:00", { exact: true });
    expect(
      await ownText.evaluate((e) => getComputedStyle(e).textDecorationLine),
    ).not.toContain("line-through");
    const summary = page.getByRole("complementary", {
      name: "Moving your appointment",
    });
    await expect(
      summary.getByText("Current time", { exact: true }),
    ).toBeVisible();
    await expect(
      summary.getByText("Kept until the new time is confirmed"),
    ).toBeVisible();
    await expect(summary.getByText("New time", { exact: true })).toBeVisible();
    await expect(summary.getByText("This stays the same")).toHaveCount(4);
    await expect(
      page.getByRole("radio", { name: /Wait on site|Drop it off/ }),
    ).toHaveCount(0);
    await expect(button(page, "Pick a new time to confirm")).toBeDisabled();
    await page.getByRole("radio", { name: /^Tue 3 Nov,/ }).check();
    await page
      .getByRole("radio", { name: "13:00 to 16:00", exact: true })
      .check();
    await expect(button(page, "Confirm new time")).toBeEnabled();
  });

  test("REQ-BOOK-012.AC-2, REQ-BOOK-009.AC-4: one POST for a double press, same id, new time, toast; the old time stays until the answer, then is offered again", async ({
    page,
  }) => {
    await start(page, 1440, "/appointments");
    const fri = await bookAs(page, A, FRI_10);
    await fillTime(page, FRI_10);

    const mover = await page.context().newPage();
    await interceptApi(mover, { path: "/reschedule", delayMs: 2500 });
    await recordPosts(mover);
    await mover.setViewportSize({ width: 1440, height: 900 });
    await mover.clock.setFixedTime(NOW);
    await mover.goto(`/appointments/${fri.id}/reschedule`);
    await mover.getByRole("radio", { name: /^Tue 3 Nov,/ }).check();
    await mover
      .getByRole("radio", { name: "13:00 to 16:00", exact: true })
      .check();
    await button(mover, "Confirm new time").click();
    const busy = mover.getByRole("button", { name: /Confirming…/ });
    await expect(busy).toBeVisible();
    await busy.click({ force: true });
    // Before the answer arrives, the appointment still has its old time.
    expect((await read(page, A, fri.id)).body.start).toBe(FRI_10);
    await expect(
      mover.getByText(
        "Appointment moved to Tue 3 Nov, 13:00. The old time is free again.",
      ),
    ).toBeVisible({ timeout: 8000 });
    await expect(h1(mover, "Tue 3 Nov, 13:00 to 16:00")).toBeVisible();
    expect(new URL(mover.url()).pathname).toBe(`/appointments/${fri.id}`);
    expect(
      await posts(mover, `/appointments/${fri.id}/reschedule`),
    ).toHaveLength(1);
    const moved = (await read(page, A, fri.id)).body;
    expect(moved.id).toBe(fri.id);
    expect(moved.start).toBe(TUE_13);

    await switchToB(page);
    expect(await offeredOnFriday(page, "10:00 to 13:00")).toBe(1);
  });

  test("REQ-BOOK-012.AC-3: another customer takes the time first; the appointment is unchanged, the day and choices stay, the closest times are offered", async ({
    page,
  }) => {
    await start(page, 1440, "/appointments");
    const fri = await bookAs(page, A, FRI_10);
    await page.goto(`/appointments/${fri.id}/reschedule`);
    await page.getByRole("radio", { name: /^Mon 2 Nov,/ }).check();
    await page
      .getByRole("radio", { name: "13:00 to 16:00", exact: true })
      .check();
    await bookAs(page, B, "2026-11-02T13:00:00Z");
    await button(page, "Confirm new time").click();
    const sorry = page.getByRole("heading", {
      name: "Sorry, 13:00 on Mon 2 Nov was just taken.",
    });
    await expect(sorry).toBeFocused();
    await expect(
      page.getByText(
        "Another customer confirmed that time a moment before you. Your appointment has not changed: it is still on Fri 30 Oct, 10:00 to 13:00. Pick another time and confirm again.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("radio", { name: /^Mon 2 Nov,/ }),
    ).toBeChecked();
    await expect(
      page.getByRole("radio", { name: "13:00, just taken" }),
    ).toBeDisabled();
    await expect(
      page
        .getByRole("radiogroup", { name: "Closest to your time" })
        .getByRole("radio")
        .first(),
    ).toBeVisible();
    const unchanged = (await read(page, A, fri.id)).body;
    expect(unchanged.start).toBe(FRI_10);
    expect(unchanged.version).toBe(fri.version);
  });

  test("REQ-BOOK-009.AC-4: confirm-error says nothing changed, and Try again sends the same Idempotency-Key", async ({
    page,
  }) => {
    await answerFrom(page, {
      path: "/reschedule",
      method: "POST",
      from: 1,
      times: 1,
      status: 500,
      body: problemBody(500, "INTERNAL"),
    });
    await recordPosts(page);
    await start(page, 1440, "/appointments");
    const fri = await bookAs(page, A, FRI_10);
    await page.goto(`/appointments/${fri.id}/reschedule`);
    await page.getByRole("radio", { name: /^Tue 3 Nov,/ }).check();
    await page
      .getByRole("radio", { name: "13:00 to 16:00", exact: true })
      .check();
    await button(page, "Confirm new time").click();
    await expect(
      page.getByText(
        "Your appointment has not changed. Try again; if it keeps happening, quote reference 4bf92f35.",
      ),
    ).toBeVisible();
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(h1(page, "Tue 3 Nov, 13:00 to 16:00")).toBeVisible();
    const sent = await posts(page, `/appointments/${fri.id}/reschedule`);
    expect(sent).toHaveLength(2);
    expect(sent[0]!.key).not.toBe("");
    expect(sent[1]!.key).toBe(sent[0]!.key);
  });

  test("the times are locked while a confirm is on its way; after a failure, Try again sends the time shown, under a new key when it changed", async ({
    page,
  }) => {
    await answerFrom(page, {
      path: "/reschedule",
      method: "POST",
      from: 1,
      times: 1,
      status: 500,
      body: problemBody(500, "INTERNAL"),
    });
    await interceptApi(page, { path: "/reschedule", delayMs: 1500 });
    await recordPosts(page);
    await start(page, 1440, "/appointments");
    const fri = await bookAs(page, A, FRI_10);
    await page.goto(`/appointments/${fri.id}/reschedule`);
    await page.getByRole("radio", { name: /^Tue 3 Nov,/ }).check();
    const first = page.getByRole("radio", {
      name: "13:00 to 16:00",
      exact: true,
    });
    const other = page.getByRole("radio", {
      name: "14:00 to 17:00",
      exact: true,
    });
    await first.check();
    await button(page, "Confirm new time").click();
    await expect(
      page.getByRole("button", { name: /Confirming…/ }).first(),
    ).toBeVisible();
    await expect(first).toBeDisabled();
    await expect(other).toBeDisabled();
    await expect(
      page.getByText(/^Your appointment has not changed\. Try again/),
    ).toBeVisible();
    await expect(other).toBeEnabled();
    await other.check();
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(h1(page, "Tue 3 Nov, 14:00 to 17:00")).toBeVisible({
      timeout: 8000,
    });
    expect((await read(page, A, fri.id)).body.start).toBe(
      "2026-11-03T14:00:00Z",
    );
    const sent = await posts(page, `/appointments/${fri.id}/reschedule`);
    expect(sent).toHaveLength(2);
    expect(sent[1]!.key).not.toBe(sent[0]!.key);
  });

  test("Q-0001-236 B: on the appointment's own day with no other time free, the grid keeps Your time and says nothing else is left", async ({
    page,
  }) => {
    await answerFrom(page, {
      path: "/availability",
      query: "date=2026-10-30",
      from: 2,
      status: 200,
      body: {
        date: "2026-10-30",
        timeZone: "Europe/London",
        gridMinutes: 15,
        slots: [],
      },
    });
    await start(page, 1440, "/appointments");
    const fri = await bookAs(page, A, FRI_10);
    await page.goto(`/appointments/${fri.id}/reschedule`);
    await expect(
      page.getByRole("radio", { name: /^Fri 30 Oct,/ }),
    ).toBeChecked();
    // Choosing the day by hand asks again, and this answer has no times left.
    await page.getByRole("radio", { name: /^Mon 2 Nov,/ }).check();
    // A click, not check(): the empty answer turns the day Fully booked (not checked), and check() fails when
    // that answer lands before it reads the radio back. The lines below wait for the outcome.
    await page.getByRole("radio", { name: /^Fri 30 Oct,/ }).click();
    await expect(
      page.getByRole("radio", { name: /^Fri 30 Oct, fully booked/i }),
    ).toBeVisible();
    await expect(
      page.getByText("No other times are left on Fri 30 Oct."),
    ).toBeVisible();
    await expect(
      page.getByRole("radio", { name: "10:00, your time" }),
    ).toBeDisabled();
    await expect(page.getByText(/Someone booked the last one/)).toHaveCount(0);
  });

  test("after a move, Back goes to where the customer came from, not to the finished reschedule screen", async ({
    page,
  }) => {
    await start(page, 1440, "/appointments");
    const fri = await bookAs(page, A, FRI_10);
    await page.goto("/appointments");
    await upcoming(page)
      .getByRole("article")
      .filter({ hasText: "Fri 30 Oct" })
      .getByRole("link", { name: "Reschedule" })
      .click();
    await page.getByRole("radio", { name: /^Tue 3 Nov,/ }).check();
    await page
      .getByRole("radio", { name: "13:00 to 16:00", exact: true })
      .check();
    await button(page, "Confirm new time").click();
    await expect(h1(page, "Tue 3 Nov, 13:00 to 16:00")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(`/appointments/${fri.id}`);
    await page.goBack();
    await expect(h1(page, "My appointments")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/appointments");
  });

  test("D-0001-60 A, D-0001-39 B: a reschedule link of a cancelled appointment, and a 409 ALREADY_CANCELLED on confirm, show the cancelled page with one quiet line", async ({
    page,
  }) => {
    await start(page, 1440, "/appointments");
    const first = await bookAs(page, A, FRI_10);
    await cancelAs(page, A, first.id);
    await page.goto(`/appointments/${first.id}/reschedule`);
    await expect(
      page.getByText("This appointment was cancelled, so it cannot be moved."),
    ).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(`/appointments/${first.id}`);
    await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();

    const second = await bookAs(page, A, "2026-10-30T13:15:00Z");
    await page.goto(`/appointments/${second.id}/reschedule`);
    await page.getByRole("radio", { name: /^Tue 3 Nov,/ }).check();
    await page
      .getByRole("radio", { name: "13:00 to 16:00", exact: true })
      .check();
    await cancelAs(page, A, second.id);
    await button(page, "Confirm new time").click();
    await expect(
      page.getByText("This appointment was cancelled, so it cannot be moved."),
    ).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(`/appointments/${second.id}`);
  });
});

test.describe("after the cutoff (D-0001-22 a)", () => {
  test("at start minus lead time exactly, Cancel and Reschedule still work", async ({
    page,
  }) => {
    await start(page, 1440, "/appointments");
    const fri = await bookAs(page, A, FRI_10);
    const thu = await bookAs(page, A, "2026-10-29T14:00:00Z");
    await page.clock.setFixedTime(at("2026-10-30T08:00:00Z"));
    await page.goto(`/appointments/${fri.id}`);
    await button(page, "Cancel appointment").click();
    await dialog(page)
      .getByRole("button", { name: "Cancel appointment" })
      .click();
    await expect(page.getByText(/^Cancelled on /)).toBeVisible();

    await page.clock.setFixedTime(at("2026-10-29T12:00:00Z"));
    await page.goto(`/appointments/${thu.id}`);
    await page
      .getByRole("main")
      .getByRole("link", { name: "Reschedule" })
      .click();
    await expect(
      h1(page, "Choose a new time for your full service"),
    ).toBeVisible();
    await page.getByRole("radio", { name: /^Tue 3 Nov,/ }).check();
    await page
      .getByRole("radio", { name: "13:00 to 16:00", exact: true })
      .check();
    await button(page, "Confirm new time").click();
    await expect(h1(page, "Tue 3 Nov, 13:00 to 16:00")).toBeVisible();
  });

  test("one minute later the appointment page is change-closed and the reschedule route says the same, with one way back", async ({
    page,
  }) => {
    await start(page, 1440, "/appointments");
    const fri = await bookAs(page, A, FRI_10);
    await page.clock.setFixedTime(at("2026-10-30T08:01:00Z"));
    await page.goto(`/appointments/${fri.id}`);
    await expect(
      page.getByRole("heading", {
        name: "This appointment can no longer be changed online.",
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "It starts in less than 2 hours. Contact Fakeford Motors (demo) to change it.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("main").getByRole("link", { name: /^Call / }),
    ).toHaveAttribute("href", /^tel:/);
    await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);
    await expect(
      page.getByRole("main").getByRole("link", { name: "Reschedule" }),
    ).toHaveCount(0);

    await page.goto(`/appointments/${fri.id}/reschedule`);
    await expect(
      h1(page, "This appointment can no longer be changed online."),
    ).toBeVisible();
    await expect(
      page.getByText(/Your appointment has not changed\.$/),
    ).toBeVisible();
    const main = page.getByRole("main");
    await expect(main.getByRole("radio")).toHaveCount(0);
    await main
      .getByRole("link", { name: "Back to the appointment" })
      .last()
      .click();
    expect(new URL(page.url()).pathname).toBe(`/appointments/${fri.id}`);
  });

  test("cancel-refused: the cutoff passes while the dialog is open; nothing was cancelled", async ({
    page,
  }) => {
    await start(page, 1440, "/appointments");
    const thu = await bookAs(page, A, "2026-10-29T14:00:00Z");
    await page.clock.setFixedTime(at("2026-10-29T11:59:00Z"));
    await page.goto(`/appointments/${thu.id}`);
    await button(page, "Cancel appointment").click();
    await page.clock.setFixedTime(at("2026-10-29T12:01:00Z"));
    await dialog(page)
      .getByRole("button", { name: "Cancel appointment" })
      .click();
    await expect(
      dialog(page).getByRole("heading", {
        name: "This appointment can no longer be changed online.",
      }),
    ).toBeVisible();
    await expect(
      dialog(page).getByText("Nothing was cancelled."),
    ).toBeVisible();
    await expect(
      dialog(page).getByText("Close", { exact: true }),
    ).toBeFocused();
    await dialog(page).getByText("Close", { exact: true }).click();
    await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);
    // The buttons that opened the dialog are gone: focus is on the title, not lost to the page (WCAG 2.4.3).
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
    expect((await read(page, A, thu.id)).body.cancelledAt).toBeNull();
  });

  test("WCAG 2.4.3: after a cancel or a refusal the opener is gone, so focus goes to the title or the card, never the page", async ({
    page,
  }) => {
    await start(page, 1440, "/appointments");
    const fri = await bookAs(page, A, FRI_10);
    const thu = await bookAs(page, A, "2026-10-29T14:00:00Z");
    const notBody = () =>
      expect
        .poll(() => page.evaluate(() => document.activeElement?.tagName))
        .not.toBe("BODY");

    // The appointment page: the title.
    await page.goto(`/appointments/${fri.id}`);
    await button(page, "Cancel appointment").click();
    await dialog(page)
      .getByRole("button", { name: "Cancel appointment" })
      .click();
    await expect(page.getByText(/^Cancelled on /)).toBeVisible();
    await expect(h1(page, /Fri 30 Oct/)).toBeFocused();
    await notBody();

    // The list after a refusal: the card stays in Upcoming without its buttons; focus is on its date link.
    const again = await bookAs(page, A, FRI_10);
    await page.clock.setFixedTime(at("2026-10-29T11:59:00Z"));
    await page.goto("/appointments");
    const thuCard = upcoming(page)
      .getByRole("article")
      .filter({ hasText: "Thu 29 Oct" });
    await thuCard.getByRole("button", { name: "Cancel appointment" }).click();
    await page.clock.setFixedTime(at("2026-10-29T12:01:00Z"));
    await dialog(page)
      .getByRole("button", { name: "Cancel appointment" })
      .click();
    await dialog(page).getByText("Close", { exact: true }).click();
    await expect(
      thuCard.getByRole("button", { name: "Cancel appointment" }),
    ).toHaveCount(0);
    await expect(thuCard.getByRole("heading").getByRole("link")).toBeFocused();
    await notBody();
    expect((await read(page, A, thu.id)).body.cancelledAt).toBeNull();

    // The list after a cancel: the card moves to Past and cancelled, and focus follows it.
    await page.clock.setFixedTime(NOW);
    await page.goto("/appointments");
    await upcoming(page)
      .getByRole("article")
      .filter({ hasText: "Fri 30 Oct" })
      .getByRole("button", { name: "Cancel appointment" })
      .click();
    await dialog(page)
      .getByRole("button", { name: "Cancel appointment" })
      .click();
    const moved = earlier(page).locator(`[href="/appointments/${again.id}"]`);
    await expect(moved.first()).toBeFocused();
    await notBody();
  });
});

test.describe("the message links (D-0001-22 f, D-0001-77 A, SEC-17.AC-2, SEC-11.AC-4)", () => {
  async function linksOf(page: Page, appointmentId: string) {
    const answer = await api(
      page,
      MANAGER,
      "GET",
      `/outbox?appointmentId=${appointmentId}`,
    );
    const confirmation = (
      answer.body as {
        kind: string;
        links: { cancel: string; reschedule: string };
      }[]
    ).find((m) => m.kind === "confirmation")!;
    return confirmation.links;
  }

  test("the owner opens the appointment and the reschedule screen; nobody picked sees signed-out; another customer sees not-found; staff and managers see no-permission on reschedule", async ({
    page,
    browser,
  }) => {
    await start(page, 1440, "/appointments");
    const fri = await bookAs(page, A, FRI_10);
    const links = await linksOf(page, fri.id);
    const origin = new URL(page.url()).origin;
    expect(links.cancel).toBe(`${origin}/appointments/${fri.id}`);
    expect(links.reschedule).toBe(
      `${origin}/appointments/${fri.id}/reschedule`,
    );

    await page.goto(links.cancel);
    await expect(h1(page, "Fri 30 Oct, 10:00 to 13:00")).toBeVisible();
    await expect(button(page, "Cancel appointment")).toBeVisible();
    await page.goto(links.reschedule);
    await expect(
      h1(page, "Choose a new time for your full service"),
    ).toBeVisible();

    await switchToB(page);
    for (const link of [links.cancel, links.reschedule]) {
      await page.goto(link);
      await expect(h1(page, "We cannot find that appointment.")).toBeVisible();
    }

    for (const role of ["Staff", "Manager"] as const) {
      await pickRole(page, role);
      await page.goto(links.reschedule);
      await expect(h1(page, `You cannot do that as ${role}.`)).toBeVisible();
      await expect(
        page.getByText("Only customers can move their own appointments.", {
          exact: false,
        }),
      ).toBeVisible();
    }

    // A fresh browser with nobody picked: the storage holds no user, so both links say signed out.
    const fresh = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const stranger = await fresh.newPage();
    await stranger.clock.setFixedTime(NOW);
    for (const link of [links.cancel, links.reschedule]) {
      await stranger.goto(new URL(link).pathname);
      await expect(h1(stranger, "You are not signed in.")).toBeVisible();
    }
    await fresh.close();
  });
});

test.describe("other customers (REQ-BOOK-012.AC-5, SEC-5.AC-1, AC-2)", () => {
  test("A sees not-found for B's appointment and its reschedule link, word for word as a random id, also after B's cutoff", async ({
    page,
  }) => {
    await start(page, 1440, "/appointments");
    const theirs = (await mine(page, B))[0]!;
    const textOf = async (address: string) => {
      await page.goto(address);
      await expect(h1(page, "We cannot find that appointment.")).toBeVisible();
      return {
        text: await page.getByRole("main").innerText(),
        title: await page.title(),
        buttons: await page.getByRole("main").getByRole("link").allInnerTexts(),
      };
    };
    for (const suffix of ["", "/reschedule"]) {
      const random = await textOf(
        `/appointments/appointment-random-unused${suffix}`,
      );
      expect(await textOf(`/appointments/${theirs.id}${suffix}`)).toEqual(
        random,
      );
      // After B's cutoff the owner check still comes first: never change-closed for A.
      await page.clock.setFixedTime(
        new Date(Date.parse(theirs.start) - 30 * 60_000),
      );
      expect(await textOf(`/appointments/${theirs.id}${suffix}`)).toEqual(
        random,
      );
      await page.clock.setFixedTime(NOW);
    }
  });
});

test.describe("NFR-4, NFR-7", () => {
  test("the dialog keeps Tab inside; the sheet below 640 has the danger button on top", async ({
    page,
  }) => {
    await start(page, 390, "/appointments");
    const fri = await bookAs(page, A, FRI_10);
    await page.goto(`/appointments/${fri.id}`);
    await button(page, "Cancel appointment").click();
    const box = dialog(page);
    const keep = box.getByRole("button", { name: "Keep appointment" });
    const danger = box.getByRole("button", { name: "Cancel appointment" });
    await expect(keep).toBeFocused();
    // The sheet rises in with a CSS animation (the fake clock does not stop it): measure once it has ended.
    await settled(box);
    expect((await danger.boundingBox())!.y).toBeLessThan(
      (await keep.boundingBox())!.y,
    );
    const sheet = (await box.boundingBox())!;
    expect(sheet.y + sheet.height).toBeGreaterThan(880);
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press("Tab");
      expect(
        await box.evaluate((d) => d.contains(document.activeElement)),
      ).toBe(true);
    }
  });

  test("the ActionBar shows below 768 only and never covers a focused control", async ({
    page,
  }) => {
    await start(page, 390, "/appointments");
    const fri = await bookAs(page, A, FRI_10);
    await page.goto(`/appointments/${fri.id}`);
    const bar = page.getByRole("button", { name: "Cancel appointment" });
    await expect(bar).toBeVisible();
    // Tab to the phone link under the facts: it is scrolled clear of the bar.
    const call = page.getByRole("main").getByRole("link", { name: /^Call / });
    await call.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    const link = (await call.boundingBox())!;
    const barBox = (await bar.boundingBox())!;
    expect(link.y + link.height).toBeLessThanOrEqual(barBox.y);

    await page.setViewportSize({ width: 768, height: 900 });
    await expect(
      page.getByRole("complementary", { name: "Change this appointment" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Cancel appointment" }),
    ).toHaveCount(1);
    const side = page.getByRole("complementary", {
      name: "Change this appointment",
    });
    await expect(
      side.getByRole("button", { name: "Cancel appointment" }),
    ).toBeVisible();
  });

  test("no sideways scroll at 320 to 1440; cards one column on a phone and two from 640; targets at least 44 px", async ({
    page,
  }) => {
    await start(page, 1440, "/appointments");
    const fri = await bookAs(page, A, FRI_10);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      for (const address of [
        "/appointments",
        `/appointments/${fri.id}`,
        `/appointments/${fri.id}/reschedule`,
      ]) {
        await page.goto(address);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(
          page
            .getByRole("main")
            .getByRole("button")
            .or(page.getByRole("main").getByRole("link"))
            .first(),
        ).toBeVisible();
        await expectNoSidewaysScroll(page);
        const small = await page
          .getByRole("main")
          .locator("a, button, input[type=radio]")
          .evaluateAll((els) =>
            els
              .filter((e) => (e as HTMLElement).offsetParent !== null)
              .map((e) => {
                const target = e.tagName === "INPUT" ? e.parentElement! : e;
                const r = target.getBoundingClientRect();
                return {
                  name: e.textContent?.trim() || e.getAttribute("aria-label"),
                  w: r.width,
                  h: r.height,
                };
              })
              .filter((r) => r.h < 44 || r.w < 44),
          );
        expect(small, `${address} at ${width}`).toEqual([]);
      }
      await page.goto("/appointments");
      const cards = upcoming(page).getByRole("article");
      await expect(cards).toHaveCount(2);
      const [one, two] = [
        (await cards.nth(0).boundingBox())!,
        (await cards.nth(1).boundingBox())!,
      ];
      if (width < 640) expect(two.y).toBeGreaterThan(one.y + one.height - 1);
      else expect(Math.abs(two.y - one.y)).toBeLessThan(1);
    }
  });
});

test("video: a customer cancels one appointment, reschedules another, and opens the cancel link of a message", async ({
  browser,
}) => {
  const dir = process.env["VIDEO_DIR"];
  test.skip(!dir, "VIDEO_DIR is not set");
  test.setTimeout(120_000);
  const size = { width: 1280, height: 800 };
  const context = await browser.newContext({
    viewport: size,
    recordVideo: { dir: dir!, size },
  });
  const page = await context.newPage();
  const pause = (ms = 900) => page.waitForTimeout(ms);
  await page.clock.setFixedTime(NOW);
  await openApp(page);
  await pickRole(page, "Customer");
  const fri = await bookAs(page, A, FRI_10);
  await page.goto("/appointments");
  await pause(1500);

  // Cancel the seeded Saturday appointment from its card.
  const sat = upcoming(page)
    .getByRole("article")
    .filter({ hasText: "Sat 31 Oct" });
  await sat.getByRole("button", { name: "Cancel appointment" }).click();
  await pause(1500);
  await dialog(page)
    .getByRole("button", { name: "Cancel appointment" })
    .click();
  await expect(
    page.getByText("Appointment cancelled. The time is free again."),
  ).toBeVisible();
  await pause(2000);

  // Reschedule Friday's to Tuesday 13:00.
  await upcoming(page)
    .getByRole("article")
    .filter({ hasText: "Fri 30 Oct" })
    .getByRole("link", { name: "Reschedule" })
    .click();
  await pause(1500);
  await page.getByRole("radio", { name: /^Tue 3 Nov,/ }).check();
  await pause();
  await page
    .getByRole("radio", { name: "13:00 to 16:00", exact: true })
    .check();
  await pause();
  await button(page, "Confirm new time").click();
  await expect(h1(page, "Tue 3 Nov, 13:00 to 16:00")).toBeVisible();
  await pause(2500);

  // The cancel link of the confirmation message opens the appointment (D-0001-77 A).
  const answer = await api(
    page,
    MANAGER,
    "GET",
    `/outbox?appointmentId=${fri.id}`,
  );
  const link = (
    answer.body as { kind: string; links: { cancel: string } }[]
  ).find((m) => m.kind === "confirmation")!.links.cancel;
  await page.goto(link);
  await pause(1200);
  await button(page, "Cancel appointment").click();
  await pause(1500);
  await dialog(page)
    .getByRole("button", { name: "Cancel appointment" })
    .click();
  await expect(page.getByText(/^Cancelled on /)).toBeVisible();
  await pause(2500);
  await context.close();
});
