// design.md 8.26 ChangeSummary: "What changes", with Now beside After the change. A changed value has the right
// arrow, bold text and a small tag ("Changed", or "Refused" in the danger variant): never colour alone.
import { useId } from "react";
import { Badge } from "./Badge";
import { cx } from "./cx";
import { Icon } from "./Icon";

export interface ChangeRow {
  label: string;
  now: string;
  after: string;
  tag?: "Changed" | "Refused" | undefined;
}

export function ChangeSummary({
  rows,
  footnote,
  className,
}: {
  rows: readonly ChangeRow[];
  footnote?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <aside
      aria-labelledby={id}
      className={cx(
        "grid min-w-0 content-start gap-4 rounded-card border border-border-subtle bg-surface p-5",
        className,
      )}
    >
      <h2 id={id} className="text-xl">
        What changes
      </h2>
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-sm text-text-secondary *:pe-2 *:pb-2 *:text-start *:font-medium">
            <th scope="col">
              <span className="sr-only">What</span>
            </th>
            <th scope="col">Now</th>
            <th scope="col">After the change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.label}
              className="num *:border-t *:border-border-subtle *:py-2 *:pe-2 *:text-start *:align-top *:wrap-anywhere"
            >
              <th
                scope="row"
                className="w-px text-sm font-medium whitespace-nowrap text-text-secondary"
              >
                {row.label}
              </th>
              <td>{row.now}</td>
              <td>
                {row.tag ? (
                  <>
                    <b className="inline-flex items-start gap-1">
                      <Icon name="right" className="mt-1 shrink-0" />
                      <span>{row.after}</span>
                    </b>{" "}
                    <Badge
                      small
                      variant={row.tag === "Refused" ? "danger" : "plain"}
                    >
                      {row.tag}
                    </Badge>
                  </>
                ) : (
                  row.after
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {footnote && <p className="text-sm text-text-secondary">{footnote}</p>}
    </aside>
  );
}
