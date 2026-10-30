import { QueryClient } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TimesNote } from "../session/TimesNote";
import "../testing/css-escape";
import { App } from "./App";
import { demoUsers, fakeApi, json, problem } from "./fake-api";
import { readSavedUser, saveUser } from "../demo/saved-user";

const base = "https://api.test/api";

beforeEach(() => saveUser(""));
afterEach(cleanup);

function open(path: string, api = fakeApi(), extra = {}) {
  render(
    <App
      baseUrl={base}
      fetch={api.fetcher}
      initialEntries={[path]}
      {...extra}
    />,
  );
  return api;
}

async function pick(role: string) {
  const group = await screen.findByRole("group", { name: "Viewing as" });
  const button = await within(group).findByRole("button", { name: role });
  await waitFor(() =>
    expect((button as HTMLButtonElement).disabled).toBe(false),
  );
  fireEvent.click(button);
}

const heading = (name: string | RegExp) =>
  screen.findByRole("heading", { level: 1, name });

/** A fake API that knows the default demo user, as the seeded mock does. */
const customerA = {
  id: "user-customer-a",
  name: "Demo Customer A",
  role: "customer",
  dealershipIds: [],
};
const withDefault = () =>
  fakeApi({
    "GET /_demo/users": () => json([...demoUsers, customerA]),
    "GET /me": (request) => {
      const user = [...demoUsers, customerA].find(
        (u) => u.id === request.headers.get("X-Demo-User"),
      );
      return user
        ? json({
            userId: user.id,
            name: user.name,
            role: user.role,
            customerId: null,
            dealershipIds: user.dealershipIds,
          })
        : problem(401, "UNKNOWN_USER");
    },
  });
const meCalls = (api: ReturnType<typeof fakeApi>) =>
  api.calls.filter((c) => c.url.endsWith("/me"));

it("first visit: with nothing stored, / opens the booking page as Demo Customer A, stores the choice, and shows no toast", async () => {
  const api = open("/", withDefault());
  await heading("Book a service");
  const group = await screen.findByRole("group", { name: "Viewing as" });
  expect(
    within(group).getByRole("button", { name: "Customer" }).ariaPressed,
  ).toBe("true");
  expect(readSavedUser()).toBe("user-customer-a");
  expect(meCalls(api).map((c) => c.headers.get("X-Demo-User"))).toEqual([
    "user-customer-a",
  ]);
  expect(screen.queryByText(/^Now viewing as/)).toBeNull();
  expect(screen.queryByText("Not signed in")).toBeNull();
});

it("first visit: /schedule shows no-permission with its way to switch role", async () => {
  open("/schedule", withDefault());
  await heading("You cannot do that as Customer.");
  expect(screen.getByRole("button", { name: "Switch role" })).toBeTruthy();
});

it("a stored user the seed no longer has falls back to Demo Customer A with no call answered 401", async () => {
  saveUser("user-gone");
  const api = open("/", withDefault());
  await heading("Book a service");
  expect(readSavedUser()).toBe("user-customer-a");
  expect(meCalls(api)).toHaveLength(1);
  expect(meCalls(api)[0]!.headers.get("X-Demo-User")).toBe("user-customer-a");
  expect(screen.queryByText(/^Now viewing as/)).toBeNull();
});

it("a failed user list does not block a valid stored user: /me still loads and that user is in use", async () => {
  saveUser("u-staff");
  const api = open(
    "/",
    fakeApi({ "GET /_demo/users": () => problem(500, "INTERNAL") }),
  );
  await heading("Schedule");
  expect(readSavedUser()).toBe("u-staff");
  expect(meCalls(api)[0]!.headers.get("X-Demo-User")).toBe("u-staff");
});

it("when the default user is also missing from the list, /me answers 401 and the signed-out screen shows", async () => {
  saveUser("user-gone");
  const api = open("/");
  await heading("You are not signed in.");
  expect(meCalls(api)).toHaveLength(1);
  expect(readSavedUser()).toBe("user-gone");
});

it("a hand-picked Staff user stays on a fresh open of /", async () => {
  open("/", withDefault());
  await heading("Book a service");
  await pick("Staff");
  await heading("Schedule");
  expect(readSavedUser()).toBe("u-staff");
  cleanup();

  const api = open("/", withDefault());
  await heading("Schedule");
  expect(readSavedUser()).toBe("u-staff");
  expect(meCalls(api).map((c) => c.headers.get("X-Demo-User"))).toEqual([
    "u-staff",
  ]);
});

it("picking a role sends that user's id, lands on the home and shows the toast with the name the API returned", async () => {
  const api = open("/", withDefault());
  await heading("Book a service");
  await pick("Staff");
  await heading("Schedule");
  expect(
    await screen.findByText("Now viewing as Staff, Daniel Okoye"),
  ).toBeTruthy();
  const me = api.calls.filter((c) => c.url.endsWith("/me")).at(-1)!;
  expect(me.headers.get("X-Demo-User")).toBe("u-staff");
  expect(readSavedUser()).toBe("u-staff");

  await pick("Customer");
  await heading("Book a service");
  expect(
    await screen.findByText("Now viewing as Customer, Aisha Rahman"),
  ).toBeTruthy();
  await pick("Manager");
  await heading("Schedule");
  expect(
    await screen.findByText("Now viewing as Manager, Elena Petrova"),
  ).toBeTruthy();
});

it("the nav has the items of the role and marks the current one", async () => {
  open("/");
  await pick("Manager");
  await heading("Schedule");
  const nav = await screen.findByRole("navigation", { name: "Main" });
  const links = within(nav).getAllByRole("link");
  expect(
    links.map((l) => l.textContent?.replace(/\d+ flagged$/, "").trim()),
  ).toEqual(["Schedule", "Flagged", "Settings", "Shifts", "Outbox"]);
  expect(links[0]!.getAttribute("aria-current")).toBe("page");
  expect(links[1]!.getAttribute("aria-current")).toBeNull();
});

it("the Flagged item shows the number of flagged appointments, read as '3 flagged', and nothing at 0", async () => {
  const flagged = fakeApi({
    "GET /appointments": () =>
      new Response(JSON.stringify([{}, {}, {}]), {
        headers: { "Content-Type": "application/json" },
      }),
  });
  open("/");
  await pick("Manager");
  await waitFor(() => expect(screen.queryByText("3")).toBeNull());
  cleanup();
  saveUser("u-manager");
  open("/schedule", flagged);
  const link = await screen.findByRole("link", { name: /Flagged/ });
  await waitFor(() => expect(link.textContent).toContain("3 flagged"));

  cleanup();
  open("/schedule");
  const empty = await screen.findByRole("link", { name: /Flagged/ });
  expect(empty.textContent).toBe("Flagged");
});

it("a customer on /schedule reads the no-permission text, and the address stays", async () => {
  saveUser("u-customer");
  open("/schedule");
  await heading("You cannot do that as Customer.");
  expect(
    screen.getByText(
      "Only garage staff and the garage manager can see the schedule. Switch role, or go to Book a service.",
    ),
  ).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "Go to Book a service" }),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "Switch role" })).toBeTruthy();
});

it("each role sees the words of its own no-permission states", async () => {
  saveUser("u-customer");
  open("/manage/flagged");
  await screen.findByText(
    /Only the garage manager can change opening hours, shifts and flagged bookings/,
  );
  cleanup();
  open("/book/for-customer");
  await screen.findByText(/Only garage staff can book for a customer/);
  cleanup();
  saveUser("u-staff");
  open("/manage/flagged");
  await heading("You cannot do that as Staff.");
  expect(
    screen.getByText(
      "Only the garage manager can review flagged bookings. Switch role, or go to your schedule.",
    ),
  ).toBeTruthy();
  expect(screen.getByRole("link", { name: "Go to the schedule" })).toBeTruthy();
});

it("Switch role moves focus to the header control", async () => {
  saveUser("u-customer");
  open("/schedule");
  await heading("You cannot do that as Customer.");
  await screen.findByRole("button", { name: "Customer" });
  fireEvent.click(screen.getByRole("button", { name: "Switch role" }));
  expect(document.activeElement).toBe(
    within(screen.getByRole("group", { name: "Viewing as" })).getByRole(
      "button",
      { name: "Customer" },
    ),
  );
});

it("an unknown route shows not-found with the role's home", async () => {
  saveUser("u-staff");
  open("/nowhere");
  await heading("We cannot find that page.");
  expect(screen.getByRole("link", { name: "Go to the schedule" })).toBeTruthy();
});

it("a staff member who opens another dealership sees other-dealership with their own schedule", async () => {
  saveUser("u-staff");
  open("/schedule?dealership=d-hcmc");
  await heading("You cannot open that dealership.");
  expect(
    screen.getByRole("link", { name: "Go to the Northgate Motors schedule" }),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "Switch role" })).toBeTruthy();
});

it("the dealership picker is a select with two dealerships, text with one, and changing it updates ?dealership=", async () => {
  saveUser("u-both");
  open("/schedule");
  const select = await screen.findByRole("button", { name: /^Dealership/ });
  fireEvent.click(select);
  const options = within(await screen.findByRole("listbox")).getAllByRole(
    "option",
  );
  expect(options.map((o) => o.textContent)).toEqual([
    "Northgate Motors",
    "Riverside Motors",
  ]);
  fireEvent.click(options[1]!);
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: /^Dealership/ })
        .getAttribute("data-value"),
    ).toBe("d-hcmc"),
  );
  cleanup();
  saveUser("u-staff");
  open("/schedule");
  await screen.findByText("Northgate Motors");
  expect(screen.queryByRole("button", { name: /^Dealership/ })).toBeNull();
  expect(screen.queryByLabelText("Dealership")).toBeNull();
});

it("after a role switch the query cache is empty of the old data, and no staff data is in the page", async () => {
  const queryClient = new QueryClient();
  saveUser("u-staff");
  open("/schedule", fakeApi(), { queryClient });
  await heading("Schedule");
  queryClient.setQueryData(
    ["schedule", "d-leeds"],
    [{ customer: "Priya Nair", phone: "0113 496 0123" }],
  );
  expect(
    queryClient.getQueryCache().find({ queryKey: ["schedule", "d-leeds"] }),
  ).toBeTruthy();
  await pick("Customer");
  await heading("Book a service");
  expect(
    queryClient.getQueryCache().find({ queryKey: ["schedule", "d-leeds"] }),
  ).toBeUndefined();
  expect(document.body.textContent).not.toContain("Priya Nair");
  expect(document.body.textContent).not.toContain("0113");
});

it("a failed switch keeps the earlier user and says nothing changed", async () => {
  saveUser("u-customer");
  const api = fakeApi({
    "GET /me": (request) =>
      request.headers.get("X-Demo-User") === "u-staff"
        ? problem(500, "INTERNAL")
        : new Response(
            JSON.stringify({
              userId: "u-customer",
              name: "Aisha Rahman",
              role: "customer",
              customerId: null,
              dealershipIds: [],
            }),
            { headers: { "Content-Type": "application/json" } },
          ),
  });
  open("/book", api);
  await heading("Book a service");
  await pick("Staff");
  expect(
    await screen.findByText(
      "We could not switch to that user. Nothing was changed.",
    ),
  ).toBeTruthy();
  expect(readSavedUser()).toBe("u-customer");
});

it("in remote mode there is no role switcher, no dev link and no X-Demo-User", async () => {
  const api = open("/", fakeApi(), { demo: null });
  await heading("You are not signed in.");
  expect(screen.getByText("Not signed in")).toBeTruthy();
  expect(screen.queryByRole("group", { name: "Viewing as" })).toBeNull();
  expect(api.calls.some((c) => c.headers.has("X-Demo-User"))).toBe(false);
  expect(api.calls.some((c) => c.url.includes("/_demo/"))).toBe(false);
});

it("a 500 from the API shows the words with the reference", async () => {
  saveUser("u-staff");
  open("/schedule", fakeApi({ "GET /me": () => problem(500, "INTERNAL") }));
  await heading("Something went wrong on our side.");
  expect(screen.getByText("Reference 4bf92f35")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Copy reference 4bf92f35" }),
  ).toBeTruthy();
});

it("the sheet row of the current role shows the current user's name, not the first user of the role", async () => {
  saveUser("u-both");
  window.matchMedia = ((media: string) => ({
    matches: false,
    media,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  try {
    open("/schedule");
    fireEvent.click(
      await screen.findByRole("button", {
        name: /Staff · Dina Both/,
      }),
    );
    const sheet = await screen.findByRole("dialog", { name: "Viewing as" });
    expect(
      within(sheet).getByRole("radio", { name: /^Staff, Dina Both/ }),
    ).toBeTruthy();
    expect(
      within(sheet).queryByRole("radio", { name: /^Staff, Daniel Okoye/ }),
    ).toBeNull();
  } finally {
    // @ts-expect-error put back what the test took away
    delete window.matchMedia;
  }
});

it("after a switch from the phone sheet, focus is not lost to the page body", async () => {
  saveUser("u-customer");
  window.matchMedia = ((media: string) => ({
    matches: false,
    media,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  try {
    open("/book");
    const opener = await screen.findByRole("button", {
      name: /Customer · Aisha/,
    });
    opener.focus();
    fireEvent.click(opener);
    const sheet = await screen.findByRole("dialog", { name: "Viewing as" });
    fireEvent.click(within(sheet).getByRole("radio", { name: /^Staff, / }));
    await screen.findByText("Now viewing as Staff, Daniel Okoye");
    await waitFor(() => expect(document.activeElement).not.toBe(document.body));
  } finally {
    // @ts-expect-error put back what the test took away
    delete window.matchMedia;
  }
});

it("presses are ignored while the control reads Switching…", async () => {
  saveUser("u-customer");
  let release: (() => void) | undefined;
  const api = fakeApi({
    "GET /me": async (request) => {
      if (request.headers.get("X-Demo-User") === "u-staff") {
        await new Promise<void>((done) => (release = done));
      }
      const id = request.headers.get("X-Demo-User") ?? "";
      const name =
        id === "u-staff"
          ? "Daniel Okoye"
          : id === "u-manager"
            ? "Elena Petrova"
            : "Aisha Rahman";
      const role =
        id === "u-staff"
          ? "staff"
          : id === "u-manager"
            ? "manager"
            : "customer";
      return new Response(
        JSON.stringify({
          userId: id,
          name,
          role,
          customerId: null,
          dealershipIds: [],
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    },
  });
  open("/book", api);
  await heading("Book a service");
  await pick("Staff");
  expect(await screen.findByText("Switching…")).toBeTruthy();
  const group = screen.getByRole("group", { name: "Viewing as" });
  const manager = within(group).getByRole("button", {
    name: "Manager",
  }) as HTMLButtonElement;
  expect(manager.disabled).toBe(true);
  fireEvent.click(manager);
  release?.();
  await screen.findByText("Now viewing as Staff, Daniel Okoye");
  expect(
    api.calls.some((c) => c.headers.get("X-Demo-User") === "u-manager"),
  ).toBe(false);
});

it("the dealership note 'Times are in <place> time.' shows only when the viewer's zone differs", async () => {
  saveUser("u-both");
  const zone = vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions");
  try {
    zone.mockReturnValue({ timeZone: "Pacific/Auckland" } as never);
    open("/schedule?dealership=d-leeds", fakeApi(), { routes: <TimesNote /> });
    expect(await screen.findByText("Times are in London time.")).toBeTruthy();
    cleanup();
    zone.mockReturnValue({ timeZone: "Europe/London" } as never);
    const api = open("/schedule?dealership=d-leeds", fakeApi(), {
      routes: <TimesNote />,
    });
    await waitFor(() =>
      expect(api.calls.some((c) => c.url.endsWith("/dealerships"))).toBe(true),
    );
    await new Promise((done) => setTimeout(done, 50));
    expect(screen.queryByText(/Times are in/)).toBeNull();
  } finally {
    zone.mockRestore();
  }
});
