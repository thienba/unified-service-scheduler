// Finding customers and their vehicles (REQ-BOOK-014, D-0000-26, D-0001-30).
import type { Actor } from "../actor";
import type { Vehicle } from "../../domain/model";
import type { CustomerWithVehicles } from "../ports";
import {
  MAX_SEARCH_RESULTS,
  MIN_SEARCH_CHARS,
  invalid,
  type QueryDeps,
  type QueryFailure,
} from "./shared";

export interface CustomerSearch {
  /** Part of a name, a phone or a registration. */
  text?: string;
  /** Exact matches, for the new-customer duplicate hint (D-0001-30). */
  phone?: string;
  registration?: string;
}

export type CustomerSearchResult =
  { kind: "ok"; customers: CustomerWithVehicles[] } | QueryFailure;

/** Staff and managers only. Text of 3 or more characters, at most 10 customers (D-0000-26 A). */
export async function searchCustomers(
  actor: Actor,
  deps: QueryDeps,
  search: CustomerSearch,
): Promise<CustomerSearchResult> {
  if (actor.role === "customer") return { kind: "forbidden" };
  const { text, phone, registration } = search;
  const exact = phone !== undefined || registration !== undefined;
  if (text !== undefined && exact) {
    return invalid("text", "Send text, or a phone and registration, not both.");
  }
  if (text === undefined && !exact) {
    return invalid("text", "Give some text, a phone or a registration.");
  }
  if (text !== undefined && text.trim().length < MIN_SEARCH_CHARS) {
    return invalid(
      "text",
      `Type at least ${MIN_SEARCH_CHARS} characters to search.`,
    );
  }
  const customers = await deps.uow.read((stores) =>
    deps.logger.step("load", () =>
      text !== undefined
        ? stores.customers.search(text.trim())
        : stores.customers.findDuplicates(phone ?? "", registration ?? ""),
    ),
  );
  return { kind: "ok", customers: customers.slice(0, MAX_SEARCH_RESULTS) };
}

export type VehiclesResult =
  { kind: "ok"; vehicles: Vehicle[] } | { kind: "not_found" };

/** The customer themselves, or staff and managers. Another customer's id is "not found" (SEC-5.AC-3). */
export async function listVehicles(
  actor: Actor,
  deps: QueryDeps,
  customerId: string,
): Promise<VehiclesResult> {
  if (actor.role === "customer" && actor.customerId !== customerId) {
    return { kind: "not_found" };
  }
  const customer = await deps.uow.read((stores) =>
    deps.logger.step("load", () => stores.customers.get(customerId)),
  );
  return customer
    ? { kind: "ok", vehicles: customer.vehicles }
    : { kind: "not_found" };
}
