// The navigation of each role (design.md 8.1).
import type { IconName } from "../components/Icon";
import type { Role } from "../data/api-problem";

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  /** The current item is this path only, not the pages below it. */
  exact?: boolean;
  /** The manager's Flagged tab carries the number of flagged bookings. */
  flagged?: boolean;
}

export const navItems: Record<Role, readonly NavItem[]> = {
  customer: [
    { to: "/book", label: "Book", icon: "plus", exact: true },
    { to: "/appointments", label: "My appointments", icon: "calendar" },
  ],
  staff: [
    { to: "/schedule", label: "Schedule", icon: "calendar" },
    {
      to: "/book/for-customer",
      label: "Book for a customer",
      icon: "plus",
    },
  ],
  manager: [
    { to: "/schedule", label: "Schedule", icon: "calendar" },
    { to: "/manage/flagged", label: "Flagged", icon: "flag", flagged: true },
    { to: "/manage/dealership", label: "Settings", icon: "sliders" },
    { to: "/manage/shifts", label: "Shifts", icon: "clock" },
    { to: "/manage/outbox", label: "Outbox", icon: "mail" },
  ],
};
