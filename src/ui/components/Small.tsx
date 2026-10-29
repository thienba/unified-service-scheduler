// design.md 8.20 and 8.21: FactsList, PageBack, InlineNote, PhoneLink.
import type { ReactNode } from "react";
import { Link } from "react-router";
import { mockEnabled } from "../../config";
import { cx } from "./cx";
import { Icon } from "./Icon";

export interface Fact {
  term: string;
  value: ReactNode;
}

/** A flat panel with a two-column description list. An empty value reads "Not set". */
export function FactsList({
  heading,
  rows,
  tone = "default",
}: {
  /** Read by a screen reader only: the screen already has its own title. */
  heading?: string;
  rows: readonly Fact[];
  tone?: "default" | "sunken";
}) {
  return (
    <section
      className={cx(
        "rounded-card border border-border-subtle p-5",
        tone === "sunken" ? "bg-surface-sunken" : "bg-surface",
      )}
    >
      {heading && <h2 className="sr-only">{heading}</h2>}
      <dl className="cols-icon-text m-0 grid gap-x-4 gap-y-2">
        {rows.map((row) => (
          <div key={row.term} className="contents">
            <dt className="text-sm text-text-secondary">{row.term}</dt>
            <dd className="m-0 font-medium wrap-anywhere">
              {row.value === null || row.value === undefined || row.value === ""
                ? "Not set"
                : row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** A registration plate: left to right, tabular, never wraps. */
export function Plate({ children }: { children: string }) {
  return (
    <span dir="ltr" className="num whitespace-nowrap">
      {children}
    </span>
  );
}

/** A 44px link with a left chevron and the parent's name. */
export function PageBack({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-(--size-target) items-center gap-1 text-text-link hover:underline"
    >
      <Icon name="left" />
      {children}
    </Link>
  );
}

/** One line: an information icon and a few quiet words. */
export function InlineNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-sm">
      <Icon name="info" className="mt-0.5 text-text-link" />
      <span>{children}</span>
    </p>
  );
}

/** The dealership's phone number as a `tel:` link (D-0001-25 A). In the demo the number is made up, and says so. */
export function PhoneLink({ phone }: { phone: string }) {
  return (
    <a
      href={`tel:${phone.replace(/[^\d+]/g, "")}`}
      className="inline-flex min-h-(--size-target) items-center text-text-link hover:underline"
    >
      Call {phone}
      {mockEnabled ? " (sample number)" : ""}
    </a>
  );
}
