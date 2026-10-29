// design.md 8.9. "Your booking": says the choice back in words, asks what happens to the car, and holds
// the one Confirm from 1024 wide (below that the Confirm sits in the ActionBar, and only one is drawn).
import type { ReactNode, Ref } from "react";
import { ChoiceCards, type Choice } from "./Fields";

export interface SummaryRow {
  term: string;
  /** Null shows "Not chosen yet". */
  value: ReactNode | null;
  /** A quiet line under the value: "This stays the same". */
  note?: string;
}

export function BookingSummary({
  variant = "customer",
  customerName,
  rows,
  transportChoices,
  transport,
  onTransportChange,
  transportError,
  transportRef,
  confirm,
}: {
  /** `staff`: "Booking for {name}" and the car choice in the third person (design.md 8.9, B2 P6).
   * `reschedule` is "Moving your appointment": no car choice, since only the time changes (D-0001-24 A). */
  variant?: "customer" | "staff" | "reschedule";
  /** For `staff`: whose booking it is. */
  customerName?: string | undefined;
  rows: readonly SummaryRow[];
  /** One list: the courtesy car is added to it by its own ticket. Left out on `reschedule`. */
  transportChoices?: readonly Choice[];
  transport?: string;
  onTransportChange?: (value: string) => void;
  transportError?: string | undefined;
  transportRef?: Ref<HTMLInputElement>;
  /** The Confirm button, when it is drawn here (from 1024 wide). */
  confirm?: ReactNode;
}) {
  const words = {
    customer: {
      title: "Your booking",
      legend: "What will you do with the car?",
    },
    staff: {
      title: `Booking for ${customerName ?? ""}`,
      legend: "What will the customer do with the car?",
    },
    reschedule: { title: "Moving your appointment", legend: "" },
  }[variant];
  const { title, legend } = words;
  return (
    <aside
      aria-labelledby="summary-title"
      className="flex flex-col gap-4 rounded-card border border-border-subtle bg-surface p-5"
    >
      <h2 id="summary-title" className="text-xl">
        {title}
      </h2>
      <dl className="cols-icon-text m-0 grid gap-x-4 gap-y-2">
        {rows.map((row) => (
          <div key={row.term} className="contents">
            <dt className="text-sm text-text-secondary">{row.term}</dt>
            <dd className="num m-0 font-medium wrap-anywhere">
              {row.value === null ? (
                <span className="font-normal text-text-secondary">
                  Not chosen yet
                </span>
              ) : (
                row.value
              )}
              {row.note && (
                <small className="block text-sm font-normal text-text-secondary">
                  {row.note}
                </small>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {transportChoices && onTransportChange && (
        <ChoiceCards
          legend={legend}
          name="transport"
          choices={transportChoices}
          value={transport ?? ""}
          onChange={onTransportChange}
          error={transportError}
          ref={transportRef}
        />
      )}
      {confirm}
      <p className="text-sm text-text-secondary">
        We check once more when you confirm, in case someone books first.
      </p>
    </aside>
  );
}
