// design.md 8.22 (B2 P4 and P5): ForCustomerPanel, CustomerResultRow and VehiclePick. Names and plates are
// drawn as text (SEC-11); names use `dir=auto` and wrap; plates read left to right and never wrap.
import type { ReactNode } from "react";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { ChoiceCards, type Choice } from "./Fields";
import { Icon } from "./Icon";

/** "Booking for": who the staff booking is for, with the way back to change it. */
export function ForCustomerPanel({
  name,
  line,
  isNew = false,
  action,
}: {
  name: string;
  /** "Phone ending 0123 · Ford Focus, AB12 CDE". */
  line: ReactNode;
  /** "New customer. Saved when you confirm." */
  isNew?: boolean;
  /** The quiet button: "Change customer" or "Edit details". */
  action: { label: string; to: string };
}) {
  return (
    <section
      aria-label="Booking for"
      className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border-subtle bg-surface p-4"
    >
      <div className="flex min-w-0 items-start gap-3">
        <Icon name="user" large className="shrink-0" />
        <div className="grid min-w-0 gap-1">
          <b dir="auto" className="wrap-anywhere">
            {name}
          </b>
          <span className="num text-sm text-text-secondary">{line}</span>
          {isNew && (
            <span>
              <Badge variant="confirmed" icon="info">
                New customer. Saved when you confirm.
              </Badge>
            </span>
          )}
        </div>
      </div>
      <Button variant="quiet" to={action.to}>
        {action.label}
      </Button>
    </section>
  );
}

export interface ResultRow {
  id: string;
  name: string;
  /** "Phone ending 0123". */
  phone: string;
  /** "Ford Focus AB12 CDE, Nissan Micra MK07 XYZ" or "No vehicle on file". */
  vehicles: string;
}

/** One customer found: a radio drawn as a 56px row (the result list is one radio group). */
export function CustomerResultRow({
  row,
  name,
  checked,
  onChange,
  children,
}: {
  row: ResultRow;
  name: string;
  checked: boolean;
  onChange: () => void;
  /** What shows under the chosen row: the vehicle choice, or the note that there is none. */
  children?: ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <label className="group relative block">
        <input
          type="radio"
          name={name}
          value={row.id}
          checked={checked}
          onChange={onChange}
          className="peer absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0"
        />
        <span
          style={{
            minHeight: "calc(var(--size-target) + var(--space-3))",
          }}
          className="flex items-center gap-3 rounded-control border border-border-strong bg-surface px-4 py-2 transition-colors duration-(--duration-base) ease-out peer-hover:border-text peer-checked:border-surface-selected peer-checked:bg-surface-selected peer-checked:text-text-on-selected peer-focus-visible:outline-solid peer-focus-visible:outline-(length:--focus-ring-width) peer-focus-visible:outline-focus-ring peer-focus-visible:outline-offset-(--focus-ring-offset)"
        >
          <span className="grid min-w-0 gap-0.5">
            <b dir="auto" className="wrap-anywhere">
              {row.name}
            </b>
            <small className="num text-sm text-text-secondary group-has-checked:text-border-subtle">
              {row.phone}
            </small>
            <small className="text-sm wrap-anywhere text-text-secondary group-has-checked:text-border-subtle">
              {row.vehicles}
            </small>
          </span>
          <Icon
            name="check"
            className="invisible ms-auto shrink-0 group-has-checked:visible"
          />
        </span>
      </label>
      {children && <div className="ms-4 grid gap-3">{children}</div>}
    </div>
  );
}

/** "Which vehicle?" under the chosen customer. With one vehicle it is chosen for the staff member. */
export function VehiclePick({
  vehicles,
  value,
  onChange,
  extra,
}: {
  vehicles: readonly {
    id: string;
    make: string;
    model: string;
    registration: string;
  }[];
  value: string | null;
  onChange: (value: string) => void;
  /** One more row after the vehicles ("Add another vehicle", D-0001-29 B). */
  extra?: Choice;
}) {
  const choices: Choice[] = [
    ...vehicles.map((v) => ({
      value: v.id,
      label: `${v.make} ${v.model}, ${v.registration}`,
    })),
    ...(extra ? [extra] : []),
  ];
  return (
    <ChoiceCards
      legend={vehicles.length > 1 ? "Which vehicle?" : "Vehicle"}
      name="vehicle"
      choices={choices}
      value={value ?? ""}
      onChange={onChange}
    />
  );
}
