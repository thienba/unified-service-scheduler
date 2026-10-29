// Every state of `my-appointments`, the customer's `appointment`, `reschedule` and `not-found` (C5), reached by
// real use at 390 and 1440 wide, each checked with axe-core and for sideways scroll (NFR-4, NFR-7). The clock is
// fixed (Wed 28 Oct 2026, 10:40 in London), and moved with Playwright's clock for the after-cutoff states. A 500,
// a slow answer and a stale count are faked in the page's own `fetch` (D-0001-58, D-0001-64). With EVIDENCE_DIR
// set, each state is saved as `<screen>-<state>-<width>.png` (D-0000-13).
import { expect, test, type Page } from "@playwright/test";
import { interceptApi, problemBody } from "./support";
import {
  A,
  B,
  FRI_10,
  NOW,
  answerFrom,
  bookAs,
  cancelAs,
  mine,
  shot,
  start,
} from "./customer-support";

const at = (iso: string) => new Date(iso);
const MON_13 = "2026-11-02T13:00:00Z";
const h1 = (page: Page, name: string | RegExp) =>
  page.getByRole("heading", { level: 1, name });
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const dialog = (page: Page) => page.getByRole("dialog");

for (const width of [390, 1440]) {
  test.describe(`at ${width} wide`, () => {
    test("my-appointments: upcoming, cancel-dialog, after-cancel, no-permission", async ({
      page,
    }) => {
      await start(page, width, "/appointments");
      await bookAs(page, A, FRI_10);
      await bookAs(page, A, "2026-11-09T14:00:00Z", {
        service: "service-oil-change",
        transport: "courtesy_car",
      });
      const thu = await bookAs(page, A, "2026-11-05T11:00:00Z", {
        service: "service-oil-change",
        transport: "wait",
      });
      await cancelAs(page, A, thu.id);
      // Friday 08:30: the Friday 10:00 appointment is inside its 2 hours.
      await page.clock.setFixedTime(at("2026-10-30T08:30:00Z"));
      await page.reload();
      await expect(
        page.getByRole("link", { name: /^Today, Fri 30 Oct/ }),
      ).toBeVisible();
      await expect(
        page.getByText(
          "It is too close to the start to change online. Contact Fakeford Motors (demo).",
          { exact: false },
        ),
      ).toBeVisible();
      await shot(page, "my-appointments", "upcoming");

      const card = page.getByRole("article").filter({ hasText: "Mon 9 Nov" });
      await card.getByRole("button", { name: "Cancel appointment" }).click();
      await expect(dialog(page)).toBeVisible();
      await expect(
        dialog(page).getByRole("button", { name: "Keep appointment" }),
      ).toBeFocused();
      await shot(page, "my-appointments", "cancel-dialog");
      await dialog(page)
        .getByRole("button", { name: "Cancel appointment" })
        .click();
      await expect(
        page.getByText("Appointment cancelled. The time is free again."),
      ).toBeVisible();
      await expect(
        page
          .getByRole("region", { name: "Past and cancelled" })
          .getByRole("article")
          .filter({ hasText: "Mon 9 Nov" }),
      ).toBeVisible();
      await shot(page, "my-appointments", "after-cancel");
    });

    test("my-appointments: past-and-cancelled, empty, and no-permission for staff", async ({
      page,
    }) => {
      await start(page, width, "/appointments");
      for (const a of await mine(page, A)) await cancelAs(page, A, a.id);
      await page.reload();
      await expect(
        page.getByText(
          "You have nothing booked at the moment. Use Book a service to pick a time.",
        ),
      ).toBeVisible();
      await shot(page, "my-appointments", "past-and-cancelled");

      // A month later the cancelled one has gone by, and the API sends nothing (Q-0001-235).
      await page.clock.setFixedTime(at("2026-12-01T10:00:00Z"));
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "You have no appointments yet" }),
      ).toBeVisible();
      await expect(
        page.getByRole("main").getByRole("link", { name: "Book a service" }),
      ).toHaveCount(1);
      await shot(page, "my-appointments", "empty");
    });

    test("my-appointments: no-permission for staff", async ({ page }) => {
      await start(page, width, "/appointments", { user: "Staff" });
      await expect(h1(page, "You cannot do that as Staff.")).toBeVisible();
      await expect(
        page.getByText(
          "My appointments lists a customer's own bookings, so it is only for customers.",
          { exact: false },
        ),
      ).toBeVisible();
      await shot(page, "my-appointments", "no-permission");
    });

    test("my-appointments: loading and error", async ({ page, context }) => {
      await interceptApi(page, { path: "/api/appointments", delayMs: 4000 });
      await start(page, width, "/book");
      await page.goto("/appointments");
      await expect(
        page.getByRole("main").locator(".skeleton").first(),
      ).toBeVisible();
      await shot(page, "my-appointments", "loading");

      const broken = await context.newPage();
      await interceptApi(broken, {
        path: "/api/appointments",
        status: 500,
        body: problemBody(500, "INTERNAL"),
      });
      await broken.setViewportSize({ width, height: 900 });
      await broken.clock.setFixedTime(NOW);
      await broken.goto("/appointments");
      await expect(
        broken.getByRole("heading", {
          name: "We could not load your appointments.",
        }),
      ).toBeVisible();
      await expect(
        broken.getByText("Reference 4bf92f35", { exact: true }),
      ).toBeVisible();
      await shot(broken, "my-appointments", "error");
    });

    test("appointment: confirmed, cancel-dialog, cancel-error, cancelling, cancelled", async ({
      page,
      context,
    }) => {
      await start(page, width, "/appointments");
      const fri = await bookAs(page, A, FRI_10);
      await page.goto(`/appointments/${fri.id}`);
      await expect(h1(page, "Fri 30 Oct, 10:00 to 13:00")).toBeVisible();
      await shot(page, "appointment", "confirmed");
      await button(page, "Cancel appointment").click();
      await expect(
        dialog(page).getByRole("heading", { name: "Cancel this appointment?" }),
      ).toBeVisible();
      await shot(page, "appointment", "cancel-dialog");

      const failing = await context.newPage();
      await interceptApi(failing, {
        path: "/cancel",
        status: 500,
        body: problemBody(500, "INTERNAL"),
      });
      await failing.setViewportSize({ width, height: 900 });
      await failing.clock.setFixedTime(NOW);
      await failing.goto(`/appointments/${fri.id}`);
      await button(failing, "Cancel appointment").click();
      await dialog(failing)
        .getByRole("button", { name: "Cancel appointment" })
        .click();
      await expect(
        dialog(failing).getByRole("heading", {
          name: "We could not cancel it.",
        }),
      ).toBeVisible();
      await shot(failing, "appointment", "cancel-error");
      await failing.close();

      const slow = await context.newPage();
      await interceptApi(slow, { path: "/cancel", delayMs: 3000 });
      await slow.setViewportSize({ width, height: 900 });
      await slow.clock.setFixedTime(NOW);
      await slow.goto(`/appointments/${fri.id}`);
      await button(slow, "Cancel appointment").click();
      await dialog(slow)
        .getByRole("button", { name: "Cancel appointment" })
        .click();
      await expect(
        dialog(slow).getByRole("button", { name: /Cancelling…/ }),
      ).toBeVisible();
      await shot(slow, "appointment", "cancelling");
      await expect(
        slow.getByText("Appointment cancelled. The time is free again."),
      ).toBeVisible({ timeout: 8000 });
      await expect(
        slow.getByText(/^Cancelled on Wed 28 Oct, 10:40\./),
      ).toBeVisible();
      await shot(slow, "appointment", "cancelled");
    });

    test("appointment: cancel-refused, then change-closed", async ({
      page,
    }) => {
      await start(page, width, "/appointments");
      const thu = await bookAs(page, A, "2026-10-29T14:00:00Z");
      // One minute before the cutoff (12:00), the dialog opens; the cutoff passes while it is open.
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
      await shot(page, "appointment", "cancel-refused");
      await dialog(page).getByText("Close", { exact: true }).click();
      await expect(dialog(page)).toHaveCount(0);
      await expect(
        page.getByRole("heading", {
          name: "This appointment can no longer be changed online.",
        }),
      ).toBeVisible();
      await expect(button(page, "Cancel appointment")).toHaveCount(0);
      await shot(page, "appointment", "change-closed");
    });

    test("appointment: loading, error, not-found", async ({
      page,
      context,
    }) => {
      await start(page, width, "/appointments");
      const fri = await bookAs(page, A, FRI_10);

      const slow = await context.newPage();
      await interceptApi(slow, {
        path: `/appointments/${fri.id}`,
        delayMs: 4000,
      });
      await slow.setViewportSize({ width, height: 900 });
      await slow.clock.setFixedTime(NOW);
      await slow.goto(`/appointments/${fri.id}`);
      await expect(slow.locator("main .skeleton").first()).toBeVisible();
      await shot(slow, "appointment", "loading");
      await slow.close();

      const broken = await context.newPage();
      await interceptApi(broken, {
        path: `/appointments/${fri.id}`,
        status: 500,
        body: problemBody(500, "INTERNAL"),
      });
      await broken.setViewportSize({ width, height: 900 });
      await broken.clock.setFixedTime(NOW);
      await broken.goto(`/appointments/${fri.id}`);
      await expect(
        h1(broken, "We could not load this appointment."),
      ).toBeVisible();
      await shot(broken, "appointment", "error");
      await broken.close();

      await page.goto("/appointments/appointment-does-not-exist");
      await expect(h1(page, "We cannot find that appointment.")).toBeVisible();
      await shot(page, "appointment", "not-found");
    });

    test("reschedule: idle, time-chosen, conflict, then rescheduled", async ({
      page,
    }) => {
      await start(page, width, "/appointments");
      const fri = await bookAs(page, A, FRI_10);
      await page.goto(`/appointments/${fri.id}/reschedule`);
      await expect(
        h1(page, "Choose a new time for your full service"),
      ).toBeVisible();
      await expect(
        page.getByRole("radio", { name: "10:00, your time" }),
      ).toBeDisabled();
      await shot(page, "reschedule", "idle");

      await page.getByRole("radio", { name: /^Mon 2 Nov,/ }).check();
      await page
        .getByRole("radio", { name: "13:00 to 16:00", exact: true })
        .check();
      await expect(
        page.getByRole("complementary").getByText("Mon 2 Nov, 13:00 to 16:00"),
      ).toBeVisible();
      await shot(page, "reschedule", "time-chosen");

      // Customer B takes 13:00 on Mon 2 Nov first: the last bay free then (B's own 14:00 has the other).
      await bookAs(page, B, MON_13);
      await button(page, "Confirm new time").click();
      await expect(
        page.getByRole("heading", {
          name: "Sorry, 13:00 on Mon 2 Nov was just taken.",
        }),
      ).toBeVisible();
      await shot(page, "reschedule", "conflict");

      await page
        .getByRole("radiogroup", { name: "Closest to your time" })
        .getByRole("radio")
        .first()
        .check();
      await button(page, "Confirm new time").click();
      await expect(page.getByText(/^Appointment moved to /)).toBeVisible();
      await expect(h1(page, /,/)).toBeVisible();
      await shot(page, "appointment", "rescheduled");
    });

    test("reschedule: confirming, confirm-error, conflict-empty, empty-day", async ({
      page,
      context,
    }) => {
      await start(page, width, "/appointments");
      const fri = await bookAs(page, A, FRI_10);
      const address = `/appointments/${fri.id}/reschedule`;
      const choose = async (p: Page) => {
        await p.getByRole("radio", { name: /^Tue 3 Nov,/ }).check();
        await p
          .getByRole("radio", { name: "13:00 to 16:00", exact: true })
          .check();
      };
      const open = async (prepare: (p: Page) => Promise<void>) => {
        const p = await context.newPage();
        await prepare(p);
        await p.setViewportSize({ width, height: 900 });
        await p.clock.setFixedTime(NOW);
        await p.goto(address);
        await expect(
          h1(p, "Choose a new time for your full service"),
        ).toBeVisible();
        return p;
      };

      const failing = await open((p) =>
        interceptApi(p, {
          path: "/reschedule",
          status: 500,
          body: problemBody(500, "INTERNAL"),
        }),
      );
      await choose(failing);
      await button(failing, "Confirm new time").click();
      await expect(
        failing.getByRole("heading", {
          name: "Something went wrong on our side.",
        }),
      ).toBeVisible();
      await expect(
        failing.getByText(/^Your appointment has not changed\. Try again/),
      ).toBeVisible();
      await shot(failing, "reschedule", "confirm-error");
      await failing.close();

      const nothing = await open((p) =>
        answerFrom(p, {
          path: "/reschedule",
          from: 1,
          status: 409,
          body: {
            ...problemBody(409, "SLOT_UNAVAILABLE"),
            reasons: ["BAY_BUSY"],
            suggestions: [],
          },
        }),
      );
      await choose(nothing);
      await button(nothing, "Confirm new time").click();
      await expect(
        nothing.getByText("There are no other times in the next 14 days."),
      ).toBeVisible();
      await shot(nothing, "reschedule", "conflict-empty");
      await nothing.close();

      const stale = await open(async (p) => {
        await answerFrom(p, {
          path: "/availability",
          query: "date=2026-11-03",
          from: 2,
          status: 200,
          body: {
            date: "2026-11-03",
            timeZone: "Europe/London",
            gridMinutes: 15,
            slots: [],
          },
        });
      });
      await stale.getByRole("radio", { name: /^Tue 3 Nov,/ }).check();
      await expect(
        stale.getByRole("heading", { name: "No times left on Tue 3 Nov." }),
      ).toBeVisible();
      await shot(stale, "reschedule", "empty-day");
      await stale.close();

      const slow = await open((p) =>
        interceptApi(p, { path: "/reschedule", delayMs: 3000 }),
      );
      await choose(slow);
      await button(slow, "Confirm new time").click();
      await expect(
        slow.getByRole("button", { name: /Confirming…/ }).first(),
      ).toBeVisible();
      await shot(slow, "reschedule", "confirming");
      await expect(
        slow.getByText(
          "Appointment moved to Tue 3 Nov, 13:00. The old time is free again.",
        ),
      ).toBeVisible({ timeout: 8000 });
    });

    test("reschedule: change-closed, loading, error, not-found", async ({
      page,
      context,
    }) => {
      await start(page, width, "/appointments");
      const fri = await bookAs(page, A, FRI_10);
      const theirs = (await mine(page, B))[0]!;

      const slow = await context.newPage();
      await interceptApi(slow, {
        path: `/appointments/${fri.id}`,
        delayMs: 4000,
      });
      await slow.setViewportSize({ width, height: 900 });
      await slow.clock.setFixedTime(NOW);
      await slow.goto(`/appointments/${fri.id}/reschedule`);
      await expect(slow.locator("main .skeleton").first()).toBeVisible();
      await shot(slow, "reschedule", "loading");
      await slow.close();

      const broken = await context.newPage();
      await interceptApi(broken, {
        path: `/appointments/${fri.id}`,
        status: 500,
        body: problemBody(500, "INTERNAL"),
      });
      await broken.setViewportSize({ width, height: 900 });
      await broken.clock.setFixedTime(NOW);
      await broken.goto(`/appointments/${fri.id}/reschedule`);
      await expect(
        h1(broken, "We could not load this appointment."),
      ).toBeVisible();
      await expect(
        broken.getByText(/Your appointment has not changed\./),
      ).toBeVisible();
      await shot(broken, "reschedule", "error");
      await broken.close();

      await page.goto(`/appointments/${theirs.id}/reschedule`);
      await expect(h1(page, "We cannot find that appointment.")).toBeVisible();
      await shot(page, "reschedule", "not-found");

      await page.clock.setFixedTime(at("2026-10-30T08:01:00Z"));
      await page.goto(`/appointments/${fri.id}/reschedule`);
      await expect(
        h1(page, "This appointment can no longer be changed online."),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Back to the appointment" }).last(),
      ).toBeVisible();
      await shot(page, "reschedule", "change-closed");
    });

    test("not-found: appointment, confirmation, page", async ({ page }) => {
      await start(page, width, "/appointments");
      const theirs = (await mine(page, B))[0]!;
      await page.goto(`/appointments/${theirs.id}`);
      await expect(h1(page, "We cannot find that appointment.")).toBeVisible();
      await shot(page, "not-found", "appointment");
      await page.goto(`/book/confirmed/${theirs.id}`);
      await expect(h1(page, "We cannot find that appointment.")).toBeVisible();
      await shot(page, "not-found", "confirmation");
      await page.goto("/no-such-page");
      await expect(h1(page, "We cannot find that page.")).toBeVisible();
      await shot(page, "not-found", "page");
    });
  });
}
