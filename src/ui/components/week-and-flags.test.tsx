// design.md 8.23 to 8.25: WeekPatternEditor, DateExceptionList and FlagImpactDialog in their states.
import "../testing/css-escape";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DateExceptionList } from "./DateExceptionList";
import { FlagImpactDialog } from "./FlagImpactDialog";
import { WeekPatternEditor } from "./WeekPatternEditor";

afterEach(cleanup);

it("WeekPatternEditor: a group per weekday, Closed disables the times, the row error is tied to its fields", () => {
  const onChange = vi.fn();
  render(
    <WeekPatternEditor
      mode="hours"
      onChange={onChange}
      days={[
        {
          label: "Monday",
          off: false,
          times: { open: "08:00", close: "07:00" },
          error: { fields: ["close"], message: "Monday closes at 07:00." },
        },
        { label: "Sunday", off: true, times: { open: "", close: "" } },
      ]}
    />,
  );
  const monday = screen.getByRole("group", { name: "Monday" });
  const close = within(monday).getByRole("button", { name: /^Closes/ });
  expect(close.getAttribute("aria-invalid")).toBe("true");
  const describedBy = close.getAttribute("aria-describedby")!;
  expect(document.getElementById(describedBy)?.textContent).toContain(
    "Monday closes at 07:00.",
  );
  const sunday = screen.getByRole("group", { name: "Sunday" });
  expect(
    (
      within(sunday).getByRole("button", {
        name: /^Opens/,
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.click(within(monday).getByLabelText("Closed"));
  expect(onChange).toHaveBeenCalledWith(0, { off: true });
});

it("WeekPatternEditor: shift mode has Day off and four time fields", () => {
  render(
    <WeekPatternEditor
      mode="shift"
      onChange={() => {}}
      days={[
        {
          label: "Monday",
          hint: "Dealership open 08:00 to 18:00",
          off: false,
          times: { start: "08:00", end: "16:30", breakStart: "", breakEnd: "" },
        },
      ]}
    />,
  );
  const monday = screen.getByRole("group", { name: "Monday" });
  expect(within(monday).getByLabelText("Day off")).toBeTruthy();
  // Three fields show a value: Starts, Ends and the Day off box; the two break times read "Not set".
  const times = within(monday).getAllByRole("button", {
    name: /^(Starts|Ends|Break)/,
  });
  expect(times.map((t) => t.getAttribute("data-value"))).toEqual([
    "08:00",
    "16:30",
    "",
    "",
  ]);
  expect(times[2]!.textContent).toBe("Not set");
  expect(
    within(monday).getByText("Dealership open 08:00 to 18:00"),
  ).toBeTruthy();
  expect(
    within(monday).getByRole("button", { name: /^Break ends \(optional\)/ }),
  ).toBeTruthy();
});

// design.md 8.30 ("Ends"): an end time crosses out the times up to its start, and says why once at the top.
for (const [mode, key, label, times, reason] of [
  [
    "hours",
    "close",
    "Closes",
    { open: "09:00", close: "18:00" },
    "Not up to 09:00: this must close after it opens at 09:00.",
  ],
  [
    "shift",
    "end",
    "Ends",
    { start: "09:00", end: "16:30", breakStart: "", breakEnd: "" },
    "Not up to 09:00: this must end after it starts at 09:00.",
  ],
] as const) {
  it(`WeekPatternEditor: ${label} crosses out the times up to the start, with the reason`, async () => {
    const onChange = vi.fn();
    render(
      <WeekPatternEditor
        mode={mode}
        onChange={onChange}
        days={[{ label: "Monday", off: false, times }]}
      />,
    );
    const monday = screen.getByRole("group", { name: "Monday" });
    fireEvent.click(
      within(monday).getByRole("button", { name: new RegExp(`^${label}`) }),
    );
    const list = await screen.findByRole("listbox");
    expect(
      document.getElementById(list.getAttribute("aria-describedby")!)
        ?.textContent,
    ).toBe(reason);
    const option = (value: string) =>
      within(list)
        .getAllByRole("option")
        .find((o) => o.getAttribute("data-value") === value)!;
    expect(option("08:00").getAttribute("aria-disabled")).toBe("true");
    expect(option("09:00").getAttribute("aria-disabled")).toBe("true");
    expect(option("09:15").getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(option("09:00"));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(option("09:15"));
    expect(onChange).toHaveBeenCalledWith(0, { key, value: "09:15" });
  });
}

it("DateExceptionList: empty text, new badge, remove named by its date, and the line that adding does not save", () => {
  const onRemove = vi.fn();
  const { rerender } = render(
    <DateExceptionList
      listLabel="Dates"
      items={[]}
      onRemove={onRemove}
      addLegend="Add a date"
      addNote="Adding a date does not save it. Nothing is saved until you press Save settings."
    >
      <span />
    </DateExceptionList>,
  );
  expect(screen.getByText("No dates yet.")).toBeTruthy();
  rerender(
    <DateExceptionList
      listLabel="Dates"
      items={[
        {
          key: "2026-11-14",
          dateText: "Sat 14 Nov",
          badge: { label: "Longer", icon: "plus" },
          isNew: true,
          summary: "Open 08:00 to 19:00",
          comparison: "Longer than usual.",
        },
      ]}
      onRemove={onRemove}
      addLegend="Add a date"
      addNote="Adding a date does not save it. Nothing is saved until you press Save settings."
    >
      <span />
    </DateExceptionList>,
  );
  expect(screen.getByText("New, not saved yet")).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Remove the change for Sat 14 Nov" }),
  );
  expect(onRemove).toHaveBeenCalledWith("2026-11-14");
  expect(
    screen.getByText(
      "Adding a date does not save it. Nothing is saved until you press Save settings.",
    ),
  ).toBeTruthy();
});

it("FlagImpactDialog: five rows then 'and 3 more', starts on Go back, Esc goes back, confirm is not danger", () => {
  const onBack = vi.fn();
  const onConfirm = vi.fn();
  render(
    <FlagImpactDialog
      open
      changeSentence="You changed Saturday."
      bookings={Array.from({ length: 8 }, (_, i) => ({
        key: String(i),
        when: `Sat 31 Oct, 1${i}:00 to 1${i}:30`,
        detail: "Inspection",
      }))}
      onBack={onBack}
      onConfirm={onConfirm}
    />,
  );
  const dialog = screen.getByRole("dialog", {
    name: "Saving will flag 8 bookings",
  });
  expect(within(dialog).getAllByRole("listitem")).toHaveLength(6);
  expect(within(dialog).getByText("and 3 more")).toBeTruthy();
  expect(document.activeElement?.textContent).toBe("Go back and edit");
  const confirm = within(dialog).getByRole("button", {
    name: "Save and flag 8 bookings",
  });
  expect(confirm.className).not.toMatch(/danger/);
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(onBack).toHaveBeenCalled();
  fireEvent.click(confirm);
  expect(onConfirm).toHaveBeenCalled();
});
