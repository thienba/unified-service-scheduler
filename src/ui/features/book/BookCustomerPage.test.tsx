// `book-customer` against a fake API (C4; REQ-BOOK-014.AC-1, AC-3, SEC-13.AC-3, D-0001-18 A).
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../app/App";
import { fakeApi, json, type FakeHandler } from "../../app/fake-api";
import { saveUser } from "../../demo/saved-user";
import {
  customerSchema,
  phoneLooksRight,
  registrationLooksRight,
  vehicleSchema,
} from "./customer-form";

const base = "https://api.test/api";

beforeEach(() => {
  saveUser("u-staff");
});
afterEach(cleanup);

const marta = {
  id: "c-marta",
  name: "Marta Kowalska",
  phone: "07700 900123",
  email: "marta@example.com",
  vehicles: [] as unknown[],
};

function open(
  path = "/book/for-customer",
  search: FakeHandler = () => json([marta]),
) {
  const api = fakeApi({ "POST /customers/search": search });
  render(<App baseUrl={base} fetch={api.fetcher} initialEntries={[path]} />);
  return api;
}

describe("the new-customer checks (D-0001-18 A)", () => {
  it("phone: 7 to 15 digits, spaces, brackets, hyphens and + are fine", () => {
    expect(phoneLooksRight("+44 (0)7700 900-123")).toBe(true);
    expect(phoneLooksRight("0123")).toBe(false);
    expect(phoneLooksRight("1234567890123456")).toBe(false);
    expect(phoneLooksRight("07700 9001x3")).toBe(false);
  });
  it("registration: 2 to 10 letters or numbers once spaces and hyphens are left out", () => {
    expect(registrationLooksRight("AB12 CDE")).toBe(true);
    expect(registrationLooksRight("A")).toBe(false);
    expect(registrationLooksRight("AB12-CDE-FGHJ")).toBe(false);
    expect(registrationLooksRight("AB12 CD!")).toBe(false);
  });
  it("names every missing field with its own words, and the email needs an @ only when given", () => {
    const result = customerSchema.safeParse({
      name: "  ",
      phone: "",
      email: "marta",
    });
    expect(result.success).toBe(false);
    expect(result.error!.issues.map((i) => i.message)).toEqual([
      "Full name is missing. Enter the customer's first and last name, for example Marta Kowalska.",
      "Phone number is missing. Enter a number we can call, for example 07700 900123.",
      "That email address is missing an @. Check it, or leave it empty.",
    ]);
    expect(
      customerSchema.safeParse({
        name: "Marta",
        phone: "07700 900123",
        email: "",
      }).success,
    ).toBe(true);
  });
  it("the year runs from 1950 to next year, from the clock", () => {
    const schema = vehicleSchema(Date.parse("2026-10-28T10:40:00Z"));
    const ok = { registration: "AB12 CDE", make: "Ford", model: "Focus" };
    expect(schema.safeParse({ ...ok, year: "2027" }).success).toBe(true);
    expect(schema.safeParse({ ...ok, year: "" }).success).toBe(true);
    const late = schema.safeParse({ ...ok, year: "2028" });
    expect(late.error!.issues[0]!.message).toBe(
      "That year does not look right. Use a year from 1950 to 2027, or leave it empty.",
    );
    expect(schema.safeParse({ ...ok, year: "1949" }).success).toBe(false);
  });
});

describe("book-customer", () => {
  it("SEC-13.AC-3: in the demo the form shows the note about made-up data", async () => {
    open();
    fireEvent.click(
      await screen.findByRole("button", { name: "Add a new customer" }),
    );
    expect(await screen.findByText("This is a demo.")).toBeTruthy();
    expect(
      screen.getByText(
        "What you type stays in this browser. Use made-up names, numbers and plates.",
      ),
    ).toBeTruthy();
  });

  it("from 3 characters the search goes in a request body; 1 or 2 characters search nothing", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = open();
    const field = await screen.findByRole("searchbox", {
      name: "Name, phone or number plate",
    });
    fireEvent.change(field, { target: { value: "Ko" } });
    expect(
      await screen.findByText(
        "Keep typing. We search from 3 characters, so the list does not show everyone.",
      ),
    ).toBeTruthy();
    fireEvent.change(field, { target: { value: "Kowal" } });
    expect(
      await screen.findByRole("heading", { name: "1 customer found" }),
    ).toBeTruthy();
    const searches = api.calls.filter((c) =>
      c.url.endsWith("/customers/search"),
    );
    expect(searches).toHaveLength(1);
    expect(await searches[0]!.clone().json()).toEqual({ text: "Kowal" });
    expect(searches[0]!.url).not.toContain("Kowal");
    vi.useRealTimers();
  });

  it("a customer with no vehicle: the note, and Continue says why it waits", async () => {
    open();
    fireEvent.change(
      await screen.findByRole("searchbox", {
        name: "Name, phone or number plate",
      }),
      { target: { value: "Marta" } },
    );
    fireEvent.click(
      await screen.findByRole("radio", { name: /^Marta Kowalska/ }),
    );
    expect(
      await screen.findByText("Marta Kowalska has no vehicle on file."),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "A booking needs a vehicle. Add their vehicle below, or choose another customer.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("No vehicle on file")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});

describe("book-customer focus and the duplicate note (review fixes)", () => {
  const phoneField = () =>
    screen.getByRole("textbox", { name: "Phone number (required)" });
  const searchBox = () =>
    screen.getByRole("searchbox", { name: "Name, phone or number plate" });
  /** The search finds Marta for every text and phone number except 07700 900999. */
  const byPhone: FakeHandler = async (request) => {
    const body = (await request.clone().json()) as { phone?: string };
    return json(body.phone === "07700 900999" ? [] : [marta]);
  };

  it("NFR-4, WCAG 2.4.3: switching between the search and the form puts focus on the Full name field, then the search field", async () => {
    open();
    fireEvent.click(
      await screen.findByRole("button", { name: "Add a new customer" }),
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("textbox", { name: "Full name (required)" }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Back to search" }));
    await waitFor(() => expect(document.activeElement).toBe(searchBox()));
  });

  it("NFR-4: Keep adding a new customer puts focus back on the phone field; Use this customer puts it on the picked row", async () => {
    open("/book/for-customer", byPhone);
    fireEvent.click(
      await screen.findByRole("button", { name: "Add a new customer" }),
    );
    fireEvent.change(phoneField(), { target: { value: marta.phone } });
    fireEvent.focusOut(phoneField());
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Keep adding a new customer",
      }),
    );
    expect(document.activeElement).toBe(phoneField());

    // Another number is looked up again, and its note offers the record.
    fireEvent.change(phoneField(), { target: { value: "+44 7700 900123" } });
    fireEvent.focusOut(phoneField());
    fireEvent.click(
      await screen.findByRole("button", { name: "Use this customer" }),
    );
    const row = await screen.findByRole("radio", { name: /^Marta Kowalska/ });
    await waitFor(() => expect(document.activeElement).toBe(row));
    expect((row as HTMLInputElement).checked).toBe(true);
  });

  it("D-0001-30 B: the note goes when its field changes, and an answer for an earlier value is never shown", async () => {
    let answerLate: (response: Response) => void = () => {};
    let calls = 0;
    open("/book/for-customer", async (request) => {
      calls += 1;
      // The first look-up answers late, after the phone has been changed and looked up again.
      if (calls === 1)
        return new Promise<Response>((done) => {
          answerLate = done;
        });
      return byPhone(request);
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Add a new customer" }),
    );
    fireEvent.change(phoneField(), { target: { value: marta.phone } });
    fireEvent.focusOut(phoneField());
    fireEvent.change(phoneField(), { target: { value: "07700 900999" } });
    fireEvent.focusOut(phoneField());
    await waitFor(() => expect(calls).toBe(2));
    await act(async () => answerLate(json([marta])));
    expect(
      screen.queryByText("A customer with this phone number already exists."),
    ).toBeNull();

    // A note on show goes as soon as the phone number is edited.
    fireEvent.change(phoneField(), { target: { value: marta.phone } });
    fireEvent.focusOut(phoneField());
    expect(
      await screen.findByText(
        "A customer with this phone number already exists.",
      ),
    ).toBeTruthy();
    fireEvent.change(phoneField(), { target: { value: "07700 90012" } });
    expect(
      screen.queryByText("A customer with this phone number already exists."),
    ).toBeNull();
  });

  it("the results are a group named by their heading, not a radio group around the vehicle choice", async () => {
    open("/book/for-customer", () =>
      json([
        {
          ...marta,
          vehicles: [
            {
              id: "v-focus",
              registration: "AB12 CDE",
              make: "Ford",
              model: "Focus",
            },
          ],
        },
      ]),
    );
    fireEvent.change(
      await screen.findByRole("searchbox", {
        name: "Name, phone or number plate",
      }),
      { target: { value: "Marta" } },
    );
    const results = await screen.findByRole("group", {
      name: "1 customer found",
    });
    fireEvent.click(
      await screen.findByRole("radio", { name: /^Marta Kowalska/ }),
    );
    expect(await screen.findByRole("group", { name: "Vehicle" })).toBeTruthy();
    expect(
      results.contains(screen.getByRole("group", { name: "Vehicle" })),
    ).toBe(true);
    expect(screen.queryByRole("radiogroup", { name: /found$/ })).toBeNull();
  });
});
