// The dev panel against a fake API (manager.md 4.6, 5.6; NFR-6, SEC-10, SEC-11, AD-12, AD-17).
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "../../app/App";
import { fakeApi, json, problem, type FakeHandler } from "../../app/fake-api";
import { saveUser } from "../../demo/saved-user";

const base = "https://api.test/api";
const CONFLICT = "4bf92f3577b34da6a3ce929d0e0e4736";
const XSS = '<img src=x onerror="window.__xss=1">';

const logs = [
  {
    ts: "2026-10-28T09:12:40.310Z",
    level: "info",
    msg: "appointment.book",
    traceId: "7d3e91b0c2a44f5e8b6d1a9c3e5f7021",
    route: "POST /appointments",
    method: "POST",
    status: 201,
    durationMs: 14,
    dealershipId: "d-leeds",
    actorRole: "customer",
    outcome: "confirmed",
    appointmentId: "ap-1042",
  },
  {
    ts: "2026-10-28T09:14:01.000Z",
    level: "info",
    msg: "step.check",
    traceId: CONFLICT,
    durationMs: 3,
  },
  {
    ts: "2026-10-28T09:14:02.120Z",
    level: "info",
    msg: "appointment.book",
    traceId: CONFLICT,
    route: "POST /appointments",
    method: "POST",
    status: 409,
    durationMs: 9,
    dealershipId: "d-leeds",
    actorRole: "customer",
    outcome: "slot_unavailable",
    reasons: ["TECHNICIAN_BUSY"],
  },
  {
    ts: "2026-10-28T09:15:00.000Z",
    level: "error",
    msg: "http.request",
    traceId: "92b1e5d7f3a8406c8d2e0b4a6c1f9573",
    route: "POST /appointments/{appointmentId}/cancel",
    method: "POST",
    status: 500,
    durationMs: 3,
    outcome: "internal",
  },
];

const telemetry = {
  logs,
  counters: [
    {
      name: "appointments_confirmed_total",
      labels: { dealershipId: "d-leeds", actorRole: "customer" },
      value: 1,
    },
    {
      name: "appointment_conflicts_total",
      labels: { dealershipId: "d-leeds", reason: "TECHNICIAN_BUSY" },
      value: 1,
    },
    {
      name: "availability_search_empty_total",
      labels: { dealershipId: "d-leeds" },
      value: 1,
    },
  ],
  histograms: [
    {
      name: "availability_search_duration_ms",
      labels: { dealershipId: "d-leeds", kind: "day" },
      count: 3,
      sum: 18,
      p50: 6,
      p95: 14,
      max: 14,
    },
    {
      name: "availability_search_duration_ms",
      labels: { dealershipId: "d-leeds", kind: "suggest" },
      count: 1,
      sum: 250,
      p50: 250,
      p95: 250,
      max: 250,
    },
  ],
  gauges: [
    {
      name: "bay_utilisation_ratio",
      labels: { dealershipId: "d-leeds", date: "2026-10-28" },
      value: 0.4,
    },
  ],
};

beforeEach(() => saveUser("u-manager"));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function open(handlers: Record<string, FakeHandler> = {}) {
  const api = fakeApi({
    "GET /_demo/telemetry": () => json(telemetry),
    ...handlers,
  });
  render(<App baseUrl={base} fetch={api.fetcher} initialEntries={["/dev"]} />);
  return api;
}

const title = () =>
  screen.findByRole("heading", { level: 1, name: "Dev panel" });
const numbers = () => screen.findByRole("region", { name: "Numbers" });
/** A line's summary, with the no-break space before "ms" read as a space. */
const text = (item: HTMLElement) =>
  item.querySelector("summary")!.textContent!.replaceAll("\u00a0", " ");
const logList = () => screen.findByRole("list", { name: "Log lines" });

it("shows the title, the Demo only badge and the line about a real build", async () => {
  open();
  await title();
  expect(screen.getByText("Demo only")).toBeTruthy();
  expect(
    screen.getByText(
      "Logs and numbers from this browser tab, so you can follow what the app did. This page is not part of a real build.",
    ),
  ).toBeTruthy();
});

it("shows the four numbers as the API counted them, each under its label", async () => {
  open();
  const panel = await numbers();
  expect(
    [...panel.querySelectorAll("p")].some((p) =>
      /^Counted in this browser tab since \d\d:\d\d UTC\. Reloading the page clears them\.$/.test(
        p.textContent!,
      ),
    ),
  ).toBe(true);
  const metric = (name: string) =>
    within(panel)
      .getByRole("heading", { level: 3, name })
      .parentElement!.textContent!.replaceAll("\u00a0", " ");
  expect(metric("Time to find free times")).toContain(
    "Day search3 searches · middle 6 ms · slowest 5% from 14 msTarget: under 50 ms Within target",
  );
  expect(metric("Time to find free times")).toContain(
    "Check one timeNo checks yetNo target set.",
  );
  expect(metric("Time to find free times")).toContain(
    "Closest times1 search · middle 250 ms · slowest 5% from 250 msTarget: under 200 ms Over target",
  );
  expect(metric("Bookings confirmed")).toBe(
    "Bookings confirmed1 booking1 by customers, 0 by staff.",
  );
  expect(metric("Times refused because they were just taken")).toBe(
    "Times refused because they were just taken1 refused (409)Every technician who can do this job is busy then: 1.",
  );
  expect(metric("Searches that found no free time")).toContain(
    "Searches that found no free time1 search",
  );
});

it("draws no gauge, sparkline or hero number: the utilisation gauge of the API is not shown", async () => {
  open();
  await numbers();
  expect(document.body.textContent).not.toMatch(/utilisation|0\.4/);
  expect(screen.queryByRole("progressbar")).toBeNull();
  expect(screen.queryByRole("meter")).toBeNull();
  expect(document.querySelectorAll("canvas, main svg:not(.icon)")).toHaveLength(
    0,
  );
});

it("lists the lines newest first with time, level as icon and word, message, status, duration, route, outcome, reasons and reference", async () => {
  open();
  const list = await logList();
  const items = within(list).getAllByRole("listitem");
  expect(items).toHaveLength(4);
  expect(text(items[0]!)).toBe(
    "09:15:00 UTCerrorhttp.request500 · 3 msPOST /appointments/{appointmentId}/cancel · internal · reference 92b1e5d7",
  );
  expect(text(items[1]!)).toBe(
    "09:14:02 UTCinfoappointment.book409 · 9 msPOST /appointments · slot_unavailable · TECHNICIAN_BUSY · reference 4bf92f35",
  );
  expect(
    items[0]!.querySelector(".bg-danger-tint use")!.getAttribute("href"),
  ).toBe("#i-alert");
  expect(items[1]!.querySelector(".bg-surface use")!.getAttribute("href")).toBe(
    "#i-info",
  );
  // The 409 is logged as "info", so its status carries the problem mark (Q-0001-224 A).
  expect(items[1]!.querySelector(".bg-warning-tint-strong")!.textContent).toBe(
    "409 · 9\u00a0ms",
  );
  expect(
    items[1]!
      .querySelector(".bg-warning-tint-strong use")!
      .getAttribute("href"),
  ).toBe("#i-alert");
  expect(items[0]!.querySelector(".bg-warning-tint-strong")).toBeNull();
  expect(screen.getByText("4 of 4 lines")).toBeTruthy();
});

it("Copy reference says so when the browser refuses the clipboard", async () => {
  const writeText = vi.fn(() => Promise.reject(new Error("denied")));
  Object.assign(navigator, { clipboard: { writeText } });
  open();
  const list = await logList();
  const line = within(list).getAllByRole("listitem")[1]!;
  fireEvent.click(line.querySelector("summary")!);
  fireEvent.click(
    within(line).getByRole("button", { name: "Copy reference 4bf92f35" }),
  );
  expect(
    await within(line).findByText("Could not copy. The reference is 4bf92f35."),
  ).toBeTruthy();
});

it("the line count is said once typing stops, not on every key", async () => {
  open();
  await logList();
  const status = screen
    .getAllByRole("status")
    .find((s) => s.className.includes("sr-only") && s.closest("section"))!;
  expect(status.textContent).toBe("");
  const search = screen.getByRole("searchbox", { name: "Find a reference" });
  fireEvent.change(search, { target: { value: "92" } });
  fireEvent.change(search, { target: { value: "92b1" } });
  expect(status.textContent).toBe("");
  await waitFor(() => expect(status.textContent).toBe("Showing 1 of 4 lines"));
});

it("says once, above the logs, that names, phone numbers, emails and registrations are never logged", async () => {
  open();
  await logList();
  expect(
    screen.getAllByText(
      /No names, phone numbers, emails or registrations are ever logged\./,
    ),
  ).toHaveLength(1);
});

it("a line opens to its exact JSON in a labelled, focusable block, with Copy reference and Show only this trace", async () => {
  const writeText = vi.fn(() => Promise.resolve());
  Object.assign(navigator, { clipboard: { writeText } });
  open();
  const list = await logList();
  const line = within(list).getAllByRole("listitem")[1]!;
  fireEvent.click(line.querySelector("summary")!);
  const block = within(line).getByRole("region", {
    name: "Log line as JSON, reference 4bf92f35",
  });
  expect(block.tagName).toBe("PRE");
  expect(block.getAttribute("tabindex")).toBe("0");
  expect(JSON.parse(block.textContent!)).toEqual(logs[2]);

  fireEvent.click(
    within(line).getByRole("button", { name: "Copy reference 4bf92f35" }),
  );
  expect(writeText).toHaveBeenCalledWith("4bf92f35");
  expect(
    await within(line).findByText("Reference 4bf92f35 copied"),
  ).toBeTruthy();

  fireEvent.click(
    within(line).getByRole("button", { name: "Show only this trace" }),
  );
  expect(screen.getByText("2 of 4 lines")).toBeTruthy();
  const search = screen.getByRole("searchbox", { name: "Find a reference" });
  expect((search as HTMLInputElement).value).toBe("4bf92f35");
  expect(document.activeElement).toBe(search);
  expect(
    within(list)
      .getAllByRole("listitem")
      .map((li) => li.querySelector("summary > span > b")?.textContent),
  ).toEqual(["appointment.book", "step.check"]);
});

it("Find a reference counts the lines it keeps; Problems only keeps status 400 and up; typed text stays text", async () => {
  open();
  const list = await logList();
  const search = screen.getByRole("searchbox", { name: "Find a reference" });
  fireEvent.change(search, { target: { value: "92b1e5d7" } });
  expect(screen.getByText("1 of 4 lines")).toBeTruthy();
  fireEvent.change(search, { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Problems only" }));
  expect(
    screen
      .getByRole("button", { name: "Problems only" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(screen.getByText("2 of 4 lines")).toBeTruthy();
  expect(within(list).getAllByRole("listitem")).toHaveLength(2);

  fireEvent.change(search, { target: { value: XSS } });
  expect((search as HTMLInputElement).value).toBe(XSS);
  expect(screen.getByText("0 of 4 lines")).toBeTruthy();
  expect(document.querySelector("img")).toBeNull();
  expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
});

it("with no lines the screen says No requests yet, with a way into the app and the reset", async () => {
  open({ "GET /_demo/telemetry": () => json({ ...telemetry, logs: [] }) });
  await screen.findByRole("heading", { level: 2, name: "No requests yet" });
  expect(
    screen.getByText(
      "Use the app (book a time, adjust an appointment), then come back. Every request is logged here with a reference you can quote.",
    ),
  ).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: "Open the schedule" })
      .getAttribute("href"),
  ).toBe("/schedule");
  expect(screen.getByRole("button", { name: "Reset demo data" })).toBeTruthy();
});

it("a failed read says so, with Try again and the reference with Copy; Try again reads again", async () => {
  let fail = true;
  open({
    "GET /_demo/telemetry": () =>
      fail ? problem(500, "INTERNAL") : json(telemetry),
  });
  await screen.findByRole("heading", {
    name: "We could not load the numbers and logs.",
  });
  expect(
    screen.getByText(
      "Nothing was changed. Try again; if it keeps happening, quote reference 4bf92f35.",
    ),
  ).toBeTruthy();
  expect(screen.getByText("Reference 4bf92f35")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Copy reference 4bf92f35" }),
  ).toBeTruthy();
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await numbers();
});

it("loading shows the skeleton only after 200 ms, with a hidden Loading the numbers and logs", async () => {
  let answer: (r: Response) => void = () => {};
  open({
    "GET /_demo/telemetry": () =>
      new Promise<Response>((done) => (answer = done)),
  });
  const status = await screen.findByText("Loading the numbers and logs");
  expect(status.className).toContain("sr-only");
  const skeleton = status.nextElementSibling!;
  expect(skeleton.className).toContain("invisible");
  await waitFor(() => expect(skeleton.className).not.toContain("invisible"), {
    timeout: 1000,
  });
  act(() => answer(json(telemetry)));
  await numbers();
});

it("every role can open /dev: a customer sees the panel, not no-permission", async () => {
  saveUser("u-customer");
  open({ "GET /_demo/telemetry": () => json({ ...telemetry, logs: [] }) });
  await title();
  expect(screen.queryByText(/You cannot do that/)).toBeNull();
  expect(
    await screen.findByRole("link", { name: "Open Book a service" }),
  ).toBeTruthy();
});

it("Reset opens a dialog on its safe button; confirming sends the reset, locks the dialog, then says the data is back", async () => {
  let finish: (r: Response) => void = () => {};
  let reads = 0;
  const api = open({
    "GET /_demo/telemetry": () => {
      reads += 1;
      return json(telemetry);
    },
    "POST /_demo/reset": () => new Promise<Response>((done) => (finish = done)),
  });
  await logList();
  const opener = screen.getByRole("button", { name: "Reset demo data" });
  expect(opener.getAttribute("aria-haspopup")).toBe("dialog");
  fireEvent.click(opener);
  const dialog = screen.getByRole("dialog", { name: "Reset all demo data?" });
  const keep = within(dialog).getByRole("button", { name: "Keep my data" });
  expect(document.activeElement).toBe(keep);

  fireEvent.click(
    within(dialog).getByRole("button", { name: "Reset demo data" }),
  );
  await within(dialog).findByText("Resetting…");
  expect((keep as HTMLButtonElement).disabled).toBe(true);
  expect(
    (within(dialog).getByRole("button", { name: "Close" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(
    api.calls
      .filter((c) => c.url.endsWith("/_demo/reset"))
      .map((c) => c.method),
  ).toEqual(["POST"]);

  const before = reads;
  act(() =>
    finish(
      new Response(null, {
        status: 204,
        headers: { "X-Trace-Id": "b".repeat(32) },
      }),
    ),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(
    await screen.findByText(
      "Demo data reset. The starting data is loaded again.",
    ),
  ).toBeTruthy();
  expect(screen.getByText("Demo data is back to the start.")).toBeTruthy();
  await waitFor(() => expect(reads).toBeGreaterThan(before));
  // The tab's own lines and numbers stay.
  expect(screen.getByText("4 of 4 lines")).toBeTruthy();
});

it("a failed reset says so inside the dialog with the reference, and changes nothing", async () => {
  open({ "POST /_demo/reset": () => problem(500, "INTERNAL") });
  await logList();
  fireEvent.click(screen.getByRole("button", { name: "Reset demo data" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Reset demo data" }),
  );
  await within(dialog).findByRole("heading", {
    name: "We could not reset the demo data",
  });
  expect(
    within(dialog).getByText(
      "Nothing was changed. Try again; if it keeps happening, quote reference 4bf92f35.",
    ),
  ).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "Keep my data" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});
