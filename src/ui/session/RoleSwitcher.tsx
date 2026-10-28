// design.md 8.2. Demo only; a real product would sign in. From 640 wide a three-way control labelled
// "Viewing as"; below 640 one 44px button that opens a bottom sheet. D-0001-62: when a role has several
// users, one "Who" select picks between them.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Button } from "../components/Button";
import { ChoiceCards, SelectField } from "../components/Fields";
import { cx } from "../components/cx";
import { Dialog } from "../components/Dialog";
import { query, useMediaQuery } from "../components/hooks";
import { SegmentedControl } from "../components/SegmentedControl";
import type { Role } from "../data/api-problem";
import { roleName } from "../data/words";
import { devPanelPath } from "../app/guard";
import { useSession, type SwitcherState } from "./session";

const roles: readonly Role[] = ["customer", "staff", "manager"];

const roleLine: Record<Role, string> = {
  customer: "Books, cancels and reschedules own appointments",
  staff: "Checks the schedule, books for customers",
  manager: "Adjusts appointments, hours and shifts",
};

function usersOf(switcher: SwitcherState, role: Role) {
  return switcher.users.filter((u) => u.role === role);
}

export function RoleSwitcher({ switcher }: { switcher: SwitcherState }) {
  const { me, status, setFocusSwitcher } = useSession();
  const wide = useMediaQuery(query.sm);
  const [sheetOpen, setSheetOpen] = useState(false);
  const group = useRef<HTMLDivElement>(null);
  const role = me?.role ?? null;
  const here = switcher.users.find((u) => u.id === switcher.userId);
  const sameRole = role ? usersOf(switcher, role) : [];

  // "Switch role" on a page moves focus here, or opens the sheet on a phone.
  useEffect(() => {
    setFocusSwitcher(() => {
      if (!wide) return setSheetOpen(true);
      const target =
        group.current?.querySelector<HTMLElement>('[aria-pressed="true"]') ??
        group.current?.querySelector<HTMLElement>("button");
      target?.focus();
    });
    return () => setFocusSwitcher(null);
  }, [wide, setFocusSwitcher]);

  const pickRole = (next: string) => {
    if (next === role) return;
    const first = usersOf(switcher, next as Role)[0];
    if (first) void switcher.pick(first.id);
  };

  const notSignedIn = status === "signed-out" || role === null;
  const nameOfUser = here?.name ?? me?.name ?? "";

  const who =
    sameRole.length > 1 ? (
      <SelectField
        label="Who"
        hideLabel
        value={switcher.userId ?? ""}
        disabled={switcher.switching}
        options={sameRole.map((u) => ({ value: u.id, label: u.name }))}
        onChange={(e) => void switcher.pick(e.target.value)}
        className="max-w-56"
      />
    ) : null;

  if (switcher.loadFailed) {
    return (
      <Button variant="quiet" icon="refresh" onClick={switcher.reloadUsers}>
        Try again
        <span className="sr-only">, the list of users did not load</span>
      </Button>
    );
  }

  if (!wide) {
    return (
      <>
        <Button
          variant="secondary"
          icon="user"
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          disabled={switcher.switching}
          title={notSignedIn ? undefined : `${roleName[role]} · ${nameOfUser}`}
          onClick={() => setSheetOpen(true)}
          className="max-w-1/2 min-w-0 justify-between ps-4 pe-3"
        >
          <span className="sr-only">Viewing as </span>
          <span className="truncate">
            {switcher.switching
              ? "Switching…"
              : notSignedIn
                ? "Not signed in"
                : `${roleName[role]} · ${nameOfUser}`}
          </span>
        </Button>
        <Dialog
          open={sheetOpen}
          title="Viewing as"
          onClose={() => setSheetOpen(false)}
        >
          <ChoiceCards
            legend="Choose who you are"
            name="role-sheet"
            value={role ?? undefined}
            onChange={(next) => {
              setSheetOpen(false);
              pickRole(next);
            }}
            choices={roles.map((r) => ({
              value: r,
              label: `${roleName[r]}, ${usersOf(switcher, r)[0]?.name ?? "…"}`,
              description: roleLine[r],
              disabled: usersOf(switcher, r).length === 0,
            }))}
          />
          {who}
          <p className="text-sm text-text-secondary">
            Demo only: in a real product you would sign in.{" "}
            <Link to={devPanelPath} onClick={() => setSheetOpen(false)}>
              Open dev panel
            </Link>
          </p>
        </Dialog>
      </>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span
        className={cx(
          "text-sm text-text-secondary",
          !switcher.switching && !notSignedIn && "hidden lg:inline",
        )}
        role={switcher.switching ? "status" : undefined}
      >
        {switcher.switching
          ? "Switching…"
          : notSignedIn
            ? "Not signed in"
            : "Viewing as"}
      </span>
      <div ref={group}>
        <SegmentedControl
          label="Viewing as"
          value={role}
          disabled={switcher.switching}
          onChange={pickRole}
          options={roles.map((r) => ({ value: r, label: roleName[r] }))}
        />
      </div>
      {who}
    </div>
  );
}
