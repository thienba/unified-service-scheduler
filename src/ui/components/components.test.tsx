// Each shared part in the states design.md 8 lists for it.
import "../testing/css-escape";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { useRef, useState } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { FormSummary } from "../forms/FormSummary";
import { ActionBar } from "./ActionBar";
import { Alert } from "./Alert";
import {
  Badge,
  CountBadge,
  FlagBadge,
  StatusBadge,
  TransportBadge,
} from "./Badge";
import { Button } from "./Button";
import { DayStepper } from "./DayStepper";
import { Dialog } from "./Dialog";
import { DatePicker } from "./DatePicker";
import {
  Checkbox,
  ChoiceCards,
  EmailField,
  Switch,
  TelField,
  TextField,
} from "./Fields";
import { Select } from "./Select";
import { TimeField } from "./TimeField";
import { IconSprite, iconNames } from "./Icon";
import { SegmentedControl } from "./SegmentedControl";
import { FactsList, InlineNote, PageBack, PhoneLink } from "./Small";
import { Skeleton, StateBlock } from "./StateBlock";
import { TOAST_MS, ToastProvider, ToastViewport, useToast } from "./Toast";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const inRouter = (node: React.ReactNode) => <MemoryRouter>{node}</MemoryRouter>;

it("the icon sprite draws every icon the design names", () => {
  render(<IconSprite />);
  expect(iconNames).toEqual(
    expect.arrayContaining([
      "check",
      "x",
      "alert",
      "info",
      "plus",
      "left",
      "right",
      "down",
      "search",
      "calendar",
      "clock",
      "hourglass",
      "login",
      "key",
      "coffee",
      "user",
      "lock",
      "flag",
      "sliders",
      "mail",
      "arc",
      "refresh",
      "copy",
    ]),
  );
  expect(document.querySelectorAll("symbol")).toHaveLength(iconNames.length);
});

it("Button: four variants, disabled with its reason in words, and a link", () => {
  render(
    inRouter(
      <>
        <Button variant="primary">Confirm booking</Button>
        <Button>Reschedule</Button>
        <Button variant="quiet">Add another</Button>
        <Button variant="danger">Cancel appointment</Button>
        <Button disabled disabledReason="Pick a time to confirm">
          Confirm
        </Button>
        <Button to="/schedule">Go to the schedule</Button>
      </>,
    ),
  );
  expect(screen.getAllByRole("button")).toHaveLength(5);
  const disabled = screen.getByRole("button", {
    name: "Confirm",
  }) as HTMLButtonElement;
  expect(disabled.disabled).toBe(true);
  expect(screen.getByText("Pick a time to confirm")).toBeTruthy();
  expect(disabled.getAttribute("aria-describedby")).toBe(
    screen.getByText("Pick a time to confirm").id,
  );
  expect(
    screen
      .getByRole("link", { name: "Go to the schedule" })
      .getAttribute("href"),
  ).toBe("/schedule");
});

it("Button loading: reads 'Confirming…' with aria-busy, ignores presses, keeps both labels so the width holds", () => {
  const onClick = vi.fn();
  render(
    <Button
      variant="primary"
      loading
      loadingLabel="Confirming…"
      onClick={onClick}
    >
      Confirm booking
    </Button>,
  );
  const button = screen.getByRole("button");
  expect(button.getAttribute("aria-busy")).toBe("true");
  expect(button.textContent).toContain("Confirming…");
  expect(button.querySelector('[aria-hidden="true"]')?.textContent).toBe(
    "Confirm booking",
  );
  expect(button.querySelector("use")?.getAttribute("href")).toBe("#i-arc");
  fireEvent.click(button);
  expect(onClick).not.toHaveBeenCalled();
});

it("fields: label, helper, required in words, error attached and the value never repeated", () => {
  render(
    <>
      <TextField
        label="Registration"
        name="reg"
        helper="For example AB12 CDE."
        required
      />
      <TextField
        label="Plate"
        name="plate"
        defaultValue="secret"
        error="Plate is too short."
      />
      <TelField label="Phone" name="phone" />
      <EmailField label="Email" name="email" />
      <TimeField label="Start" name="start" value="" onChange={() => {}} />
      <DatePicker
        label="Date"
        name="date"
        today="2026-10-28"
        value="2026-10-30"
        onChange={() => {}}
      />
    </>,
  );
  const reg = screen.getByLabelText("Registration (required)");
  expect(reg.getAttribute("aria-describedby")).toBe(
    screen.getByText("For example AB12 CDE.").id,
  );
  const plate = screen.getByLabelText("Plate");
  expect(plate.getAttribute("aria-invalid")).toBe("true");
  expect(
    document.getElementById(plate.getAttribute("aria-describedby")!)
      ?.textContent,
  ).toBe("Plate is too short.");
  expect(screen.getByText("Plate is too short.").textContent).not.toContain(
    "secret",
  );
  expect(screen.getByLabelText("Phone").getAttribute("type")).toBe("tel");
  expect(screen.getByLabelText("Email").getAttribute("type")).toBe("email");
  // The time list holds only quarter hours (D-0001-133).
  fireEvent.click(screen.getByRole("button", { name: /^Start/ }));
  const times = within(screen.getByRole("listbox")).getAllByRole("option");
  expect(times.map((o) => o.textContent)).toEqual(
    Array.from(
      { length: 96 },
      (_, i) =>
        `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`,
    ),
  );
  expect(screen.getByText("Fri 30 Oct")).toBeTruthy();
});

it("Select: a button with a placeholder, a list of options, an error and a disabled state", () => {
  render(
    <>
      <Select
        label="Service"
        placeholder="Choose a service"
        value=""
        onChange={() => {}}
        options={[{ value: "a", label: "Full service" }]}
      />
      <Select
        label="Other"
        error="Other is missing."
        value=""
        onChange={() => {}}
        options={[]}
        disabled
      />
    </>,
  );
  const other = screen.getByRole("button", { name: /^Other/ });
  expect((other as HTMLButtonElement).disabled).toBe(true);
  expect(other.getAttribute("aria-invalid")).toBe("true");
  expect(
    document.getElementById(other.getAttribute("aria-describedby")!)
      ?.textContent,
  ).toBe("Other is missing.");
  const select = screen.getByRole("button", { name: /^Service/ });
  expect(select.textContent).toBe("Choose a service");
  expect(select.getAttribute("aria-haspopup")).toBe("listbox");
  fireEvent.click(select);
  expect(
    within(screen.getByRole("listbox"))
      .getAllByRole("option")
      .map((o) => o.textContent),
  ).toEqual(["Full service"]);
});

const car = [
  { value: "wait", label: "Wait" },
  { value: "drop_off", label: "Drop-off" },
  {
    value: "courtesy_car",
    label: "Courtesy car",
    disabled: true,
    disabledReason: "Not available at this time",
  },
];

it("ChoiceCards: a fieldset with a legend, native radios, no default, and an error that words the problem", () => {
  function Cards({ error }: { error?: string }) {
    const [value, setValue] = useState<string>();
    return (
      <ChoiceCards
        legend="What will you do with the car?"
        name="car"
        choices={car}
        value={value}
        onChange={setValue}
        error={error}
      />
    );
  }
  const { rerender } = render(<Cards />);
  const group = screen.getByRole("group", {
    name: "What will you do with the car?",
  });
  expect(group.tagName).toBe("FIELDSET");
  const radios = within(group).getAllByRole("radio") as HTMLInputElement[];
  expect(radios.map((r) => r.checked)).toEqual([false, false, false]);
  expect(radios[2]!.disabled).toBe(true);
  expect(screen.getByText("Not available at this time")).toBeTruthy();
  fireEvent.click(radios[1]!);
  expect((screen.getAllByRole("radio")[1] as HTMLInputElement).checked).toBe(
    true,
  );
  rerender(<Cards error="Choose what you will do with the car." />);
  expect(
    screen.getByText("Choose what you will do with the car."),
  ).toBeTruthy();
  expect(group.getAttribute("aria-describedby")).toBeTruthy();
});

it("Checkbox and Switch: a 44px row with the label, and On or Off in words", () => {
  const onChange = vi.fn();
  render(
    <>
      <Checkbox label="Closed" />
      <Switch label="Reminders" checked onChange={onChange} />
    </>,
  );
  fireEvent.click(screen.getByLabelText("Closed"));
  expect((screen.getByLabelText("Closed") as HTMLInputElement).checked).toBe(
    true,
  );
  expect(screen.getByText("On")).toBeTruthy();
  fireEvent.click(screen.getByRole("switch", { name: "Reminders" }));
  expect(onChange).toHaveBeenCalledWith(false);
});

it("SegmentedControl: aria-pressed on the chosen option, and a disabled state", () => {
  const onChange = vi.fn();
  const options = [
    { value: "a", label: "Technicians" },
    { value: "b", label: "Bays" },
  ];
  const { rerender } = render(
    <SegmentedControl
      label="Rows"
      options={options}
      value="a"
      onChange={onChange}
    />,
  );
  expect(
    screen
      .getByRole("button", { name: "Technicians" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Bays" }));
  expect(onChange).toHaveBeenCalledWith("b");
  rerender(
    <SegmentedControl
      label="Rows"
      options={options}
      value="a"
      onChange={onChange}
      disabled
    />,
  );
  expect(
    (screen.getByRole("button", { name: "Bays" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

it("DayStepper: previous, next, Today disabled on today with a reason, and limits", () => {
  const onChange = vi.fn();
  const { rerender } = render(
    <DayStepper date="2026-10-28" today="2026-10-28" onChange={onChange} />,
  );
  expect(screen.getByText("Wed 28 Oct")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Next day" }));
  expect(onChange).toHaveBeenLastCalledWith("2026-10-29");
  fireEvent.click(screen.getByRole("button", { name: "Previous day" }));
  expect(onChange).toHaveBeenLastCalledWith("2026-10-27");
  const today = screen.getByRole("button", {
    name: "Today",
  }) as HTMLButtonElement;
  expect(today.disabled).toBe(true);
  expect(today.title).toBe("You are already looking at today");
  rerender(
    <DayStepper
      date="2026-10-28"
      today="2026-10-28"
      min="2026-10-28"
      max="2026-10-28"
      onChange={onChange}
    />,
  );
  expect(
    (screen.getByRole("button", { name: "Previous day" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(
    (screen.getByRole("button", { name: "Next day" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  rerender(
    <DayStepper date="2026-10-30" today="2026-10-28" onChange={onChange} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Today" }));
  expect(onChange).toHaveBeenLastCalledWith("2026-10-28");
});

it("Badge: every kind has an icon and words, and a count reads '3 flagged'", () => {
  render(
    <>
      <StatusBadge status="confirmed" />
      <StatusBadge status="cancelled" />
      <StatusBadge status="past" />
      <TransportBadge transport="wait" />
      <TransportBadge transport="drop_off" />
      <TransportBadge transport="courtesy_car" />
      <FlagBadge>Flagged: runs past the shift</FlagBadge>
      <Badge variant="danger" icon="x" small>
        Refused
      </Badge>
      <CountBadge count={3} word="flagged" />
    </>,
  );
  for (const word of [
    "Confirmed",
    "Cancelled",
    "Past",
    "Waiting",
    "Drop-off",
    "Courtesy car",
    "Refused",
  ]) {
    expect(screen.getByText(word).querySelector("svg")).toBeTruthy();
  }
  expect(
    screen.getByText("Flagged: runs past the shift").querySelector("svg"),
  ).toBeTruthy();
  expect(document.body.textContent).toContain("3 flagged");
});

it("Alert: icon, heading and text for each kind; focus on the heading when asked", () => {
  const { rerender } = render(
    <Alert kind="warning" title="Sorry, that time was just taken." focusTitle>
      <p>Nothing was booked.</p>
    </Alert>,
  );
  expect(document.activeElement).toBe(
    screen.getByRole("heading", { name: /Sorry, that time was just taken\./ }),
  );
  for (const kind of ["info", "success", "danger", "warning"] as const) {
    rerender(
      <Alert
        kind={kind}
        title={`A ${kind} note`}
        actions={<Button>Do it</Button>}
      >
        Text
      </Alert>,
    );
    const region = screen.getByRole(kind === "danger" ? "alert" : "status");
    expect(region.querySelector("svg")).toBeTruthy();
    expect(within(region).getByText("Do it")).toBeTruthy();
  }
});

it("StateBlock: empty, error with a reference and Copy, info, compact, no-permission, not-found", () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  render(
    <>
      <StateBlock
        kind="empty"
        headingLevel={2}
        title="You have no appointments yet"
        actions={<Button variant="primary">Book a service</Button>}
      />
      <StateBlock
        kind="error"
        headingLevel={2}
        title="Something went wrong on our side."
        traceId="4bf92f35a1b2c3d4e5f60718293a4b5c"
        actions={<Button icon="refresh">Try again</Button>}
      >
        Nothing was changed.
      </StateBlock>
      <StateBlock kind="info" headingLevel={2} title="Cannot change online" />
      <StateBlock kind="empty" compact headingLevel={3} title="No times left" />
      <StateBlock
        kind="no-permission"
        headingLevel={2}
        title="You cannot do that as Customer."
      />
      <StateBlock
        kind="not-found"
        headingLevel={2}
        title="We cannot find that appointment."
      />
    </>,
  );
  expect(screen.getByText("Reference 4bf92f35")).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Copy reference 4bf92f35" }),
  );
  expect(writeText).toHaveBeenCalledWith("4bf92f35");
  expect(screen.getAllByRole("alert")).toHaveLength(3);
  expect(
    screen
      .getByText("Cannot change online")
      .closest("section")
      ?.getAttribute("role"),
  ).toBe("status");
});

it("StateBlock loading: aria-busy, a hidden 'Loading <thing>', and the skeleton shows only after 200 ms", () => {
  vi.useFakeTimers();
  const { container } = render(
    <StateBlock
      kind="loading"
      loadingLabel="Loading appointments"
      skeleton={<Skeleton />}
    />,
  );
  expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
  expect(screen.getByText("Loading appointments").className).toContain(
    "sr-only",
  );
  const skeleton = () => container.querySelector('[aria-hidden="true"]')!;
  expect(skeleton().className).toContain("invisible");
  act(() => void vi.advanceTimersByTime(199));
  expect(skeleton().className).toContain("invisible");
  act(() => void vi.advanceTimersByTime(2));
  expect(skeleton().className).not.toContain("invisible");
});

function DialogHarness({
  destructive = false,
  busy = false,
}: {
  destructive?: boolean;
  busy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const safe = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <Dialog
        open={open}
        title="Cancel this appointment?"
        destructive={destructive}
        busy={busy}
        initialFocus={destructive ? safe : undefined}
        onClose={() => setOpen(false)}
        actions={
          <>
            <Button ref={safe} onClick={() => setOpen(false)}>
              Keep appointment
            </Button>
            <Button variant="danger">Cancel appointment</Button>
          </>
        }
      >
        <p>Body</p>
      </Dialog>
    </>
  );
}

it("Dialog: role, aria-modal, labelled by its title; focus moves in, stays in, and returns; Esc and Close close it", () => {
  render(<DialogHarness />);
  const opener = screen.getByRole("button", { name: "Open" });
  opener.focus();
  fireEvent.click(opener);
  const dialog = screen.getByRole("dialog", {
    name: "Cancel this appointment?",
  });
  expect(dialog.getAttribute("aria-modal")).toBe("true");
  expect(dialog.contains(document.activeElement)).toBe(true);
  const buttons = within(dialog).getAllByRole("button");
  buttons.at(-1)!.focus();
  fireEvent.keyDown(buttons.at(-1)!, { key: "Tab" });
  expect(document.activeElement).toBe(buttons[0]);
  fireEvent.keyDown(buttons[0]!, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(buttons.at(-1));
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(opener);
  fireEvent.click(opener);
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("Dialog: a destructive one starts on its safe button and the scrim does not close it; a plain one closes on the scrim", () => {
  const { unmount } = render(<DialogHarness destructive />);
  fireEvent.click(screen.getByRole("button", { name: "Open" }));
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Keep appointment" }),
  );
  fireEvent.mouseDown(screen.getByRole("dialog").parentElement!);
  expect(screen.getByRole("dialog")).toBeTruthy();
  unmount();
  render(<DialogHarness />);
  fireEvent.click(screen.getByRole("button", { name: "Open" }));
  fireEvent.mouseDown(screen.getByRole("dialog").parentElement!);
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("Dialog: while it works it cannot be closed; below 640 it is a bottom sheet with the main action on top", () => {
  const { unmount } = render(<DialogHarness busy />);
  fireEvent.click(screen.getByRole("button", { name: "Open" }));
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(
    (screen.getByRole("button", { name: "Close" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  unmount();
  window.matchMedia = ((media: string) => ({
    matches: false,
    media,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  render(<DialogHarness />);
  fireEvent.click(screen.getByRole("button", { name: "Open" }));
  const dialog = screen.getByRole("dialog");
  expect(dialog.className).toContain("rounded-t-card");
  expect(dialog.className).toContain("max-h-(--size-sheet-max)");
  expect(dialog.querySelector(".flex-col-reverse")).toBeTruthy();
  // @ts-expect-error put back what the test took away
  delete window.matchMedia;
});

function ToastHarness({ kind }: { kind: "success" | "error" | "info" }) {
  const toast = useToast();
  return (
    <>
      <button onClick={() => toast.show({ kind, message: `A ${kind} toast` })}>
        Show
      </button>
      <button
        onClick={() => toast.show({ kind: "info", message: "Another toast" })}
      >
        Another
      </button>
      <ToastViewport barShowing />
    </>
  );
}

it("Toast: success and info close after 6 seconds and pause on hover; an error does not close by itself; one at a time; a 44px dismiss", () => {
  vi.useFakeTimers();
  const { unmount } = render(
    <ToastProvider>
      <ToastHarness kind="success" />
    </ToastProvider>,
  );
  fireEvent.click(screen.getByText("Show"));
  expect(screen.getByRole("status").textContent).toContain("A success toast");
  act(() => void vi.advanceTimersByTime(TOAST_MS - 100));
  fireEvent.mouseEnter(screen.getByText("A success toast").parentElement!);
  act(() => void vi.advanceTimersByTime(10_000));
  expect(screen.getByText("A success toast")).toBeTruthy();
  fireEvent.mouseLeave(screen.getByText("A success toast").parentElement!);
  act(() => void vi.advanceTimersByTime(TOAST_MS + 1));
  expect(screen.queryByText("A success toast")).toBeNull();
  fireEvent.click(screen.getByText("Show"));
  fireEvent.click(screen.getByText("Another"));
  expect(screen.queryByText("A success toast")).toBeNull();
  expect(screen.getByText("Another toast")).toBeTruthy();
  expect(screen.getAllByRole("button", { name: "Dismiss" })).toHaveLength(1);
  unmount();
  render(
    <ToastProvider>
      <ToastHarness kind="error" />
    </ToastProvider>,
  );
  fireEvent.click(screen.getByText("Show"));
  expect(screen.getByRole("alert").textContent).toContain("A error toast");
  act(() => void vi.advanceTimersByTime(60_000));
  expect(screen.getByText("A error toast")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  expect(screen.queryByText("A error toast")).toBeNull();
});

it("Toast: 6rem above a bar when one shows, 1rem when none", () => {
  const { container, rerender } = render(
    <ToastProvider>
      <ToastViewport barShowing />
    </ToastProvider>,
  );
  expect(container.firstElementChild!.className).toContain("bottom-24");
  expect(container.firstElementChild!.className).toContain("lg:top-20");
  rerender(
    <ToastProvider>
      <ToastViewport barShowing={false} />
    </ToastProvider>,
  );
  expect(container.firstElementChild!.className).toContain("bottom-4");
});

it("ActionBar: shows its text and buttons, hides from lg on most screens and from md on an appointment, and is not drawn with no actions", () => {
  const { container, rerender } = render(
    <ActionBar
      title="Fri 30 Oct, 10:00"
      status="Ends 13:00"
      actions={<Button variant="primary">Confirm booking</Button>}
    />,
  );
  expect(screen.getByText("Fri 30 Oct, 10:00")).toBeTruthy();
  expect(container.firstElementChild!.className).toContain("sticky");
  expect(container.firstElementChild!.className).toContain("lg:hidden");
  rerender(<ActionBar hideFrom="md" actions={<Button>Reschedule</Button>} />);
  expect(container.firstElementChild!.className).toContain("md:hidden");
  rerender(<ActionBar title="Nothing" />);
  expect(container.firstElementChild).toBeNull();
});

it("ActionBar: with no words, its buttons fill the row (customer-book.html and customer-appointment.html: .abar .btn{flex:1 1 auto})", () => {
  const { container, rerender } = render(
    <ActionBar actions={<Button variant="primary">Pick a time</Button>} />,
  );
  const row = () => container.firstElementChild!.lastElementChild!;
  expect(container.firstElementChild!.childElementCount).toBe(1);
  expect(row().className).toContain("flex-1");
  expect(row().className).toContain("*:flex-auto");
  rerender(
    <ActionBar
      title="Fri 30 Oct, 10:00"
      actions={<Button variant="primary">Confirm booking</Button>}
    />,
  );
  expect(container.firstElementChild!.childElementCount).toBe(2);
  expect(row().className).toContain("shrink-0");
});

it("FactsList, PageBack, InlineNote and PhoneLink", () => {
  render(
    inRouter(
      <>
        <FactsList
          heading="Appointment"
          rows={[
            { term: "Service", value: "Full service" },
            { term: "Notes", value: "" },
          ]}
        />
        <FactsList
          tone="sunken"
          rows={[{ term: "Status", value: "Cancelled" }]}
        />
        <PageBack to="/appointments">My appointments</PageBack>
        <InlineNote>Courtesy car cleared.</InlineNote>
        <PhoneLink phone="+44 1632 960 123" />
      </>,
    ),
  );
  expect(screen.getByText("Not set")).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "My appointments" }).getAttribute("href"),
  ).toBe("/appointments");
  expect(screen.getByText("Courtesy car cleared.")).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: /Call \+44 1632 960 123/ })
      .getAttribute("href"),
  ).toBe("tel:+441632960123");
});

it("FormSummary: lists each problem as a link to its field, and says how many", () => {
  render(
    <>
      <TextField label="Registration" name="reg" />
      <FormSummary
        problems={[
          { name: "reg", message: "Registration is missing." },
          { name: "x", message: "X is missing." },
        ]}
      />
    </>,
  );
  expect(
    screen.getByRole("heading", {
      name: /2 things need fixing before we can book this\./,
    }),
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole("link", { name: "Registration is missing." }),
  );
  expect(document.activeElement).toBe(screen.getByLabelText("Registration"));
});

it("Toast: leaving the focus does not restart the timer while the pointer is still over it", () => {
  vi.useFakeTimers();
  render(
    <ToastProvider>
      <ToastHarness kind="success" />
    </ToastProvider>,
  );
  fireEvent.click(screen.getByText("Show"));
  const body = screen.getByText("A success toast").parentElement!;
  fireEvent.mouseEnter(body);
  fireEvent.focus(body);
  fireEvent.blur(body);
  act(() => void vi.advanceTimersByTime(TOAST_MS * 3));
  expect(screen.getByText("A success toast")).toBeTruthy();
  fireEvent.mouseLeave(body);
  act(() => void vi.advanceTimersByTime(TOAST_MS + 1));
  expect(screen.queryByText("A success toast")).toBeNull();
});
