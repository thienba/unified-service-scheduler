// design.md 8.24. Dates that differ from the weekly pattern, each with a word badge and Remove, then a form to add
// one. Adding never saves: the line under the form says so.
import type { ReactNode } from "react";
import { Badge } from "./Badge";
import { Button } from "./Button";
import type { IconName } from "./Icon";

export interface DateItem {
  key: string;
  /** "Sat 14 Nov". */
  dateText: string;
  badge: { label: string; icon: IconName } | null;
  isNew: boolean;
  /** "Open 08:00 to 19:00". */
  summary: string;
  /** "Longer than usual: closes 2 hours later (usual 08:00 to 17:00)." */
  comparison: string;
}

export function DateExceptionList({
  listLabel,
  items,
  onRemove,
  disabled = false,
  emptyText = "No dates yet.",
  addLegend,
  addNote,
  children,
}: {
  listLabel: string;
  items: readonly DateItem[];
  onRemove: (key: string) => void;
  disabled?: boolean;
  emptyText?: string;
  addLegend: string;
  /** "Adding a date does not save it. Nothing is saved until you press Save settings." */
  addNote: string;
  /** The add form's fields and its button. */
  children: ReactNode;
}) {
  return (
    <>
      {items.length === 0 ? (
        <p className="text-text-secondary">{emptyText}</p>
      ) : (
        <ul aria-label={listLabel} className="m-0 list-none p-0">
          {items.map((item) => (
            <li
              key={item.key}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border-subtle py-3"
            >
              <div className="grid min-w-0 gap-1">
                <p className="flex flex-wrap items-center gap-2">
                  <b className="num">{item.dateText}</b>
                  {item.badge && (
                    <Badge icon={item.badge.icon}>{item.badge.label}</Badge>
                  )}
                  {item.isNew && (
                    <Badge variant="confirmed" icon="info">
                      New, not saved yet
                    </Badge>
                  )}
                </p>
                <span className="num">{item.summary}</span>
                <p className="text-sm text-text-secondary">{item.comparison}</p>
              </div>
              <Button
                variant="quiet"
                icon="x"
                disabled={disabled}
                aria-label={`Remove the change for ${item.dateText}`}
                onClick={() => onRemove(item.key)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <fieldset className="m-0 grid min-w-0 gap-4 border-0 p-0">
        <legend className="mb-3 p-0 font-heading text-lg font-bold">
          {addLegend}
        </legend>
        {children}
        <p className="text-sm text-text-secondary">{addNote}</p>
      </fieldset>
    </>
  );
}
