// design.md 8.1: top tabs from 1024 wide, a bottom tab bar below. One `nav`, drawn in one place.
import { NavLink, useLocation } from "react-router";
import { CountBadge } from "../components/Badge";
import { cx } from "../components/cx";
import { Icon } from "../components/Icon";
import { useFlaggedCount } from "../data/flagged";
import type { Role } from "../data/api-problem";
import { useSelectedDealership } from "../session/dealership";
import { navItems } from "./nav";

export function PrimaryNav({ role, bottom }: { role: Role; bottom: boolean }) {
  const dealership = useSelectedDealership();
  const flagged = useFlaggedCount(dealership.selected?.id);
  const { search } = useLocation();
  const keep = new URLSearchParams(search).get("dealership");
  const carry = (to: string) =>
    keep && role !== "customer"
      ? `${to}?dealership=${encodeURIComponent(keep)}`
      : to;
  return (
    <nav
      aria-label="Main"
      className={cx(
        bottom
          ? "sticky bottom-0 z-(--z-sticky) grid auto-cols-fr grid-flow-col border-t border-border-subtle bg-surface safe-inset-bottom shadow-sticky"
          : "flex gap-2 border-b border-border-subtle bg-surface px-6 lg:px-8",
      )}
    >
      {navItems[role].map((item) => (
        <NavLink
          key={item.to}
          to={carry(item.to)}
          end={item.exact}
          className={({ isActive }) =>
            cx(
              "no-underline transition-colors duration-(--duration-fast) ease-out hover:bg-surface-page active:bg-surface-sunken",
              "focus-visible:-outline-offset-(--focus-ring-offset)",
              bottom
                ? "flex min-h-(--size-tabbar) min-w-0 flex-col items-center justify-center gap-1 border-t-(length:--border-width-thick) border-transparent p-1 text-center text-xs leading-tight font-medium"
                : "inline-flex min-h-13 items-center gap-2 border-b-(length:--border-width-thick) border-transparent px-4 font-medium",
              isActive
                ? "border-text font-semibold text-text"
                : "text-text-secondary",
            )
          }
        >
          <Icon name={item.icon} />
          <span>{item.label}</span>
          {item.flagged && flagged > 0 && (
            <CountBadge count={flagged} word="flagged" />
          )}
        </NavLink>
      ))}
    </nav>
  );
}
