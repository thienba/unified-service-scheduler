// `shifts` in a real browser (C6, manager.md 4.4, 5.4): one technician's weekly pattern, leave and extra shifts,
// the same warning before a save that flags bookings (D-0001-36 A), the empty and not-found states, and access.
import { expect, test, type Page } from "@playwright/test";
import { interceptApi } from "./support";
import {
  LONDON,
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
const PATH = "/manage/shifts";

async function openShifts(page: Page, path = PATH, user = MANAGER) {
  await openAs(page, user, path);
  await expect(day(page, "Saturday")).toBeVisible();
}

const save = (page: Page) =>
  page.getByRole("button", { name: "Save shifts" }).first().click();

const saved = (page: Page) =>
  expect(page.getByRole("heading", { name: "Shifts saved" })).toBeVisible();

/** Fills the add form and presses Add to the list. */
async function addEntry(
  page: Page,
  first: string,
  kind: "leave" | "changed",
  times?: { start: string; end: string },
) {
  await page.getByLabel("First day").fill(first);
  await page.getByLabel("What happens on these days").selectOption(kind);
  if (times) {
    const form = page.getByRole("group", {
      name: "Add leave or a different shift",
    });
    await form.getByLabel("Starts", { exact: true }).fill(times.start);
    await form.getByLabel("Ends", { exact: true }).fill(times.end);
  }
  await page.getByRole("button", { name: "Add to the list" }).click();
}

test("the technician's weekly pattern comes from the API, with the dealership's hours beside each day", async ({
  page,
}) => {
  await openShifts(page);
  const select = page.getByRole("combobox", { name: "Technician" });
  await expect(select.locator("option")).toHaveText([
    "Demo Tech Ash · Service, Electric cars",
    "Demo Tech Birch · Service",
    "Demo Tech Cedar · Electric cars",
  ]);
  await expect(
    page.getByText(
      "Skills: Service, Electric cars. Skills come with the demo data and are not edited here.",
    ),
  ).toBeVisible();
  const monday = day(page, "Monday");
  await expect(
    monday.getByText("Dealership open 08:00 to 18:00"),
  ).toBeVisible();
  await expect(monday.getByLabel("Day off")).not.toBeChecked();
  await expect(monday.getByLabel("Starts", { exact: true })).toHaveValue(
    "08:00",
  );
  await expect(monday.getByLabel("Ends", { exact: true })).toHaveValue("16:30");
  await expect(monday.getByLabel("Break starts (optional)")).toHaveValue(
    "12:00",
  );
  await expect(monday.getByLabel("Break ends (optional)")).toHaveValue("13:00");
  await expect(
    day(page, "Saturday").getByText("Dealership open 09:00 to 16:00"),
  ).toBeVisible();
  await expect(
    day(page, "Sunday").getByText("Dealership closed"),
  ).toBeVisible();
  await expect(day(page, "Sunday").getByLabel("Day off")).toBeChecked();

  await page.getByRole("button", { name: "Next technician" }).click();
  await expect(page).toHaveURL(/technicianId=tech-lon-birch/);
  await expect(select).toHaveValue("tech-lon-birch");
  await expect(
    day(page, "Monday").getByLabel("Starts", { exact: true }),
  ).toHaveValue("09:00");
  await page.getByRole("button", { name: "Previous technician" }).click();
  await expect(select).toHaveValue("tech-lon-ash");
});

test("a half break, a break outside the shift, an end before the start and a last day before the first each show their message; nothing is sent", async ({
  page,
}) => {
  const sent = writes(page);
  await openShifts(page);
  await day(page, "Monday").getByLabel("Break ends (optional)").fill("");
  await day(page, "Tuesday")
    .getByLabel("Break starts (optional)")
    .fill("07:00");
  await day(page, "Wednesday")
    .getByLabel("Ends", { exact: true })
    .fill("07:00");
  const first = next(4, today(), 7);
  await page.getByLabel("First day").fill(first);
  await page.getByLabel("Last day (optional)").fill(addDays(first, -1));
  await save(page);

  await expect(
    page.getByText("4 things need fixing before we can save."),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Monday has a break start but no break end. Add both break times, or leave both empty.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Tuesday’s break starts at 07:00, before the shift starts at 08:00. Put the break inside the shift.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Wednesday ends at 07:00, before it starts at 08:00. Choose an end time after 08:00.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "The last day is before the first day. Choose the same day or a later one.",
    ),
  ).toBeVisible();
  const breakEnd = day(page, "Monday").getByLabel("Break ends (optional)");
  await expect(breakEnd).toHaveAttribute("aria-invalid", "true");
  await expect(breakEnd).toHaveAttribute("aria-describedby", /.+/);
  expect(sent).toEqual([]);
});

test("new entries are marked until saved; a different shift shows four times and leave hides them", async ({
  page,
}) => {
  const sent = writes(page);
  await openShifts(page);
  const form = page.getByRole("group", {
    name: "Add leave or a different shift",
  });
  await expect(form.getByLabel("Starts", { exact: true })).toHaveCount(0);
  await page.getByLabel("What happens on these days").selectOption("changed");
  for (const label of [
    "Starts",
    "Ends",
    "Break starts (optional)",
    "Break ends (optional)",
  ]) {
    await expect(form.getByLabel(label, { exact: true })).toBeVisible();
  }
  await addEntry(page, next(2, today(), 7), "leave");
  const list = page.getByRole("list", {
    name: "Dates that differ from the weekly pattern",
  });
  await expect(list.getByText("New, not saved yet")).toBeVisible();
  await expect(list.getByText("On leave all day")).toBeVisible();
  expect(sent).toEqual([]);
  await save(page);
  await saved(page);
  await expect(list.getByText("New, not saved yet")).toHaveCount(0);
});

test("leave on a date takes the technician out of availability; an extra shift on a day off puts them in", async ({
  page,
}) => {
  await openShifts(page, `${PATH}?technicianId=tech-lon-birch`);
  const tuesday = next(2, today(), 7);
  expect(
    (await freeStarts(page, tuesday, { technicianId: "tech-lon-birch" }))
      .length,
  ).toBeGreaterThan(0);
  await addEntry(page, tuesday, "leave");
  await save(page);
  await saved(page);
  expect(
    await freeStarts(page, tuesday, { technicianId: "tech-lon-birch" }),
  ).toEqual([]);

  // Saturday becomes a day off in the pattern, then one Saturday gets an extra shift.
  const saturday = next(6, today(), 7);
  await day(page, "Saturday").getByLabel("Day off").check();
  await save(page);
  await saved(page);
  expect(
    await freeStarts(page, saturday, { technicianId: "tech-lon-birch" }),
  ).toEqual([]);
  await addEntry(page, saturday, "changed", { start: "09:00", end: "13:00" });
  const list = page.getByRole("list", {
    name: "Dates that differ from the weekly pattern",
  });
  await expect(list.getByText("Extra shift", { exact: true })).toBeVisible();
  await save(page);
  await saved(page);
  const extra = await freeStarts(page, saturday, {
    technicianId: "tech-lon-birch",
  });
  expect(extra.length).toBeGreaterThan(0);
  expect(extra.every((s) => s.start >= "09:00" && s.end <= "13:00")).toBe(true);
});

test("marking a technician on leave on a day with a booking warns first, then flags it without deleting it", async ({
  page,
}) => {
  await openAs(page, MANAGER, PATH);
  const monday = next(1);
  const booked = await book(page, "a", instant(monday, "10:00"));
  const people = await api(
    page,
    `/dealerships/${LONDON}/technicians?from=${today()}&to=${monday}`,
    { user: MANAGER },
  );
  const name = people.body.find(
    (t: { id: string }) => t.id === booked.technicianId,
  ).name as string;
  const sent = writes(page);
  await openShifts(page, `${PATH}?technicianId=${booked.technicianId}`);
  await addEntry(page, monday, "leave");
  await save(page);

  const dialog = page.getByRole("dialog", {
    name: "Saving will flag 1 booking",
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText(
      new RegExp(
        `^You marked ${name} on leave on Mon \\d+ \\w{3}\\. One booking is with ${name} that day\\.$`,
      ),
    ),
  ).toBeVisible();
  await expect(
    dialog.getByText(new RegExp(`${name} is on leave$`)),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Go back and edit" }),
  ).toBeFocused();
  expect(sent).toEqual([
    `PUT /api/technicians/${booked.technicianId}/shifts?preview=true`,
  ]);
  await dialog.getByRole("button", { name: "Save and flag 1 booking" }).click();
  await expect(
    page.getByRole("heading", { name: "Saved. 1 booking no longer fits." }),
  ).toBeVisible();
  await expect(
    page.getByText("Shifts saved. 1 booking flagged."),
  ).toBeVisible();
  const after = await appointmentsOn(page, monday);
  const mine = after.find((a) => a.id === booked.id)!;
  expect(mine.flags.length).toBeGreaterThan(0);
  expect(mine.technicianId).toBe(booked.technicianId);
  expect(mine.status).not.toBe("cancelled");
});

test("switching technician with unsaved edits asks first, with Keep editing first", async ({
  page,
}) => {
  await openShifts(page);
  await day(page, "Monday").getByLabel("Ends", { exact: true }).fill("16:00");
  await page
    .getByRole("combobox", { name: "Technician" })
    .selectOption("tech-lon-birch");
  const dialog = page.getByRole("dialog", {
    name: "Switch technician without saving?",
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", {
      name: /^(Keep editing|Switch without saving)$/,
    }),
  ).toHaveText(["Keep editing", "Switch without saving"]);
  await expect(
    dialog.getByRole("button", { name: "Keep editing" }),
  ).toBeFocused();
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(page.getByRole("combobox", { name: "Technician" })).toHaveValue(
    "tech-lon-ash",
  );
  await expect(
    day(page, "Monday").getByLabel("Ends", { exact: true }),
  ).toHaveValue("16:00");
  await page.getByRole("button", { name: "Next technician" }).click();
  await dialog.getByRole("button", { name: "Switch without saving" }).click();
  await expect(page.getByRole("combobox", { name: "Technician" })).toHaveValue(
    "tech-lon-birch",
  );
});

test("a dealership with no technicians shows No technicians yet with the dev panel link", async ({
  page,
}) => {
  await interceptApi(page, { path: "/technicians", status: 200, body: [] });
  await openAs(page, MANAGER, PATH);
  await expect(
    page.getByRole("heading", { name: "No technicians yet" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open the dev panel" }),
  ).toBeVisible();
});

test("a technician of another dealership is not found, with Show all technicians", async ({
  page,
}) => {
  await openAs(page, MANAGER, `${PATH}?technicianId=tech-sgn-an`);
  await expect(
    page.getByRole("heading", { name: "We cannot find that technician." }),
  ).toBeVisible();
  await expect(page.getByText("Demo Tech An")).toHaveCount(0);
  await page.getByRole("link", { name: "Show all technicians" }).click();
  await expect(day(page, "Monday")).toBeVisible();
});

for (const [role, user] of [
  ["Customer", "user-customer-a"],
  ["Staff", "user-staff-london"],
] as const) {
  test(`a ${role} opening shifts sees no-permission, no fields and sends no PUT`, async ({
    page,
  }) => {
    const sent = writes(page);
    await openAs(page, user, PATH);
    await expect(
      page.getByRole("heading", { name: `You cannot do that as ${role}.` }),
    ).toBeVisible();
    if (role === "Staff") {
      await expect(
        page.getByText("Only the garage manager can change shifts.", {
          exact: false,
        }),
      ).toBeVisible();
    }
    await expect(page.locator("main input")).toHaveCount(0);
    expect(sent).toEqual([]);
  });
}
