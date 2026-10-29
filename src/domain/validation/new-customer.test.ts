import { describe, expect, it } from "vitest";
import { validateNewCustomer, validateNewVehicle } from "./new-customer";

const NOW = Date.UTC(2026, 10, 2);
const goodVehicle = { registration: "AB12 CDE", make: "Ford", model: "Focus" };

describe("new customer rules (Q-0001-23 A, D-0001-18)", () => {
  it("accepts a full form with and without the optional email and year", () => {
    expect(
      validateNewCustomer({ name: "A B", phone: "+44 (0)7700-900123" }),
    ).toEqual([]);
    expect(validateNewVehicle({ ...goodVehicle, year: 2027 }, NOW)).toEqual([]);
    expect(validateNewVehicle(goodVehicle, NOW)).toEqual([]);
    expect(
      validateNewCustomer({ name: "A", phone: "1234567", email: "a@b" }),
    ).toEqual([]);
  });

  it("names every missing required field", () => {
    expect(
      validateNewCustomer({ name: "  ", phone: "" }).map((e) => e.field),
    ).toEqual(["newCustomer.name", "newCustomer.phone"]);
    expect(validateNewVehicle({}, NOW).map((e) => e.field)).toEqual([
      "newVehicle.registration",
      "newVehicle.make",
      "newVehicle.model",
    ]);
  });

  it("refuses a phone outside 7 to 15 digits, an email without @, a plate outside 2 to 10 characters and a year outside 1950 to next year", () => {
    expect(validateNewCustomer({ name: "A", phone: "123456" })).toHaveLength(1);
    expect(
      validateNewCustomer({ name: "A", phone: "1234567890123456" }),
    ).toHaveLength(1);
    expect(
      validateNewCustomer({ name: "A", phone: "123abc4567" }),
    ).toHaveLength(1);
    expect(
      validateNewCustomer({ name: "A", phone: "1234567", email: "nope" }),
    ).toEqual([
      { field: "newCustomer.email", message: "Email must contain @." },
    ]);
    for (const registration of ["A", "ABCDEFGHIJK", "AB!"]) {
      expect(
        validateNewVehicle({ ...goodVehicle, registration }, NOW),
      ).toHaveLength(1);
    }
    for (const year of [1949, 2028, 2000.5]) {
      expect(validateNewVehicle({ ...goodVehicle, year }, NOW)).toHaveLength(1);
    }
    expect(validateNewVehicle({ ...goodVehicle, year: 1950 }, NOW)).toEqual([]);
  });

  it("never repeats the typed value in a message", () => {
    const text = JSON.stringify([
      ...validateNewCustomer({ name: "A", phone: "xx9", email: "zz-no" }),
      ...validateNewVehicle(
        { ...goodVehicle, registration: "!!", year: 1901 },
        NOW,
      ),
    ]);
    for (const typed of ["xx9", "zz-no", "!!", "1901"]) {
      expect(text).not.toContain(typed);
    }
  });
});
