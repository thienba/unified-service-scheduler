// `dealership-settings` in a real browser (C6, manager.md 4.3, 5.3): the form from the API, its checks, dates with
// different hours, booking rules, the warning before a save that flags bookings (D-0001-36 A), failures and access.
import { expect, test, type Page } from "@playwright/test";
import {
  interceptApi,
  problemBody,
  chooseOption,
  typeDate,
  dateNamed,
  selectNamed,
} from "./support";
import {
  LONDON,
  SAIGON,
  addDays,
  api,
  appointmentsOn,
  book,
  day,
  freeStarts,
  instant,
  next,
  openAs,
  today,
  writes,
} from "./manage-support";

const MANAGER = "user-manager-london";
const PATH = "/manage/dealership";

async function openSettings(page: Page, user = MANAGER, path = PATH) {
  await openAs(page, user, path);
  await expect(day(page, "Saturday")).toBeVisible();
}

const save = (page: Page) =>
  page.getByRole("button", { name: "Save settings" }).first().click();

/** Two bookings on the next Saturday that end after 14:00 (Saturday is open 09:00 to 16:00). */
async function twoSaturdayBookings(page: Page) {
  const saturday = next(6);
  const a = await book(page, "a", instant(saturday, "14:30"));
  const b = await book(page, "b", instant(saturday, "15:00"));
  return { saturday, ids: [a.id, b.id] };
}

test("the form shows the dealership's hours, dates and rules from the API, and never says override", async ({
  page,
}) => {
  await openSettings(page);
  for (const name of ["Monday", "Friday"]) {
    await expect(selectNamed(day(page, name), "Opens")).toHaveAttribute(
      "data-value",
      "08:00",
    );
    await expect(selectNamed(day(page, name), "Closes")).toHaveAttribute(
      "data-value",
      "18:00",
    );
  }
  await expect(selectNamed(day(page, "Saturday"), "Opens")).toHaveAttribute(
    "data-value",
    "09:00",
  );
  await expect(selectNamed(day(page, "Saturday"), "Closes")).toHaveAttribute(
    "data-value",
    "16:00",
  );
  await expect(day(page, "Sunday").getByLabel("Closed")).toBeChecked();
  await expect(selectNamed(day(page, "Sunday"), "Opens")).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "Different hours on one date" }),
  ).toBeVisible();
  await expect(page.getByLabel("Shortest notice (hours)")).toHaveValue("2");
  await expect(page.getByLabel("Furthest ahead (days)")).toHaveValue("30");
  await expect(
    page.getByLabel("Break between a technician’s jobs (minutes)"),
  ).toHaveValue("15");
  await expect(page.getByText("Europe/London (London time)")).toBeVisible();
  await expect(
    page.getByText(
      "The time zone was set when the dealership was set up. It cannot be changed here.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "A customer cannot book a start time sooner than this. It is also the last moment a customer can cancel or change a booking online.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Nothing has changed yet.")).toBeVisible();
  expect((await page.locator("main").innerText()).toLowerCase()).not.toContain(
    "override",
  );
});

test("ticking Closed empties and disables the day; the Save row and the phone bar follow the changes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSettings(page);
  await chooseOption(selectNamed(day(page, "Saturday"), "Closes"), "14:00");
  await expect(page.getByText("Saturday now closes at 14:00")).toBeVisible();
  await expect(
    page.getByText("Unsaved changes", { exact: true }),
  ).toBeVisible();
  await day(page, "Monday").getByLabel("Closed").check();
  await expect(selectNamed(day(page, "Monday"), "Opens")).toBeDisabled();
  await expect(selectNamed(day(page, "Monday"), "Opens")).toHaveAttribute(
    "data-value",
    "",
  );
  await expect(selectNamed(day(page, "Monday"), "Closes")).toHaveAttribute(
    "data-value",
    "",
  );
  await expect(page.getByText("Monday is now closed")).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByText("You have unsaved changes.")).toBeVisible();
});

test("six wrong values each show their own message, the summary links to each, and nothing is sent", async ({
  page,
}) => {
  const sent = writes(page);
  await openSettings(page);
  const taken = next(3, today(), 7);
  // A date already in the list.
  await typeDate(dateNamed(page, "Date"), taken);
  await chooseOption(selectNamed(page, "What happens on this date"), "closed");
  await page.getByRole("button", { name: "Add this date" }).click();
  await typeDate(dateNamed(page, "Date"), taken);

  // design.md 8.30: Closes crosses out the times up to Opens, so Monday's wrong pair is made by moving Opens
  // past the closing time.
  await chooseOption(selectNamed(day(page, "Monday"), "Closes"), "09:00");
  await chooseOption(selectNamed(day(page, "Monday"), "Opens"), "10:00");
  // D-0001-133: a time off the quarter hour cannot be chosen any more, so Tuesday's wrong value is an
  // opening time equal to its closing time.
  await chooseOption(selectNamed(day(page, "Tuesday"), "Opens"), "18:00");
  await page.getByLabel("Shortest notice (hours)").fill("80");
  await page.getByLabel("Furthest ahead (days)").fill("0");
  await page
    .getByLabel("Break between a technician’s jobs (minutes)")
    .fill("61");
  await save(page);

  await expect(
    page.getByText("6 things need fixing before we can save."),
  ).toBeVisible();
  await expect(page.getByText("Fix the 6 things above to save.")).toBeVisible();
  // Focus lands on the first problem, Monday's closing time.
  await expect(selectNamed(day(page, "Monday"), "Closes")).toBeFocused();
  await expect(
    page.getByText(
      "Monday closes at 09:00, before it opens at 10:00. Choose a closing time after 10:00.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Tuesday closes at 18:00, the same time it opens. Choose a closing time after 18:00.",
    ),
  ).toBeVisible();
  await expect(page.getByText(/^There is already a change for /)).toBeVisible();
  await expect(
    page.getByText(
      "Shortest notice must be between 0 and 72 hours. You entered 80.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Furthest ahead must be between 1 and 365 days."),
  ).toBeVisible();
  await expect(
    page.getByText("Break must be between 0 and 60 minutes."),
  ).toBeVisible();

  // The row's message is tied to its fields.
  const mondayClose = selectNamed(day(page, "Monday"), "Closes");
  await expect(mondayClose).toHaveAttribute("aria-invalid", "true");
  const described = await mondayClose.getAttribute("aria-describedby");
  expect(described).toBeTruthy();
  await expect(page.locator(`[id="${described}"]`)).toContainText(
    "Monday closes at 09:00",
  );

  // Each summary item moves focus to its row.
  await page
    .getByRole("link", {
      name: "Tuesday: closing time must be after opening time.",
    })
    .click();
  await expect(selectNamed(day(page, "Tuesday"), "Closes")).toBeFocused();

  expect(sent).toEqual([]);
});

test("Add this date only adds to the list, marked new, and sends nothing until Save", async ({
  page,
}) => {
  const sent = writes(page);
  await openSettings(page);
  const date = next(2, today(), 7);
  await typeDate(dateNamed(page, "Date"), date);
  await chooseOption(selectNamed(page, "Opens").last(), "08:00");
  await chooseOption(selectNamed(page, "Closes").last(), "20:00");
  await page.getByRole("button", { name: "Add this date" }).click();

  const list = page.getByRole("list", { name: "Dates with different hours" });
  await expect(list.getByText("New, not saved yet")).toBeVisible();
  await expect(list.getByText("Longer", { exact: true })).toBeVisible();
  await expect(list.getByText("Open 08:00 to 20:00")).toBeVisible();
  await expect(
    list.getByText(
      "Longer than usual: closes 2 hours later (usual 08:00 to 18:00).",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Adding a date does not save it. Nothing is saved until you press Save settings.",
    ),
  ).toBeVisible();
  expect(sent).toEqual([]);
  const stored = await api(page, `/dealerships/${LONDON}`, { user: MANAGER });
  expect(stored.body.dateOverrides).toEqual({});
});

test("saved dates change what availability lists: longer, shorter, closed, and the weekly hours with no entry", async ({
  page,
}) => {
  await openSettings(page);
  const longer = next(2, today(), 7); // a Tuesday, usually 08:00 to 18:00
  const shorter = next(3, today(), 7);
  const closed = next(4, today(), 7);
  const plain = next(5, today(), 7);
  const add = async (date: string, open: string, close: string) => {
    await typeDate(dateNamed(page, "Date"), date);
    if (open === "") {
      await chooseOption(
        selectNamed(page, "What happens on this date"),
        "closed",
      );
    } else {
      await chooseOption(
        selectNamed(page, "What happens on this date"),
        "hours",
      );
      await chooseOption(selectNamed(page, "Opens").last(), open);
      await chooseOption(selectNamed(page, "Closes").last(), close);
    }
    await page.getByRole("button", { name: "Add this date" }).click();
  };
  // Technicians stop by 17:30, so one works late that date: the longer hours are then the only limit.
  const birch = await api(
    page,
    `/dealerships/${LONDON}/technicians?from=${today()}&to=${addDays(today(), 30)}`,
    {
      user: MANAGER,
    },
  );
  const pattern = birch.body.find(
    (t: { id: string }) => t.id === "tech-lon-birch",
  ).shiftPattern;
  const late = await api(page, "/technicians/tech-lon-birch/shifts", {
    user: MANAGER,
    method: "PUT",
    body: {
      shiftPattern: pattern,
      shiftExceptions: {
        [longer]: { kind: "changed", shift: { start: "08:00", end: "20:00" } },
      },
    },
  });
  expect(late.status, JSON.stringify(late.body)).toBe(200);
  await add(longer, "08:00", "19:00");
  await add(shorter, "08:00", "12:00");
  await add(closed, "", "");
  await save(page);
  await expect(
    page.getByRole("heading", { name: "Settings saved" }),
  ).toBeVisible();

  const lateStarts = await freeStarts(page, longer);
  expect(lateStarts.some((s) => s.end > "18:00" && s.end <= "19:00")).toBe(
    true,
  );
  expect(lateStarts.every((s) => s.end <= "19:00")).toBe(true);
  const early = await freeStarts(page, shorter);
  expect(early.length).toBeGreaterThan(0);
  expect(early.every((s) => s.end <= "12:00")).toBe(true);
  expect(await freeStarts(page, closed)).toEqual([]);
  const usual = await freeStarts(page, plain);
  // The weekly hours apply (technicians stop by 17:30, so the last start ends then).
  expect(usual.some((s) => s.end === "17:30")).toBe(true);
  expect(usual.every((s) => s.end <= "18:00")).toBe(true);
});

test("two dealerships each show and save their own hours; a change at one leaves the other alone", async ({
  page,
}) => {
  await openSettings(page, "user-manager-saigon");
  await expect(selectNamed(day(page, "Monday"), "Opens")).toHaveAttribute(
    "data-value",
    "07:30",
  );
  await expect(page.getByText("Asia/Ho_Chi_Minh")).toBeVisible();
  const saigonBefore = await api(page, `/dealerships/${SAIGON}`, {
    user: "user-manager-saigon",
  });

  await openSettings(page);
  await expect(selectNamed(day(page, "Monday"), "Opens")).toHaveAttribute(
    "data-value",
    "08:00",
  );
  await chooseOption(selectNamed(day(page, "Monday"), "Opens"), "09:00");
  await save(page);
  await expect(
    page.getByRole("heading", { name: "Settings saved" }),
  ).toBeVisible();

  const london = await api(page, `/dealerships/${LONDON}`, { user: MANAGER });
  expect(london.body.weeklyHours["1"]).toEqual({
    open: "09:00",
    close: "18:00",
  });
  const saigonAfter = await api(page, `/dealerships/${SAIGON}`, {
    user: "user-manager-saigon",
  });
  expect(saigonAfter.body).toEqual(saigonBefore.body);
});

test("new booking rules apply to the next search and leave every booking as it was", async ({
  page,
}) => {
  await openSettings(page);
  const tomorrow = addDays(today(), 1);
  const keep = (list: Awaited<ReturnType<typeof appointmentsOn>>) =>
    list.map(({ id, start, end, technicianId, serviceBayId, version }) => ({
      id,
      start,
      end,
      technicianId,
      serviceBayId,
      version,
    }));
  const dates = [3, 4].map((n) => addDays(today(), n));
  const before = (
    await Promise.all(dates.map((d) => appointmentsOn(page, d)))
  ).flatMap(keep);
  expect(before.length).toBeGreaterThan(0);

  await page.getByLabel("Shortest notice (hours)").fill("48");
  await page.getByLabel("Furthest ahead (days)").fill("10");
  await page
    .getByLabel("Break between a technician’s jobs (minutes)")
    .fill("30");
  await save(page);
  await expect(
    page.getByRole("heading", { name: "Settings saved" }),
  ).toBeVisible();

  const stored = await api(page, `/dealerships/${LONDON}`, { user: MANAGER });
  expect(stored.body.policies).toMatchObject({
    leadTimeMinutes: 48 * 60,
    horizonDays: 10,
    breakMinutes: 30,
  });
  // 48 hours' notice: nothing tomorrow. Ten days ahead at most: nothing in eleven days.
  expect(await freeStarts(page, tomorrow)).toEqual([]);
  const far = next(2, today(), 11);
  expect(await freeStarts(page, far)).toEqual([]);

  const after = (
    await Promise.all(dates.map((d) => appointmentsOn(page, d)))
  ).flatMap(keep);
  expect(after).toEqual(before);
});

test("with nothing touched, Save previews first, then saves at once with Settings saved and the toast", async ({
  page,
}) => {
  const sent = writes(page);
  await interceptApi(page, { path: "/settings", delayMs: 700 });
  await openSettings(page);
  await page.getByLabel("Furthest ahead (days)").fill("40");
  await save(page);
  await expect(page.getByText("Checking bookings…").first()).toBeVisible();
  // While the preview runs nothing is stored.
  const during = await api(page, `/dealerships/${LONDON}`, { user: MANAGER });
  expect(during.body.policies.horizonDays).toBe(30);

  await expect(
    page.getByRole("heading", { name: "Settings saved" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "The new hours and rules apply to new bookings now. Every booking that already exists still fits.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Dealership settings saved.")).toBeVisible();
  expect(sent).toEqual([
    `PUT /api/dealerships/${LONDON}/settings?preview=true`,
    `PUT /api/dealerships/${LONDON}/settings`,
  ]);
});

test("shortening Saturday warns before saving: two bookings listed, Go back saves nothing, Save and flag flags them", async ({
  page,
}) => {
  await openSettings(page);
  const { saturday, ids } = await twoSaturdayBookings(page);
  const sent = writes(page);
  const before = await appointmentsOn(page, saturday);

  await chooseOption(selectNamed(day(page, "Saturday"), "Closes"), "14:00");
  const saveButton = page
    .getByRole("button", { name: "Save settings" })
    .first();
  await saveButton.click();
  const dialog = page.getByRole("dialog", {
    name: "Saving will flag 2 bookings",
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText(
      /^You changed Saturday: it now closes at 14:00 instead of 16:00\. Two bookings on \w{3} \d+ \w{3} end after that\.$/,
    ),
  ).toBeVisible();
  await expect(dialog.getByText(/, 14:30 to 15:30$/)).toBeVisible();
  await expect(
    dialog.getByText(/ · Demo Customer A · ends .+ after closing$/),
  ).toBeVisible();
  await expect(
    dialog.getByText(
      "They stay booked and keep their technician and bay. Nothing is deleted or moved.",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Go back and edit" }),
  ).toBeFocused();
  expect(sent).toEqual([
    `PUT /api/dealerships/${LONDON}/settings?preview=true`,
  ]);
  const stored = await api(page, `/dealerships/${LONDON}`, { user: MANAGER });
  expect(stored.body.weeklyHours["6"].close).toBe("16:00");

  // Esc goes back, focus returns to Save, and the edit is still there.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(saveButton).toBeFocused();
  await expect(selectNamed(day(page, "Saturday"), "Closes")).toHaveAttribute(
    "data-value",
    "14:00",
  );

  // The scrim does not close it.
  await saveButton.click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(dialog).toBeVisible();

  await dialog
    .getByRole("button", { name: "Save and flag 2 bookings" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Saved. 2 bookings no longer fit." }),
  ).toBeVisible();
  await expect(
    page.getByText("Dealership settings saved. 2 bookings flagged."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Review flagged bookings" }),
  ).toHaveAttribute("href", "/manage/flagged");
  expect(sent.filter((s) => !s.includes("preview"))).toEqual([
    `PUT /api/dealerships/${LONDON}/settings`,
  ]);

  const after = await appointmentsOn(page, saturday);
  expect(
    after
      .filter((a) => a.flags.length > 0)
      .map((a) => a.id)
      .sort(),
  ).toEqual([...ids].sort());
  expect(
    after.map(({ id, start, end, technicianId, serviceBayId }) => ({
      id,
      start,
      end,
      technicianId,
      serviceBayId,
    })),
  ).toEqual(
    before.map(({ id, start, end, technicianId, serviceBayId }) => ({
      id,
      start,
      end,
      technicianId,
      serviceBayId,
    })),
  );
});

test("the warning lists five bookings and says how many more", async ({
  page,
}) => {
  await openSettings(page);
  const saturday = next(6);
  // As many one-hour bookings as fit, from 09:00 on the quarter hour; closing Saturday shuts all of them out.
  for (let minutes = 9 * 60; minutes <= 15 * 60; minutes += 15) {
    const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    for (const customer of ["a", "b"] as const) {
      await api(page, "/appointments", {
        user: `user-customer-${customer}`,
        method: "POST",
        body: {
          dealershipId: LONDON,
          serviceTypeId: "service-oil-change",
          start: instant(saturday, time),
          transport: "wait",
          vehicleId: `vehicle-${customer}`,
        },
      });
    }
  }
  const count = (await appointmentsOn(page, saturday)).length;
  expect(count).toBeGreaterThan(5);
  await day(page, "Saturday").getByLabel("Closed").check();
  await save(page);
  const dialog = page.getByRole("dialog", {
    name: `Saving will flag ${count} bookings`,
  });
  await expect(dialog.getByRole("listitem")).toHaveCount(6);
  await expect(dialog.getByText(`and ${count - 5} more`)).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: `Save and flag ${count} bookings` }),
  ).toBeVisible();
});

for (const failure of [
  { name: "a 500", rule: { status: 500, body: problemBody(500, "INTERNAL") } },
  { name: "no network", rule: { networkError: true } },
]) {
  test(`a save that fails with ${failure.name} keeps the edits and offers Try again`, async ({
    page,
  }) => {
    await interceptApi(page, { path: "/settings", ...failure.rule });
    await openSettings(page);
    await chooseOption(selectNamed(day(page, "Saturday"), "Closes"), "15:00");
    await save(page);
    await expect(
      page.getByRole("heading", { name: "Your changes were not saved" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        /^We could not reach the booking service\. Nothing was changed, and your edits are still here\./,
      ),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(selectNamed(day(page, "Saturday"), "Closes")).toHaveAttribute(
      "data-value",
      "15:00",
    );
  });
}

test("leaving with unsaved changes asks first, with Keep editing first", async ({
  page,
}) => {
  await openSettings(page);
  await chooseOption(selectNamed(day(page, "Saturday"), "Closes"), "15:00");
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Shifts" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Leave without saving?" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", {
      name: /^(Keep editing|Leave without saving)$/,
    }),
  ).toHaveText(["Keep editing", "Leave without saving"]);
  await expect(
    dialog.getByRole("button", { name: "Keep editing" }),
  ).toBeFocused();
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(page).toHaveURL(/\/manage\/dealership$/);
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Shifts" })
    .click();
  await dialog.getByRole("button", { name: "Leave without saving" }).click();
  await expect(page).toHaveURL(/\/manage\/shifts$/);
});

test("loading shows a skeleton and a failed load shows the error with Try again", async ({
  page,
}) => {
  await interceptApi(page, {
    path: `/dealerships/${LONDON}`,
    status: 500,
    body: problemBody(500, "INTERNAL"),
  });
  await openAs(page, MANAGER, PATH);
  await expect(
    page.getByRole("heading", { name: "Something went wrong on our side." }),
  ).toBeVisible();
  await expect(
    page.getByText(/^We could not load the settings\./),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

for (const [role, user] of [
  ["Customer", "user-customer-a"],
  ["Staff", "user-staff-london"],
] as const) {
  test(`a ${role} sees no-permission, no fields and sends no PUT`, async ({
    page,
  }) => {
    const sent = writes(page);
    await openAs(page, user, PATH);
    await expect(
      page.getByRole("heading", { name: `You cannot do that as ${role}.` }),
    ).toBeVisible();
    if (role === "Staff") {
      await expect(
        page.getByText(
          "Only the garage manager can change opening hours and booking rules.",
          { exact: false },
        ),
      ).toBeVisible();
    }
    await expect(
      page.getByRole("button", { name: "Switch role" }),
    ).toBeVisible();
    await expect(page.locator("main input")).toHaveCount(0);
    expect(sent).toEqual([]);
  });
}

test("a manager who opens another dealership sees no-permission-dealership and none of its data", async ({
  page,
}) => {
  await openAs(page, MANAGER, `${PATH}?dealership=${SAIGON}`);
  await expect(
    page.getByRole("heading", { name: "You do not manage this dealership." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Show Fakeford Motors (demo)" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Switch role" })).toBeVisible();
  await expect(page.locator("main input")).toHaveCount(0);
  await expect(page.getByText("07:30")).toHaveCount(0);
});
