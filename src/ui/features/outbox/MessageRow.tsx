// manager.md 6: MessageRow. A button: icon by kind, kind in words, "when · To first name", a note and the
// state as an icon and a word. It never shows a phone number or an email (SEC-17.AC-1).
import { Badge } from "../../components/Badge";
import { cx } from "../../components/cx";
import { Icon } from "../../components/Icon";
import { stateWords, type MessageView } from "./outbox-view";

export function MessageRow({
  message,
  selected,
  opensDialog,
  onOpen,
}: {
  message: MessageView;
  /** On desktop the pane beside the list shows the open message; the row says it is the one. */
  selected: boolean;
  /** Below 1024 wide a row opens the message in a sheet instead. */
  opensDialog: boolean;
  onOpen: (id: string) => void;
}) {
  const state = stateWords[message.state];
  const cancelled = message.state === "cancelled";
  return (
    <li>
      <button
        type="button"
        aria-pressed={opensDialog ? undefined : selected}
        aria-haspopup={opensDialog ? "dialog" : undefined}
        data-message-id={message.id}
        onClick={() => onOpen(message.id)}
        className={cx(
          "grid min-h-(--size-row) w-full grid-cols-[var(--size-icon)_minmax(0,1fr)] items-start gap-x-3 gap-y-1 border-0 border-t border-solid border-border-subtle bg-transparent p-3 text-start transition-colors duration-(--duration-fast) ease-out hover:bg-surface focus-visible:-outline-offset-2 active:bg-surface-sunken sm:grid-cols-[var(--size-icon)_minmax(0,1fr)_auto]",
          selected && "bg-surface ring-3 ring-text ring-inset",
        )}
      >
        <Icon name={message.icon} className="mt-1" />
        <span className="grid min-w-0 gap-1">
          <b className={cx(cancelled && "text-text-secondary")}>
            {message.kindLabel}
          </b>
          <span className="num text-sm text-text-secondary">
            {message.when} · To <span dir="auto">{message.firstName}</span>
          </span>
          {message.note && (
            <span className="num text-sm text-text-secondary">
              {message.note}
            </span>
          )}
        </span>
        <span className="col-start-2 justify-self-start sm:col-start-3 sm:row-start-1">
          <Badge variant={state.badge} icon={state.icon}>
            {state.label}
          </Badge>
        </span>
      </button>
    </li>
  );
}
