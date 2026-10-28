// manager.md 6: MessagePane. The open message: kind, state, To, When, About, the text and its links, and
// for a cancelled one the "Not sent" alert. Text is shown as text (SEC-11.AC-2); a link is only the app's
// own origin, a fixed path and the appointment id (SEC-17.AC-2).
import { Alert } from "../../components/Alert";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { stateWords, type GroupView, type MessageView } from "./outbox-view";

export function MessageDetails({
  message,
  group,
  zoneNote,
}: {
  message: MessageView;
  group: GroupView;
  /** "(London time)" when the viewer's zone is another one, else null. */
  zoneNote: string | null;
}) {
  const state = stateWords[message.state];
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Badge variant={state.badge} icon={state.icon}>
          {state.label}
        </Badge>
      </div>
      {message.notSent && (
        <Alert kind="info" title="Not sent" headingLevel={3}>
          <p>{message.notSent}</p>
        </Alert>
      )}
      <dl className="cols-icon-text m-0 grid gap-x-4 gap-y-2">
        <dt className="text-sm text-text-secondary">To</dt>
        <dd className="m-0 font-medium wrap-anywhere">
          <span dir="auto">{message.firstName}</span>{" "}
          <span className="text-sm font-normal text-text-secondary">
            (first name only; contact details are not stored in messages)
          </span>
        </dd>
        <dt className="text-sm text-text-secondary">When</dt>
        <dd className="num m-0 font-medium">
          {message.dueText}
          {zoneNote ? ` ${zoneNote}` : ""}
        </dd>
        <dt className="text-sm text-text-secondary">About</dt>
        <dd className="m-0 font-medium wrap-anywhere">{group.about}</dd>
      </dl>
      <div className="grid gap-2">
        <p className="m-0 text-sm text-text-secondary">Message text</p>
        <div
          dir="auto"
          className="grid max-w-(--measure) gap-2 rounded-control border border-border-subtle bg-surface-page p-4 wrap-anywhere"
        >
          {message.lines.map((line, i) => (
            <p key={i} className="m-0">
              {line}
            </p>
          ))}
          {message.links.map((link) => (
            <p key={link.label} className="m-0">
              {link.label}: <a href={link.href}>{link.href}</a>
            </p>
          ))}
        </div>
      </div>
      <div>
        <Button to={`/appointments/${group.appointmentId}`}>
          Open appointment
        </Button>
      </div>
    </>
  );
}

/** The pane beside the list, from 1024 wide. Sticky, so the message stays in view while the list scrolls. */
export function MessagePane({
  open,
  zoneNote,
}: {
  open: { message: MessageView; group: GroupView } | null;
  zoneNote: string | null;
}) {
  return (
    <aside
      aria-label="Message"
      className="sticky top-4 grid min-w-0 content-start gap-4 self-start rounded-card border border-border-subtle bg-surface p-5"
    >
      {open ? (
        <>
          <h2 className="text-xl">{open.message.kindLabel}</h2>
          <MessageDetails
            message={open.message}
            group={open.group}
            zoneNote={zoneNote}
          />
        </>
      ) : (
        <>
          <h2 className="text-xl">Choose a message</h2>
          <p className="m-0 text-sm text-text-secondary">
            Pick a message in the list to read what the customer gets.
          </p>
        </>
      )}
    </aside>
  );
}
