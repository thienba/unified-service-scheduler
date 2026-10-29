// design.md 8.27 to 8.30 (D-0001-131, 132, 133): the themed Select, TimeField, DatePicker and the schedule's
// day button. Keys, names, the 15-minute 24-hour list and the date limits.
import "../testing/css-escape";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { DatePicker, DayButton } from "./DatePicker";
import { Select } from "./Select";
import { TimeField, timeOptions } from "./TimeField";

afterEach(cleanup);

const services = [
  { value: "oil", label: "Oil change" },
  { value: "full", label: "Full service" },
  {
    value: "ev",
    label: "EV battery check",
    disabledReason: "Not offered at Northgate Motors.",
  },
  { value: "tyres", label: "Tyre change" },
];

function ServiceSelect({ onChange }: { onChange?: (v: string) => void }) {
  const [value, setValue] = useState("full");
  return (
    <Select
      label="Service"
      name="serviceTypeId"
      required
      helper="Choose the job."
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
      options={services}
    />
  );
}

/** React Aria puts focus back after the popup has gone, a frame later. */
const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });

const key = (target: Element, k: string) => {
  fireEvent.keyDown(target, { key: k });
  fireEvent.keyUp(target, { key: k });
};

it("Select: the visible label then the value name the button; helper is its description; the id is field-<name>", () => {
  render(<ServiceSelect />);
  const button = screen.getByRole("button", {
    name: "Service (required) Full service",
  });
  expect(button.id).toBe("field-serviceTypeId");
  expect(button.getAttribute("aria-haspopup")).toBe("listbox");
  expect(button.getAttribute("aria-expanded")).toBe("false");
  expect(
    document.getElementById(button.getAttribute("aria-describedby")!)
      ?.textContent,
  ).toBe("Choose the job.");
});

it("Select keyboard: Down arrow opens on the chosen option, arrows skip a disabled option, Enter chooses and focus returns", async () => {
  const onChange = vi.fn();
  render(<ServiceSelect onChange={onChange} />);
  const button = screen.getByRole("button", { name: /^Service/ });
  act(() => button.focus());
  key(button, "ArrowDown");
  const list = await screen.findByRole("listbox", { name: /Service/ });
  await act(async () => {});
  expect(document.activeElement?.textContent).toBe("Full service");
  expect(
    within(list)
      .getByRole("option", { name: /EV battery check/ })
      .getAttribute("aria-disabled"),
  ).toBe("true");
  key(document.activeElement!, "ArrowDown");
  // The disabled EV check is skipped.
  expect(document.activeElement?.textContent).toBe("Tyre change");
  key(document.activeElement!, "Enter");
  expect(onChange).toHaveBeenLastCalledWith("tyres");
  expect(screen.queryByRole("listbox")).toBeNull();
  await settle();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: /^Service/ }),
  );
});

it("Select keyboard: Esc closes without a change and focus returns to the button", async () => {
  const onChange = vi.fn();
  render(<ServiceSelect onChange={onChange} />);
  const button = screen.getByRole("button", { name: /^Service/ });
  act(() => button.focus());
  key(button, "Enter");
  await screen.findByRole("listbox");
  await act(async () => {});
  key(document.activeElement!, "ArrowUp");
  key(document.activeElement!, "Escape");
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
  await settle();
  expect(document.activeElement).toBe(button);
});

it("Select: loading, failed and empty lists show a message, never an option", async () => {
  const retry = vi.fn();
  render(
    <>
      <Select
        label="Loading"
        loading
        loadingText="Loading services…"
        value=""
        onChange={() => {}}
        options={[]}
      />
      <Select
        label="Failed"
        loadError="Could not load the services. Nothing was changed."
        onRetry={retry}
        value=""
        onChange={() => {}}
        options={[]}
      />
    </>,
  );
  const loading = screen.getByRole("button", { name: /^Loading/ });
  expect(loading.getAttribute("aria-busy")).toBe("true");
  expect(loading.textContent).toBe("Loading services…");
  fireEvent.click(screen.getByRole("button", { name: /^Failed/ }));
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("Could not load the services.");
  fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalled();
  expect(screen.queryByRole("option")).toBeNull();
});

it("TimeField (D-0001-133): 96 quarter hours from 00:00 to 23:45 on a 24-hour clock, whatever the language", () => {
  const options = timeOptions({ value: "" });
  expect(options).toHaveLength(96);
  expect(options[0]!.label).toBe("00:00");
  expect(options[95]!.label).toBe("23:45");
  expect(
    options.every((o) => /^([01]\d|2[0-3]):(00|15|30|45)$/.test(o.label)),
  ).toBe(true);
  expect(options.filter((o) => o.hour)).toHaveLength(24);
  // Typing the four digits picks a time.
  expect(options.find((o) => o.value === "08:30")!.textValue).toBe("0830");
});

it("TimeField: a saved time off the quarter hour stays, once, marked (current); an optional field starts with Not set", () => {
  const current = timeOptions({ value: "08:10" });
  expect(current.filter((o) => o.value === "08:10")).toEqual([
    { value: "08:10", label: "08:10 (current)", textValue: "0810" },
  ]);
  const at = current.findIndex((o) => o.value === "08:10");
  expect(current[at - 1]!.value).toBe("08:00");
  expect(current[at + 1]!.value).toBe("08:15");
  const optional = timeOptions({ value: "", optional: true });
  expect(optional[0]).toEqual({
    value: "",
    label: "Not set",
    textValue: "Not set",
  });
});

it("TimeField: times outside min and max are crossed out and cannot be chosen; one note at the top says why", async () => {
  render(
    <TimeField
      label="Ends"
      value="09:30"
      onChange={() => {}}
      min="09:15"
      disabledReason="Not up to 09:00: this must end after it starts at 09:00."
    />,
  );
  const button = screen.getByRole("button", { name: "Ends 09:30" });
  fireEvent.click(button);
  const list = await screen.findByRole("listbox");
  expect(
    document.getElementById(list.getAttribute("aria-describedby")!)
      ?.textContent,
  ).toBe("Not up to 09:00: this must end after it starts at 09:00.");
  const nine = within(list)
    .getAllByRole("option")
    .find((o) => o.getAttribute("data-value") === "09:00")!;
  expect(nine.getAttribute("aria-disabled")).toBe("true");
  expect(nine.className).toContain("is-struck");
  const quarter = within(list)
    .getAllByRole("option")
    .find((o) => o.getAttribute("data-value") === "09:15")!;
  expect(quarter.getAttribute("aria-disabled")).toBeNull();
});

it("TimeField: with no value it opens with 08:00 in focus", async () => {
  render(<TimeField label="Start time" value="" onChange={() => {}} />);
  const button = screen.getByRole("button", {
    name: "Start time Choose a time",
  });
  act(() => button.focus());
  key(button, "ArrowDown");
  await screen.findByRole("listbox");
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  expect(document.activeElement?.getAttribute("data-value")).toBe("08:00");
});

function AdjustDate({ onChange }: { onChange?: (v: string) => void }) {
  const [value, setValue] = useState("2026-10-30");
  return (
    <DatePicker
      label="Date"
      name="date"
      today="2026-10-28"
      min="2026-10-28"
      max="2026-11-27"
      closed={(d) => new Date(`${d}T12:00:00Z`).getUTCDay() === 0}
      limitsText="Crossed-out days cannot be chosen: bookings need 2 hours notice and open up to 30 days ahead, until Fri 27 Nov."
      tooLateReason="Bookings open up to Fri 27 Nov."
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
}

const cell = (grid: HTMLElement, label: RegExp) =>
  within(grid)
    .getAllByRole("button")
    .find((b) => label.test(b.getAttribute("aria-label") ?? ""))!;

it("DatePicker: a group named by the label with day, month and year segments (dd/mm/yyyy) and the date in words", () => {
  render(<AdjustDate />);
  const group = screen.getByRole("group", { name: "Date" });
  expect(group.id).toBe("field-date");
  const segments = within(group).getAllByRole("spinbutton");
  expect(segments.map((s) => s.getAttribute("aria-label"))).toEqual([
    "day, ",
    "month, ",
    "year, ",
  ]);
  expect(segments.map((s) => s.textContent)).toEqual(["30", "10", "2026"]);
  expect(screen.getByText("Fri 30 Oct")).toBeTruthy();
  expect(within(group).getByRole("button", { name: /^Calendar/ })).toBeTruthy();
});

it("DatePicker limits (D-0001-132): days before the first and after the last day are disabled, closed days unavailable, and the reason is written", async () => {
  render(<AdjustDate />);
  fireEvent.click(screen.getByRole("button", { name: /^Calendar/ }));
  const dialog = await screen.findByRole("dialog");
  const grid = within(dialog).getByRole("grid");
  expect(grid.getAttribute("aria-label")).toContain("October 2026");
  const before = cell(grid, /27 October 2026/);
  expect(before.getAttribute("aria-disabled")).toBe("true");
  // 1 November is in the next month: October's grid leaves its cell empty (hidden by app.css).
  const outside = cell(grid, /Sunday, 1 November 2026/);
  expect(outside.getAttribute("data-outside-month")).toBe("true");
  expect(outside.textContent).toBe("");
  expect(
    within(dialog).getByText(/Crossed-out days cannot be chosen/),
  ).toBeTruthy();
  expect(
    within(dialog).getByRole("button", { name: "Previous month" }),
  ).toHaveProperty("disabled", true);
  fireEvent.click(within(dialog).getByRole("button", { name: "Next month" }));
  const november = within(dialog).getByRole("grid");
  expect(november.getAttribute("aria-label")).toContain("November 2026");
  expect(
    cell(november, /Sunday, 1 November 2026/).getAttribute("data-unavailable"),
  ).toBe("true");
  expect(cell(november, /28 November 2026/).getAttribute("aria-disabled")).toBe(
    "true",
  );
  expect(
    cell(november, /27 November 2026/).getAttribute("aria-disabled"),
  ).toBeNull();
  expect(
    within(dialog).getByRole("button", { name: "Next month" }),
  ).toHaveProperty("disabled", true);
});

it("DatePicker keyboard: focus lands on the chosen day, arrows move, Page Down goes a month, Enter chooses and closes", async () => {
  const onChange = vi.fn();
  render(<AdjustDate onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: /^Calendar/ }));
  await screen.findByRole("dialog");
  await act(async () => {});
  expect(document.activeElement?.getAttribute("aria-label")).toMatch(
    /30 October 2026/,
  );
  key(document.activeElement!, "ArrowRight");
  expect(document.activeElement?.getAttribute("aria-label")).toMatch(
    /31 October 2026/,
  );
  key(document.activeElement!, "PageDown");
  expect(document.activeElement?.getAttribute("aria-label")).toMatch(
    /27 November 2026/,
  );
  key(document.activeElement!, "ArrowDown");
  // Past the last day: the focus stays at the edge.
  expect(document.activeElement?.getAttribute("aria-label")).toMatch(
    /27 November 2026/,
  );
  key(document.activeElement!, "Enter");
  expect(onChange).toHaveBeenLastCalledWith("2026-11-27");
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("DatePicker: a typed day past the last one says what, why and what to do", () => {
  function Typed() {
    const [value, setValue] = useState("2026-11-28");
    return (
      <DatePicker
        label="Date"
        today="2026-10-28"
        min="2026-10-28"
        max="2026-11-27"
        tooLateReason="Bookings open up to Fri 27 Nov."
        value={value}
        onChange={setValue}
      />
    );
  }
  render(<Typed />);
  const group = screen.getByRole("group", { name: "Date" });
  expect(
    screen.getByText(
      "Sat 28 Nov is too far ahead. Bookings open up to Fri 27 Nov. Choose an earlier day.",
    ),
  ).toBeTruthy();
  expect(group.className).toContain("is-invalid");
});

it("DayButton: named with the day shown; choosing a day closes the calendar; past days can be chosen", async () => {
  const onChange = vi.fn();
  render(
    <DayButton date="2026-10-28" today="2026-10-28" onChange={onChange} />,
  );
  const button = screen.getByRole("button", {
    name: "Choose a date. Showing Wed 28 Oct",
  });
  fireEvent.click(button);
  const dialog = await screen.findByRole("dialog");
  const grid = within(dialog).getByRole("grid");
  fireEvent.click(cell(grid, /26 October 2026/));
  expect(onChange).toHaveBeenCalledWith("2026-10-26");
  expect(screen.queryByRole("dialog")).toBeNull();
});
