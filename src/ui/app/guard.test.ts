import { expect, it } from "vitest";
import { homeFor, mayBookForCustomer, mayOpen, routeRules } from "./guard";

it("the function for booking on behalf of a customer says yes to staff and the manager, no to a customer (D-0001-53)", () => {
  expect(mayBookForCustomer("staff")).toBe(true);
  expect(mayBookForCustomer("manager")).toBe(true);
  expect(mayBookForCustomer("customer")).toBe(false);
});

it("the book-for-a-customer route uses the same answer", () => {
  const rule = routeRules.find((r) => r.path === "/book/for-customer")!;
  for (const role of ["customer", "staff", "manager"] as const) {
    expect(mayOpen(rule, role)).toBe(mayBookForCustomer(role));
  }
});

it("the manager pages are for the manager only, the schedule for the garage, and each role has a home", () => {
  const roles = (path: string) =>
    routeRules.find((r) => r.path === path)!.roles;
  expect(roles("/manage/flagged")).toEqual(["manager"]);
  expect(roles("/schedule")).toEqual(["staff", "manager"]);
  expect(roles("/appointments")).toEqual(["customer"]);
  expect(homeFor("customer")).toBe("/book");
  expect(homeFor("staff")).toBe("/schedule");
  expect(homeFor("manager")).toBe("/schedule");
});
