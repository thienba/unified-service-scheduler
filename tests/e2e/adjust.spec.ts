// `adjust` and the manager's parts of `appointment` and `schedule` (C6; manager.md 4.1, 5.1; REQ-BOOK-005). Every
// state is reached by real use at 390 and 1440 wide, checked with axe-core and for sideways scroll, and saved as
// `adjust-<state>-<width>.png` (D-0000-13). The clock is fixed on Wed 28 Oct 2026 08:00 London time.
import { expect, test, type Page } from "@playwright/test";
import {
  ASH,
  BIRCH,
  MANAGER,
  STAFF,
  api,
  book,
  changeShift,
  getAppointment,
  leaveOn,
  onCall,
  openAsUser,
  shot,
  start,
} from "./adjust-support";
import {
  expectNoSidewaysScroll,
  problemBody,
  widths,
  chooseOption,
  dateNamed,
  selectNamed,
  typeDate,
} from "./support";

/** Marta's full service, Fri 30 Oct 09:15 to 12:15 with Birch: the appointment most tests adjust. */
async function marta(page: Page) {
  return book(page, {
    date: "2026-10-30",
    time: "09:15",
    technicianId: BIRCH,
    serviceTypeId: "service-full",
    name: "Marta Kowalska",
    make: "Vauxhall",
    model: "Corsa",
    registration: "CD34 FGH",
  });
}

/** Jonas's oil change, Fri 30 Oct 12:30 with Birch, flagged by cutting Birch's Friday to 13:00. */
async function flaggedJonas(page: Page) {
  const id = await book(page, {
    date: "2026-10-30",
    time: "12:30",
    technicianId: BIRCH,
    name: "Jonas Weber",
    make: "Peugeot",
    model: "208",
    registration: "PG28 GHI",
  });
  await changeShift(page, BIRCH, "2026-10-30", {
    kind: "changed",
    shift: { start: "08:00", end: "13:00" },
  });
  return id;
}

async function openAdjust(page: Page, id: string) {
  await page.goto(`/appointments/${id}/adjust`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Adjust appointment" }),
  ).toBeVisible();
}

const save = (page: Page) =>
  page.getByRole("button", { name: /^(Save change|Checking…)$/ }).first();

async function fill(page: Page, date: string, time: string) {
  await typeDate(dateNamed(page, "Date"), date);
  await chooseOption(selectNamed(page, "Start time"), time);
}

/** PATCH calls the page sends. */
function patches(page: Page): string[] {
  const seen: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "PATCH") seen.push(new URL(r.url()).pathname);
  });
  return seen;
}

for (const width of [390, 1440] as const) {
  const wide = width >= 1024;
  test.describe(`at ${width} wide`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
    });

    test("idle, changed, validation, checking, saved (another technician picked)", async ({
      page,
    }) => {
      await start(page);
      const id = await marta(page);
      // The PATCH address ends with the id, so the slow answer is set once the id is known (before the page loads).
      await onCall(page, {
        method: "PATCH",
        path: `/appointments/${id}`,
        delayMs: 1500,
      });
      // Birch is busy at the new time, so the move picks another technician (D-0001-33 A).
      await book(page, {
        date: "2026-11-02",
        time: "09:00",
        technicianId: BIRCH,
        name: "Tom Hale",
      });
      const sent = patches(page);
      await openAdjust(page, id);
      await expect(
        page.getByText("Full service for Marta Kowalska · Vauxhall Corsa"),
      ).toBeVisible();
      await expect(selectNamed(page, "Technician")).toHaveAttribute(
        "data-value",
        "",
      );
      await expect(selectNamed(page, "Technician")).toHaveText(
        "Same as now (Amara Okafor)",
      );
      await expect(
        page.getByText("Ends 12:15. The job takes about 3 hours."),
      ).toBeVisible();
      await expect(save(page)).toBeDisabled();
      await expect(
        page.getByText(
          wide
            ? "Change the time, technician or bay to save."
            : "No change yet",
        ),
      ).toBeVisible();
      if (!wide) {
        await expect(
          page.getByRole("navigation", { name: "Main" }),
        ).toHaveCount(0);
      }
      await shot(page, "adjust-idle");

      // D-0001-133: the time list holds only quarter hours, so 09:10 cannot be chosen at all.
      await selectNamed(page, "Start time").click();
      await expect(
        page.getByRole("listbox").locator('[data-value="09:10"]'),
      ).toHaveCount(0);
      await expect(
        page.getByRole("listbox").locator('[data-value="09:15"]'),
      ).toHaveCount(1);
      await page.keyboard.press("Escape");
      await typeDate(dateNamed(page, "Date"), "2026-10-27");
      await save(page).click();
      await expect(
        page.getByRole("heading", {
          name: "1 thing needs fixing before we can check this change.",
        }),
      ).toBeVisible();
      await expect(
        page.getByText("That date has passed. Choose today or a later date."),
      ).toBeVisible();
      await expect(save(page)).toBeDisabled();
      await page
        .getByRole("link", {
          name: "Date: choose today or a later date.",
        })
        .click();
      await expect(
        dateNamed(page, "Date").getByRole("spinbutton").first(),
      ).toBeFocused();
      expect(sent).toEqual([]);
      await shot(page, "adjust-validation");

      await fill(page, "2026-11-02", "09:00");
      await expect(
        page.getByText("Ends 12:00. The job takes about 3 hours."),
      ).toBeVisible();
      await expect(save(page)).toBeEnabled();
      if (!wide)
        await expect(page.getByText("Was Fri 30 Oct, 09:15")).toBeVisible();
      await expect(page.getByText("Changed").first()).toBeVisible();
      await shot(page, "adjust-changed");

      await save(page).click();
      await expect(
        page.getByText("Checking…").filter({ visible: true }).first(),
      ).toBeVisible();
      await expect(
        dateNamed(page, "Date").getByRole("spinbutton").first(),
      ).toBeDisabled();
      await shot(page, "adjust-checking");

      await expect(
        page.getByRole("heading", { name: "Change saved" }),
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        page.getByText(
          /^The appointment is now Mon 2 Nov, 09:00 to 12:00 with Oliver Hughes in bay \d\. Amara Okafor was busy then, so Oliver Hughes was picked\..* The customer has a new message in the outbox\.$/,
        ),
      ).toBeVisible();
      await expect(
        page.getByText("Appointment moved to Mon 2 Nov, 09:00."),
      ).toBeVisible();
      expect(sent).toEqual([`/api/appointments/${id}`]);
      // The page stays a task screen after the save: no tab bar below 1024 (Q-0001-242 item 13).
      if (!wide)
        await expect(
          page.getByRole("navigation", { name: "Main" }),
        ).toHaveCount(0);
      await shot(page, "adjust-saved");

      const after = await getAppointment(page, id);
      expect(after.start).toBe("2026-11-02T09:00:00Z");
      expect(after.technicianId).toBe(ASH);
      // The schedule then shows the new time (REQ-BOOK-005.AC-1).
      await page
        .getByRole("link", { name: "Back to schedule" })
        .first()
        .click();
      await expect(page).toHaveURL(/date=2026-11-02/);
      // Marta's own block on Mon 2 Nov now reads 09:00 to 12:00: a link in the list, a button on the timeline.
      const block = wide
        ? page.locator(`button[data-appointment="${id}"]`)
        : page.locator(`a[href="/appointments/${id}"]`);
      await expect(block).toHaveAccessibleName(
        /^09:00 to 12:00,? Full service/,
      );
    });

    test("clash and closest times, then a technician-only change says nobody else was picked", async ({
      page,
    }) => {
      await start(page);
      const id = await marta(page);
      // Both technicians who can do a full service are busy on Fri 30 Oct from 13:30.
      await book(page, {
        date: "2026-10-30",
        time: "13:30",
        technicianId: ASH,
        serviceTypeId: "service-full",
        name: "Ana Costa",
      });
      await book(page, {
        date: "2026-10-30",
        time: "13:30",
        technicianId: BIRCH,
        serviceTypeId: "service-full",
        name: "Li Wei",
      });
      const before = await getAppointment(page, id);
      await openAdjust(page, id);
      await fill(page, "2026-10-30", "13:30");
      await save(page).click();
      const title = page.getByRole("heading", {
        name: "That change was not saved.",
      });
      await expect(title).toBeVisible();
      await expect(title).toBeFocused();
      await expect(
        page.getByText(
          /\. The appointment is still at 09:15 with Amara Okafor in bay \d\.$/,
        ),
      ).toBeVisible();
      await expect(page.getByText(/[A-Z]{2,}_[A-Z]{2,}/)).toHaveCount(0);
      await expect(page.getByText("Refused").first()).toBeVisible();
      await expect(selectNamed(page, "Start time")).toHaveAttribute(
        "data-value",
        "13:30",
      );
      const chips = page
        .getByRole("group", { name: "Closest times that are free" })
        .getByRole("button");
      expect(await chips.count()).toBeGreaterThan(0);
      expect(await chips.count()).toBeLessThanOrEqual(5);
      await expect(chips.first()).toHaveAttribute("aria-pressed", "false");
      await expect(
        page.getByText(
          "Choosing a time fills in the form. It does not save anything.",
        ),
      ).toBeVisible();
      await expect(save(page)).toBeDisabled();
      // Nothing changed (REQ-BOOK-005.AC-2).
      expect(await getAppointment(page, id)).toEqual(before);
      await shot(page, "adjust-clash");

      // A chip fills the form and saves nothing. (The early check of the filled time, D-0001-107, only reads.)
      const writes: string[] = [];
      page.on("request", (r) => {
        if (r.method() !== "GET" && !r.url().endsWith("/availability-checks"))
          writes.push(r.url());
      });
      await chips.first().click();
      await expect(chips.first()).toHaveAttribute("aria-pressed", "true");
      expect(writes).toEqual([]);
      await expect(save(page)).toBeEnabled();

      // A change of bay only: the saved text names nobody as picked, and no message is sent.
      await fill(page, "2026-10-30", "09:15");
      await chooseOption(selectNamed(page, "Service bay"), "bay-lon-2");
      await save(page).click();
      await expect(
        page.getByRole("heading", { name: "Change saved" }),
      ).toBeVisible();
      await expect(page.getByText(/was busy then/)).toHaveCount(0);
      await expect(page.getByText(/new message in the outbox/)).toHaveCount(0);
    });

    test("clash-empty: no other times in the next 14 days", async ({
      page,
    }) => {
      await start(page);
      const id = await marta(page);
      const dates = Array.from({ length: 20 }, (_, i) =>
        new Date(Date.UTC(2026, 9, 28 + i)).toISOString().slice(0, 10),
      );
      await leaveOn(page, ASH, dates);
      await openAdjust(page, id);
      await chooseOption(selectNamed(page, "Technician"), ASH);
      await save(page).click();
      await expect(
        page.getByRole("heading", { name: "That change was not saved." }),
      ).toBeVisible();
      await expect(
        page.getByText("There are no other times in the next 14 days."),
      ).toBeVisible();
      await shot(page, "adjust-clash-empty");
    });

    test("already-flagged: times that fit, then a move that fits clears the flag", async ({
      page,
    }) => {
      await start(page);
      const id = await flaggedJonas(page);
      await openAdjust(page, id);
      await expect(
        page.getByRole("heading", { name: "This booking no longer fits" }),
      ).toBeVisible();
      await expect(
        page.getByText(/^Ends after Amara's shift, 13:00\./),
      ).toBeVisible();
      const fits = page
        .getByRole("group", { name: "Times that fit" })
        .getByRole("button");
      await expect(fits.first()).toBeVisible();
      await expect(save(page)).toBeDisabled();
      if (!wide)
        await expect(
          page.getByText("Flagged: outside the shift"),
        ).toBeVisible();
      await shot(page, "adjust-already-flagged");

      await fits.first().click();
      await save(page).click();
      await expect(
        page.getByRole("heading", { name: "Change saved" }),
      ).toBeVisible();
      expect((await getAppointment(page, id)).flags).toEqual([]);
    });

    test("cancel-dialog, cancelling, cancel-refused, then cancelled-appointment", async ({
      page,
    }) => {
      await onCall(page, {
        method: "POST",
        path: "/cancel",
        delayMs: 1500,
      });
      await start(page);
      const id = await marta(page);
      await openAdjust(page, id);
      const opener = page.getByRole("button", { name: "Cancel appointment" });
      await opener.click();
      const dialog = page.getByRole("dialog", {
        name: "Cancel this appointment?",
      });
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByRole("button", { name: "Keep appointment" }),
      ).toBeFocused();
      await expect(
        dialog.getByText(
          "Full service for Marta Kowalska, Fri 30 Oct, 09:15. The time becomes free again. The customer is sent a cancellation message and their reminders are cancelled. This cannot be undone.",
        ),
      ).toBeVisible();
      await shot(page, "adjust-cancel-dialog");

      await dialog.getByRole("button", { name: "Cancel appointment" }).click();
      await expect(dialog.getByText("Cancelling…")).toBeVisible();
      await expect(
        dialog.getByRole("button", { name: "Keep appointment" }),
      ).toBeDisabled();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeVisible();
      await shot(page, "adjust-cancelling");

      await expect(
        page.getByRole("heading", { name: "This appointment is cancelled" }),
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        page.getByText(
          "Appointment cancelled. The customer is told and the time is free again.",
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Save change" }),
      ).toHaveCount(0);
      if (!wide)
        await expect(
          page.getByRole("navigation", { name: "Main" }),
        ).toHaveCount(0);
      await shot(page, "adjust-cancelled-appointment");
      expect((await getAppointment(page, id)).cancelledAt).not.toBeNull();
      // The time is free again for a new booking (REQ-BOOK-012.AC-1).
      await book(page, {
        date: "2026-10-30",
        time: "09:15",
        technicianId: BIRCH,
        serviceTypeId: "service-full",
        name: "Next Customer",
      });
    });

    test("cancel-refused", async ({ page }) => {
      await onCall(page, {
        method: "POST",
        path: "/cancel",
        status: 500,
        body: problemBody(500, "INTERNAL"),
      });
      await start(page);
      const id = await marta(page);
      await openAdjust(page, id);
      await page.getByRole("button", { name: "Cancel appointment" }).click();
      const dialog = page.getByRole("dialog", {
        name: "Cancel this appointment?",
      });
      await dialog.getByRole("button", { name: "Cancel appointment" }).click();
      await expect(
        dialog.getByRole("heading", {
          name: "We could not cancel this appointment",
        }),
      ).toBeVisible();
      await expect(
        dialog.getByRole("button", { name: "Try again" }),
      ).toBeVisible();
      await expect(
        dialog.getByRole("button", { name: "Keep appointment" }),
      ).toBeVisible();
      await expect(
        dialog.getByText(/quote reference 4bf92f35\./),
      ).toBeVisible();
      await shot(page, "adjust-cancel-refused");
    });

    test("loading and error", async ({ page }) => {
      await start(page);
      const id = await marta(page);
      await onCall(page, {
        method: "GET",
        path: `/appointments/${id}`,
        delayMs: 4000,
      });
      await page.goto(`/appointments/${id}/adjust`);
      await expect(page.locator("[aria-busy=true]").first()).toBeVisible();
      await page.waitForTimeout(600);
      await shot(page, "adjust-loading");
    });

    test("error", async ({ page }) => {
      await start(page);
      const id = await marta(page);
      await onCall(page, {
        method: "GET",
        path: `/appointments/${id}`,
        status: 500,
        body: problemBody(500, "INTERNAL"),
      });
      await page.goto(`/appointments/${id}/adjust`);
      await expect(
        page.getByRole("heading", {
          name: "Something went wrong on our side.",
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Try again" }),
      ).toBeVisible();
      await shot(page, "adjust-error");
    });

    test("no-permission for staff and a customer, not-found for another dealership", async ({
      page,
    }) => {
      await start(page);
      const id = await marta(page);
      const sent = patches(page);
      await openAsUser(page, STAFF, `/appointments/${id}/adjust`);
      await expect(
        page.getByText(
          "Only the garage manager can move, reassign or cancel an appointment. Switch role, or go to your schedule.",
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Save change" }),
      ).toHaveCount(0);
      await shot(page, "adjust-no-permission");
      // Staff and customers see no Adjust on the appointment page (REQ-BOOK-005.AC-3).
      await page.goto(`/appointments/${id}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("link", { name: "Adjust" })).toHaveCount(0);
      await openAsUser(
        page,
        "user-customer-a",
        `/appointments/appointment-customer-a/adjust`,
      );
      await expect(
        page.getByText(/^Only the garage manager can move/),
      ).toBeVisible();
      await page.goto("/appointments/appointment-customer-a");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("link", { name: "Adjust" })).toHaveCount(0);
      expect(sent).toEqual([]);

      // A Saigon appointment, opened by London's manager: not found, and left as it was (SEC-4.AC-4).
      const saigon = await api(
        page,
        "user-staff-saigon",
        "POST",
        "/appointments",
        {
          dealershipId: "dealership-saigon",
          serviceTypeId: "service-oil-change",
          start: "2026-10-30T03:00:00Z",
          transport: "wait",
          technicianId: "tech-sgn-binh",
          newCustomer: {
            name: "Mai Tran",
            phone: "0161 496 0001",
            email: "mai@example.com",
          },
          newVehicle: {
            registration: "SG12 ABC",
            make: "Honda",
            model: "City",
          },
        },
      );
      expect(saigon.status).toBe(201);
      const other = (saigon.body as { id: string; version: number }).id;
      await openAsUser(page, MANAGER, `/appointments/${other}/adjust`);
      await expect(
        page.getByRole("heading", { name: "We cannot find that appointment." }),
      ).toBeVisible();
      await expect(
        page.getByText(
          "It may have been removed, or it belongs to someone else.",
        ),
      ).toBeVisible();
      await shot(page, "adjust-not-found");
      const still = await api(
        page,
        "user-manager-saigon",
        "GET",
        `/appointments/${other}`,
      );
      expect((still.body as { version: number }).version).toBe(
        (saigon.body as { version: number }).version,
      );
    });

    test("a failed save: Try again sends the form as it is now, and an edit clears the failure", async ({
      page,
    }) => {
      await start(page);
      const id = await marta(page);
      await book(page, {
        date: "2026-11-02",
        time: "09:00",
        technicianId: BIRCH,
        name: "Tom Hale",
      });
      // The first three saves fail with 500; the fourth goes through.
      await onCall(page, {
        method: "PATCH",
        path: `/appointments/${id}`,
        status: 500,
        body: problemBody(500, "INTERNAL"),
        times: 3,
      });
      // The 500s are answered inside the page, so the bodies are read there, before `onCall` answers.
      await page.addInitScript(() => {
        const sent: unknown[] = [];
        (window as unknown as { patchBodies: unknown[] }).patchBodies = sent;
        const next = window.fetch.bind(window);
        window.fetch = async (input, init) => {
          const request = input instanceof Request ? input : null;
          const method = (
            init?.method ??
            request?.method ??
            "GET"
          ).toUpperCase();
          if (method === "PATCH")
            sent.push(
              JSON.parse(
                request ? await request.clone().text() : String(init?.body),
              ),
            );
          return next(input, init);
        };
      });
      const bodies = () =>
        page.evaluate(
          () => (window as unknown as { patchBodies: unknown[] }).patchBodies,
        );
      await openAdjust(page, id);
      await fill(page, "2026-11-02", "09:00");
      await save(page).click();
      const failure = page.getByRole("heading", {
        name: "Something went wrong on our side.",
      });
      await expect(failure).toBeFocused();

      // An edit makes the failure old news: it goes, and the next save sends the new time.
      await chooseOption(selectNamed(page, "Start time"), "09:15");
      await expect(failure).toHaveCount(0);
      await save(page).click();
      await expect(failure).toBeVisible();
      expect(await bodies()).toHaveLength(2);
      expect((await bodies())[1]).toMatchObject({
        start: "2026-11-02T09:15:00Z",
      });

      // Try again sends what the form holds, and keeps the "picked" sentence of that answer.
      await chooseOption(selectNamed(page, "Start time"), "09:00");
      await save(page).click();
      await expect(failure).toBeVisible();
      await page.getByRole("button", { name: "Try again" }).click();
      await expect(
        page.getByRole("heading", { name: "Change saved" }),
      ).toBeVisible();
      expect(await bodies()).toHaveLength(4);
      expect((await bodies())[3]).toMatchObject({
        start: "2026-11-02T09:00:00Z",
      });
      await expect(
        page.getByText(
          /Amara Okafor was busy then, so Oliver Hughes was picked\./,
        ),
      ).toBeVisible();
    });

    test("a blank date or start time: Save names the field and sends nothing", async ({
      page,
    }) => {
      await start(page);
      const id = await marta(page);
      const sent = patches(page);
      await openAdjust(page, id);
      await typeDate(dateNamed(page, "Date"), "");
      await expect(
        page.getByText("Change the time, technician or bay to save."),
      ).toHaveCount(0);
      await expect(save(page)).toBeEnabled();
      await save(page).click();
      await expect(
        page.getByText("Choose a date.").filter({ visible: true }).first(),
      ).toBeVisible();
      await expect(
        dateNamed(page, "Date").getByRole("spinbutton").first(),
      ).toBeFocused();
      await expect(save(page)).toBeDisabled();
      expect(sent).toEqual([]);
    });

    test("a 422 on the technician links to the Technician select; another field is listed as text", async ({
      page,
    }) => {
      await start(page);
      const id = await marta(page);
      await onCall(page, {
        method: "PATCH",
        path: `/appointments/${id}`,
        status: 422,
        body: {
          ...problemBody(422, "VALIDATION_FAILED"),
          errors: [
            { field: "technicianId", message: "Choose another technician." },
            { field: "version", message: "Reload the appointment." },
          ],
        },
      });
      await openAdjust(page, id);
      await chooseOption(selectNamed(page, "Technician"), ASH);
      await save(page).click();
      const summary = page.getByRole("heading", {
        name: "2 things need fixing before we can check this change.",
      });
      await expect(summary).toBeVisible();
      await page
        .getByRole("link", { name: "Choose another technician." })
        .click();
      await expect(selectNamed(page, "Technician")).toBeFocused();
      await expect(page.getByText("Reload the appointment.")).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Reload the appointment." }),
      ).toHaveCount(0);
    });

    test("an appointment that has ended: no Adjust on the schedule, and adjust says it has ended", async ({
      page,
    }) => {
      await start(page);
      const id = await marta(page);
      // Saturday: Marta's Friday job is over.
      await page.clock.setFixedTime(new Date("2026-10-31T09:00:00Z"));
      await page.goto(`/appointments/${id}/adjust`);
      await expect(
        page.getByRole("heading", { name: "This appointment has ended" }),
      ).toBeVisible();
      await expect(dateNamed(page, "Date")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Save change" }),
      ).toHaveCount(0);
      await shot(page, "adjust-ended");
      if (wide) {
        await page.goto("/schedule?date=2026-10-30");
        await page.locator(`button[data-appointment="${id}"]`).click();
        await expect(
          page.getByRole("link", { name: "Open appointment" }),
        ).toBeVisible();
        await expect(
          page.getByRole("link", { name: /^(Adjust|Move)$/ }),
        ).toHaveCount(0);
      }
    });

    test("a cancel from the appointment page puts focus on the cancelled note", async ({
      page,
    }) => {
      await start(page);
      const id = await marta(page);
      await page.goto(`/appointments/${id}`);
      await page.getByRole("button", { name: "Cancel appointment" }).click();
      const dialog = page.getByRole("dialog", {
        name: "Cancel this appointment?",
      });
      await dialog.getByRole("button", { name: "Cancel appointment" }).click();
      await expect(dialog).toHaveCount(0);
      await expect(
        page.getByRole("heading", {
          name: /^This appointment was cancelled on /,
        }),
      ).toBeFocused();
    });

    test("appointment and appointment-flagged (manager), schedule-additions", async ({
      page,
    }) => {
      await start(page);
      const id = await marta(page);
      const jonas = await flaggedJonas(page);
      await page.goto(`/appointments/${id}`);
      await expect(page.getByRole("link", { name: "Adjust" })).toHaveAttribute(
        "href",
        `/appointments/${id}/adjust`,
      );
      await expect(
        page.getByRole("button", { name: "Cancel appointment" }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "See the messages sent" }),
      ).toHaveAttribute("href", `/manage/outbox?appointmentId=${id}`);
      await shot(page, "adjust-appointment");

      await page.goto(`/appointments/${jonas}`);
      await expect(
        page.getByRole("heading", { name: "This booking no longer fits" }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Move this appointment" }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Adjust", exact: true }),
      ).toHaveCount(0);
      await shot(page, "adjust-appointment-flagged");

      await page.goto("/schedule?date=2026-10-30");
      await expect(
        page.getByRole("heading", { name: "1 booking needs a new time" }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Review flagged bookings" }),
      ).toBeVisible();
      if (wide) {
        await page
          .getByRole("region", { name: "Day timeline, scrolls sideways" })
          .getByRole("button", { name: /^12:30 to 13:30/ })
          .click();
        await expect(page.getByRole("link", { name: "Move" })).toHaveAttribute(
          "href",
          `/appointments/${jonas}/adjust`,
        );
        await expect(
          page.getByRole("link", { name: "Open appointment" }),
        ).toBeVisible();
      }
      await shot(page, "adjust-schedule-additions");
      if (wide) {
        await page
          .getByRole("region", { name: "Day timeline, scrolls sideways" })
          .getByRole("button", { name: /^09:15 to 12:15/ })
          .click();
        await expect(
          page.getByRole("link", { name: "Adjust" }),
        ).toHaveAttribute("href", `/appointments/${id}/adjust`);
      }

      // Staff see neither the strip nor the manager's buttons.
      await openAsUser(page, STAFF, "/schedule?date=2026-10-30");
      await expect(
        page.getByRole("heading", { name: "Schedule", level: 1 }),
      ).toBeVisible();
      await expect(
        page.getByText("Oil and filter change").first(),
      ).toBeAttached();
      await expect(page.getByText(/needs? a new time/)).toHaveCount(0);
      if (wide) {
        await page
          .getByRole("region", { name: "Day timeline, scrolls sideways" })
          .getByRole("button", { name: /^12:30 to 13:30/ })
          .click();
        await expect(page.getByRole("link", { name: "Move" })).toHaveCount(0);
      }
    });
  });
}

test("D-0001-102: Times that fit offers a time that only the booking's own slot blocks", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await start(page);
  // Oliver is on his break 12:00 to 13:00 and Tom has no mechanic skill, so only Amara could take 12:00, and her
  // own 12:30 job (Jonas's) is what blocks her.
  const id = await flaggedJonas(page);
  await openAdjust(page, id);
  await expect(
    page
      .getByRole("group", { name: "Times that fit" })
      .getByRole("button", { name: /^Fri 30 Oct, 12:00 / }),
  ).toBeVisible();
});

test("TOO_SOON and BEYOND_HORIZON read in words with the dealership's numbers (D-0001-45 A)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await start(page);
  const id = await marta(page);
  await openAdjust(page, id);
  await fill(page, "2026-10-28", "09:00");
  await save(page).click();
  await expect(
    page
      .getByText(
        /Bookings need at least 2 hours notice.*\. The appointment is still at 09:15/,
      )
      // The page's live region also says it when the early check (D-0001-107) found it first.
      .first(),
  ).toBeVisible();
  await fill(page, "2026-12-15", "09:00");
  await save(page).click();
  await expect(
    page
      .getByText(
        /Bookings open up to 30 days ahead.*\. The appointment is still at 09:15/,
      )
      // The page's live region also says it when the early check (D-0001-107) found it first.
      .first(),
  ).toBeVisible();
});

test("adjust: no sideways scroll at 320, 390, 768, 1024 and 1440 wide (NFR-7)", async ({
  page,
}) => {
  await start(page);
  const id = await flaggedJonas(page);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await openAdjust(page, id);
    await expect(
      page.getByRole("group", { name: "Times that fit" }),
    ).toBeVisible();
    await expectNoSidewaysScroll(page);
    const panel = page.getByRole("complementary", { name: "What changes" });
    const form = page.getByRole("form", { name: "Change the appointment" });
    const [p, f] = [await panel.boundingBox(), await form.boundingBox()];
    if (width >= 1024) {
      // From 1024 the panel is on the right, 22rem wide, and there is no bar.
      expect(p!.x).toBeGreaterThan(f!.x);
      expect(Math.round(p!.width)).toBe(352);
    } else {
      expect(p!.y).toBeLessThan(f!.y);
    }
  }
});
