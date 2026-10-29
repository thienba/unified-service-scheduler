// `flagged` (C6; manager.md 4.2, 5.2; REQ-BOOK-005.AC-1, REQ-BOOK-007, REQ-BOOK-008.AC-4). The four flagged
// bookings are made by real use: staff book them, then the manager cuts a shift, shortens a Saturday and puts a
// technician on leave. Each state is checked with axe-core and for sideways scroll at 390 and 1440 wide and saved
// as `flagged-<state>-<width>.png` (D-0000-13). The clock is fixed on Wed 28 Oct 2026 08:00 London time.
import { expect, test, type Page } from "@playwright/test";
import {
  ASH,
  BIRCH,
  STAFF,
  book,
  changeShift,
  dateHours,
  onCall,
  openAsUser,
  shot,
  start,
  videoDir,
} from "./adjust-support";
import {
  expectNoSidewaysScroll,
  problemBody,
  widths,
  chooseOption,
  selectNamed,
} from "./support";

/** Four flagged bookings on three days; Aisha's has both reasons. Returns their ids, soonest first. */
async function fourFlagged(
  page: Page,
  names: Partial<Record<string, string>> = {},
) {
  const jonas = await book(page, {
    date: "2026-10-30",
    time: "12:30",
    technicianId: BIRCH,
    name: names["jonas"] ?? "Jonas Weber",
    make: names["make"] ?? "Peugeot",
    model: names["model"] ?? "208",
    registration: "PG28 GHI",
  });
  const ana = await book(page, {
    date: "2026-10-31",
    time: "14:30",
    technicianId: ASH,
    transport: "wait",
    name: "Ana Costa",
    make: "Volkswagen",
    model: "Golf",
    registration: "VW25 XYZ",
  });
  const aisha = await book(page, {
    date: "2026-10-31",
    time: "15:00",
    technicianId: BIRCH,
    transport: "wait",
    name: "Aisha Rahman",
    make: "Skoda",
    model: "Octavia",
    registration: "GH78 MNO",
  });
  const li = await book(page, {
    date: "2026-11-02",
    time: "09:00",
    technicianId: ASH,
    transport: "wait",
    name: "Li Wei",
    make: "Mazda",
    model: "CX-5",
    registration: "EF22 GHJ",
  });
  await changeShift(page, BIRCH, "2026-10-30", {
    kind: "changed",
    shift: { start: "08:00", end: "13:00" },
  });
  await changeShift(page, BIRCH, "2026-10-31", {
    kind: "changed",
    shift: { start: "09:00", end: "14:30" },
  });
  await dateHours(page, "2026-10-31", { open: "09:00", close: "14:00" });
  await changeShift(page, ASH, "2026-11-02", { kind: "leave" });
  return { jonas, ana, aisha, li };
}

async function openFlagged(page: Page, query = "") {
  await page.goto(`/manage/flagged${query}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Flagged bookings" }),
  ).toBeVisible();
}

const rows = (page: Page) => page.getByRole("main").getByRole("listitem");

for (const width of [390, 1440] as const) {
  test.describe(`at ${width} wide`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
    });

    test("list, cancel-dialog, cancelling, after-cancel", async ({ page }) => {
      await onCall(page, { method: "POST", path: "/cancel", delayMs: 1500 });
      await start(page);
      const ids = await fourFlagged(page);
      await openFlagged(page);
      await expect(rows(page)).toHaveCount(4);
      await expect(
        page.getByText(
          "4 bookings need a new time, or to be cancelled. Soonest first. They are still booked and keep their technician and bay until you act.",
        ),
      ).toBeVisible();
      // Soonest first, under day headings with a count.
      await expect(
        page.getByRole("main").getByRole("heading", { level: 2 }),
      ).toHaveText([
        "Fri 30 Oct 1 booking",
        "Sat 31 Oct 2 bookings",
        "Mon 2 Nov 1 booking",
      ]);
      const first = rows(page).first();
      await expect(first).toContainText("12:30");
      await expect(first).toContainText("to 13:30");
      await expect(first).toContainText(
        "Oil and filter change, Peugeot 208 PG28 GHI",
      );
      await expect(first).toContainText("Jonas Weber · Amara Okafor, Bay");
      await expect(
        first.getByText("Outside the technician’s shift"),
      ).toBeVisible();
      await expect(first.getByText("Drop-off")).toBeVisible();
      await expect(
        first.getByText("Ends after Amara's shift, 13:00."),
      ).toBeVisible();
      await expect(first.getByText("Flagged on Wed 28 Oct.")).toBeVisible();
      // Both reasons: two badges and two sentences.
      const aisha = rows(page).nth(2);
      await expect(
        aisha.getByText("Outside the technician’s shift"),
      ).toBeVisible();
      await expect(aisha.getByText("Outside opening hours")).toBeVisible();
      await expect(
        aisha.getByText("Ends after closing time, 14:00."),
      ).toBeVisible();
      await expect(
        aisha.getByText("Ends after Amara's shift, 14:30."),
      ).toBeVisible();
      await expect(
        rows(page).nth(3).getByText("Oliver is not working this day."),
      ).toBeVisible();
      // Names start with the visible word and name the booking; no primary fill on this screen.
      await expect(
        page.getByRole("link", {
          name: "Move Oil and filter change for Jonas Weber, Fri 30 Oct 12:30",
        }),
      ).toHaveAttribute("href", `/appointments/${ids.jonas}/adjust`);
      await expect(
        page.getByRole("button", {
          name: "Cancel Oil and filter change for Jonas Weber, Fri 30 Oct 12:30",
        }),
      ).toBeVisible();
      expect(await page.locator("main .bg-primary").count()).toBe(0);
      // The rows stay rows on a phone; Move and Cancel are 44 px high.
      for (const control of [
        first.getByRole("link", { name: /^Move/ }),
        first.getByRole("button", { name: /^Cancel/ }),
      ]) {
        expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(
          44,
        );
      }
      await expect(
        page.getByRole("link", { name: /^Flagged/ }).filter({ visible: true }),
      ).toContainText("4");
      await shot(page, "flagged-list");

      await page
        .getByRole("button", {
          name: /^Cancel Oil and filter change for Jonas/,
        })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Cancel this appointment?",
      });
      await expect(
        dialog.getByRole("button", { name: "Keep appointment" }),
      ).toBeFocused();
      await expect(
        dialog.getByText(
          /^Oil and filter change for Jonas Weber, Fri 30 Oct, 12:30\./,
        ),
      ).toBeVisible();
      await shot(page, "flagged-cancel-dialog");

      await dialog.getByRole("button", { name: "Cancel appointment" }).click();
      await expect(dialog.getByText("Cancelling…")).toBeVisible();
      await shot(page, "flagged-cancelling");

      await expect(dialog).toBeHidden({ timeout: 10_000 });
      await expect(rows(page)).toHaveCount(3);
      await expect(
        page.getByText(
          "Appointment cancelled. The customer is told and the time is free again.",
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("status").filter({
          hasText: "Appointment cancelled. 3 flagged bookings left.",
        }),
      ).toBeAttached();
      await expect(
        page.getByRole("link", { name: /^Flagged/ }).filter({ visible: true }),
      ).toContainText("3");
      await expect(page.getByText(/^3 bookings need a new time/)).toBeVisible();
      await shot(page, "flagged-after-cancel");
    });

    test("cancel-refused", async ({ page }) => {
      await onCall(page, {
        method: "POST",
        path: "/cancel",
        status: 500,
        body: problemBody(500, "INTERNAL"),
      });
      await start(page);
      await fourFlagged(page);
      await openFlagged(page);
      await page
        .getByRole("button", {
          name: /^Cancel Oil and filter change for Jonas/,
        })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Cancel this appointment?",
      });
      await dialog.getByRole("button", { name: "Cancel appointment" }).click();
      await expect(
        dialog.getByRole("heading", {
          name: "We could not cancel this appointment",
        }),
      ).toBeFocused();
      await expect(
        dialog.getByRole("button", { name: "Try again" }),
      ).toBeVisible();
      await shot(page, "flagged-cancel-refused");
      await dialog.getByRole("button", { name: "Keep appointment" }).click();
      await expect(rows(page)).toHaveCount(4);
    });

    test("empty, and the last cancel leads to it", async ({ page }) => {
      await start(page);
      await book(page, {
        date: "2026-10-30",
        time: "12:30",
        technicianId: BIRCH,
        name: "Jonas Weber",
      });
      await changeShift(page, BIRCH, "2026-10-30", {
        kind: "changed",
        shift: { start: "08:00", end: "13:00" },
      });
      await openFlagged(page);
      await page.getByRole("button", { name: /^Cancel / }).click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Cancel appointment" })
        .click();
      await expect(
        page.getByRole("heading", { name: "Nothing needs your attention" }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Open the schedule" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Dismiss" }).click();
      await shot(page, "flagged-empty");
    });

    test("loading", async ({ page }) => {
      await onCall(page, {
        method: "GET",
        path: "/appointments",
        delayMs: 4000,
      });
      await start(page);
      await page.goto("/manage/flagged");
      await expect(page.locator("main [aria-busy=true]").first()).toBeVisible();
      await page.waitForTimeout(600);
      await shot(page, "flagged-loading");
    });

    test("error", async ({ page }) => {
      await onCall(page, {
        method: "GET",
        path: "/appointments",
        status: 500,
        body: problemBody(500, "INTERNAL"),
      });
      await start(page);
      await openFlagged(page);
      await expect(
        page.getByText(
          /^We could not load the flagged bookings\. Nothing was changed\./,
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Try again" }),
      ).toBeVisible();
      await shot(page, "flagged-error");
    });

    test("no-permission for staff, no-permission-dealership for another dealership", async ({
      page,
    }) => {
      await start(page);
      await openAsUser(page, STAFF, "/manage/flagged");
      await expect(
        page.getByText(
          "Only the garage manager can review flagged bookings. Switch role, or go to your schedule.",
        ),
      ).toBeVisible();
      await shot(page, "flagged-no-permission");
      await openAsUser(
        page,
        "user-manager-london",
        "/manage/flagged?dealership=dealership-saigon",
      );
      await expect(
        page.getByRole("heading", {
          name: "You do not manage this dealership.",
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Show Fakeford Motors (demo)" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Switch role" }),
      ).toBeVisible();
      await shot(page, "flagged-no-permission-dealership");
    });
  });
}

test("flagged: no sideways scroll at 320 to 1440 wide, Move and Cancel wrap under the text (NFR-7)", async ({
  page,
}) => {
  await start(page);
  await fourFlagged(page);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await openFlagged(page);
    await expect(rows(page)).toHaveCount(4);
    await expectNoSidewaysScroll(page);
    const row = rows(page).first();
    const time = await row
      .getByText("12:30", { exact: false })
      .first()
      .boundingBox();
    const move = await row.getByRole("link", { name: /^Move/ }).boundingBox();
    // The time column stays beside the content: the buttons start to the right of it, below the text.
    expect(move!.x).toBeGreaterThan(time!.x + 60);
    expect(move!.y).toBeGreaterThan(time!.y);
    expect(move!.height).toBeGreaterThanOrEqual(44);
  }
});

test("Move opens adjust with the times that fit listed", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await start(page);
  const ids = await fourFlagged(page);
  await openFlagged(page);
  await page
    .getByRole("link", { name: /^Move Oil and filter change for Jonas/ })
    .click();
  await expect(page).toHaveURL(`/appointments/${ids.jonas}/adjust`);
  await expect(
    page
      .getByRole("group", { name: "Times that fit" })
      .getByRole("button")
      .first(),
  ).toBeVisible();
});

test("stored text is shown as text on the flagged list, adjust and appointment pages (SEC-11.AC-2)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const hostile = '<img src=x onerror="window.__xss=1">';
  await start(page);
  const { jonas } = await fourFlagged(page, {
    jonas: hostile,
    make: hostile,
    model: '"><script>window.__xss=1</script>',
  });
  const check = async () => {
    await expect(page.getByText(hostile).first()).toBeAttached();
    expect(await page.locator("main img, main script").count()).toBe(0);
    expect(
      await page.evaluate(() => (window as { __xss?: number }).__xss),
    ).toBeUndefined();
  };
  await openFlagged(page);
  await check();
  await page.goto(`/appointments/${jonas}/adjust`);
  await expect(
    page.getByRole("heading", { name: "Adjust appointment" }),
  ).toBeVisible();
  await check();
  await page.getByRole("button", { name: "Cancel appointment" }).click();
  await check();
  await page.goto(`/appointments/${jonas}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await check();
});

test("video: open a flagged booking, move it, hit a clash, pick a closest time, then cancel another", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: videoDir, size: { width: 1280, height: 800 } },
  });
  const page = await context.newPage();
  const pause = (ms = 900) => page.waitForTimeout(ms);
  await start(page);
  await fourFlagged(page);
  // Birch's Friday now ends at 13:00 and Ash is busy at 14:00, so a move to 14:00 is refused.
  await book(page, {
    date: "2026-10-30",
    time: "14:00",
    technicianId: ASH,
    name: "Tom Hale",
  });
  await openFlagged(page);
  await pause(1500);
  await page
    .getByRole("link", { name: /^Move Oil and filter change for Jonas/ })
    .click();
  await expect(
    page.getByRole("group", { name: "Times that fit" }),
  ).toBeVisible();
  await pause(1500);
  await chooseOption(selectNamed(page, "Start time"), "14:00");
  await pause();
  await page.getByRole("button", { name: "Save change" }).click();
  await expect(
    page.getByRole("heading", { name: "That change was not saved." }),
  ).toBeVisible();
  await pause(2000);
  await page
    .getByRole("group", { name: "Closest times that are free" })
    .getByRole("button")
    .first()
    .click();
  await pause();
  await page.getByRole("button", { name: "Save change" }).click();
  await expect(
    page.getByRole("heading", { name: "Change saved" }),
  ).toBeVisible();
  await pause(2000);
  await page.getByRole("link", { name: /^Flagged/ }).click();
  await expect(rows(page)).toHaveCount(3);
  await pause();
  await page
    .getByRole("button", { name: /^Cancel Oil and filter change for Ana/ })
    .click();
  await pause();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel appointment" })
    .click();
  await expect(rows(page)).toHaveCount(2);
  await pause(2500);
  const video = page.video()!;
  await context.close();
  await video.saveAs(`${videoDir}/manager-adjust-flagged-flow.webm`);
  await video.delete();
});
