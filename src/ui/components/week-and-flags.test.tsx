// design.md 8.23 to 8.25: WeekPatternEditor, DateExceptionList and FlagImpactDialog in their states.
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
  const close = within(monday).getByLabelText("Closes");
  expect(close.getAttribute("aria-invalid")).toBe("true");
  const describedBy = close.getAttribute("aria-describedby")!;
  expect(document.getElementById(describedBy)?.textContent).toContain(
    "Monday closes at 07:00.",
  );
  const sunday = screen.getByRole("group", { name: "Sunday" });
  expect(
    (within(sunday).getByLabelText("Opens") as HTMLInputElement).disabled,
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
  expect(within(monday).getAllByDisplayValue(/./)).toHaveLength(3);
  expect(
    within(monday).getByText("Dealership open 08:00 to 18:00"),
  ).toBeTruthy();
  expect(within(monday).getByLabelText("Break ends (optional)")).toBeTruthy();
});

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
