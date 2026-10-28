// Who may open what (REQ-BOOK-005.AC-3, 008.AC-3, 014.AC-5; design.md section 5). One list of roles per route.
import type { Role } from "../data/api-problem";

const everyone: readonly Role[] = ["customer", "staff", "manager"];
const garage: readonly Role[] = ["staff", "manager"];

/** The only place that says who may book for a customer (D-0001-53): staff and the manager. */
const bookForCustomerRoles: readonly Role[] = garage;
export function mayBookForCustomer(role: Role): boolean {
  return bookForCustomerRoles.includes(role);
}

/** Which words `no-permission` uses when the role may not open the route. */
export type DeniedKey =
  | "schedule"
  | "book-for-customer"
  | "adjust"
  | "my-appointments"
  | "reschedule"
  | "flagged"
  | "dealership"
  | "shifts"
  | "outbox";

export interface RouteRule {
  path: string;
  roles: readonly Role[];
  denied: DeniedKey;
  /** The page's name, for the placeholder until the screen's own ticket adds it. */
  title: string;
}

export const routeRules: readonly RouteRule[] = [
  {
    path: "/book",
    roles: everyone,
    denied: "schedule",
    title: "Book a service",
  },
  {
    path: "/book/confirmed/:appointmentId",
    roles: everyone,
    denied: "schedule",
    title: "You are booked",
  },
  {
    path: "/appointments",
    roles: ["customer"],
    denied: "my-appointments",
    title: "My appointments",
  },
  {
    path: "/appointments/:appointmentId",
    roles: everyone,
    denied: "schedule",
    title: "Appointment",
  },
  {
    path: "/appointments/:appointmentId/reschedule",
    roles: ["customer"],
    denied: "reschedule",
    title: "Reschedule",
  },
  {
    path: "/book/for-customer",
    roles: bookForCustomerRoles,
    denied: "book-for-customer",
    title: "Book for a customer",
  },
  { path: "/schedule", roles: garage, denied: "schedule", title: "Schedule" },
  {
    path: "/appointments/:appointmentId/adjust",
    roles: ["manager"],
    denied: "adjust",
    title: "Adjust appointment",
  },
  {
    path: "/manage/flagged",
    roles: ["manager"],
    denied: "flagged",
    title: "Flagged bookings",
  },
  {
    path: "/manage/dealership",
    roles: ["manager"],
    denied: "dealership",
    title: "Opening hours and policies",
  },
  {
    path: "/manage/shifts",
    roles: ["manager"],
    denied: "shifts",
    title: "Shifts",
  },
  {
    path: "/manage/outbox",
    roles: ["manager"],
    denied: "outbox",
    title: "Outbox",
  },
];

export function mayOpen(rule: RouteRule, role: Role): boolean {
  return rule.roles.includes(role);
}

/** A role's home: where `/` goes and what "Go to the schedule" opens. */
export function homeFor(role: Role): string {
  return role === "customer" ? "/book" : "/schedule";
}

export function homeButtonLabel(role: Role): string {
  return role === "customer" ? "Go to Book a service" : "Go to the schedule";
}

export const devPanelPath = "/dev";
