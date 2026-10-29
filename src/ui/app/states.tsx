// The shared words of `signed-out`, `no-permission` and `not-found` (design.md 8.17, section 9; customer.md 7,
// staff.md 5.5, manager.md). They replace a page in place: the address stays as it was.
import { Button } from "../components/Button";
import { StateBlock } from "../components/StateBlock";
import { ApiProblem, type Role } from "../data/api-problem";
import {
  describeProblem,
  roleName,
  signedOutWords,
  type WordsContext,
} from "../data/words";
import { useSession } from "../session/session";
import { homeButtonLabel, homeFor, type DeniedKey } from "./guard";

const manager = "Only the garage manager can";
const toSchedule = "Switch role, or go to your schedule.";
const toBook = "Switch role, or go to Book a service.";

/** What `no-permission` says under "You cannot do that as {role}." */
function deniedText(key: DeniedKey, role: Role): string {
  if (role === "customer") {
    switch (key) {
      case "book-for-customer":
        return `Only garage staff can book for a customer. Customers book for themselves on the Book page. ${toBook}`;
      case "adjust":
        return "Only the garage manager can move an appointment or change its technician or bay. To change your own appointment, open it from My appointments. Switch role, or go to My appointments.";
      case "flagged":
      case "dealership":
      case "shifts":
      case "outbox":
        return `Only the garage manager can change opening hours, shifts and flagged bookings. ${toBook}`;
      default:
        return `Only garage staff and the garage manager can see the schedule. ${toBook}`;
    }
  }
  switch (key) {
    case "my-appointments":
      return `My appointments lists a customer's own bookings, so it is only for customers. Staff see appointments on the schedule. ${toSchedule}`;
    case "reschedule":
      return `Only customers can move their own appointments. Staff change an appointment from the schedule. ${toSchedule}`;
    case "adjust":
      return `${manager} move, reassign or cancel an appointment. ${toSchedule}`;
    case "flagged":
      return `${manager} see the flagged bookings. ${toSchedule}`;
    case "dealership":
      return `${manager} change opening hours and booking rules. ${toSchedule}`;
    case "shifts":
      return `${manager} change shifts. ${toSchedule}`;
    case "outbox":
      return `${manager} read the outbox. ${toSchedule}`;
    default:
      return `You cannot open that page as ${roleName[role]}. ${toSchedule}`;
  }
}

function RoleActions({ role }: { role: Role }) {
  const { focusSwitcher } = useSession();
  return (
    <>
      <Button variant="primary" to={homeFor(role)}>
        {homeButtonLabel(role)}
      </Button>
      <Button onClick={focusSwitcher}>Switch role</Button>
    </>
  );
}

export function SignedOut() {
  const { focusSwitcher, switcher } = useSession();
  return (
    <StateBlock kind="no-permission" title={signedOutWords.title} focusTitle>
      {signedOutWords.body}
      {switcher && (
        <span className="mt-3 block">
          <Button variant="primary" onClick={focusSwitcher}>
            Pick who you are
          </Button>
        </span>
      )}
    </StateBlock>
  );
}

export function NoPermission({
  denied,
  role,
}: {
  denied: DeniedKey;
  role: Role;
}) {
  return (
    <StateBlock
      kind="no-permission"
      title={`You cannot do that as ${roleName[role]}.`}
      actions={<RoleActions role={role} />}
      focusTitle
    >
      {deniedText(denied, role)}
    </StateBlock>
  );
}

/** Staff opened `?dealership=` of a dealership that is not theirs (staff.md 5.5; SEC-4), or a manager did (manager.md). */
export function OtherDealership({
  role,
  ownName,
  otherName,
}: {
  role: Role;
  ownName: string;
  otherName: string;
}) {
  const { focusSwitcher } = useSession();
  if (role === "manager") {
    return (
      <StateBlock
        kind="no-permission"
        title="You do not manage this dealership."
        focusTitle
        actions={
          <>
            <Button variant="primary" to={homeFor(role)}>
              Show {ownName}
            </Button>
            <Button onClick={focusSwitcher}>Switch role</Button>
          </>
        }
      >
        You manage {ownName}. {otherName} has its own manager. Show {ownName},
        or switch role.
      </StateBlock>
    );
  }
  return (
    <StateBlock
      kind="no-permission"
      title="You cannot open that dealership."
      focusTitle
      actions={
        <>
          <Button variant="primary" to={homeFor(role)}>
            Go to the {ownName} schedule
          </Button>
          <Button onClick={focusSwitcher}>Switch role</Button>
        </>
      }
    >
      Your account is linked to {ownName}. {otherName} is not one of your
      dealerships, so its schedule and customers stay hidden. If you should have
      access, ask the person who manages your account.
    </StateBlock>
  );
}

/** An unknown address. The words of a missing appointment are `ProblemState` (a 404). */
export function PageNotFound({ role }: { role: Role | null }) {
  return (
    <StateBlock
      kind="not-found"
      title="We cannot find that page."
      focusTitle
      actions={
        role === null ? undefined : (
          <>
            <Button variant="primary" to={homeFor(role)}>
              {homeButtonLabel(role)}
            </Button>
            {role === "customer" && (
              <Button to="/appointments">My appointments</Button>
            )}
          </>
        )
      }
    >
      {role === "customer"
        ? "The link may be out of date or mistyped. Go to Book a service, or open My appointments."
        : "The link may be out of date or mistyped. Go to the schedule."}
    </StateBlock>
  );
}

/** The words for any failed call (design.md section 9), in place of the screen's content. */
export function ProblemState({
  error,
  retry,
  context,
}: {
  error: unknown;
  retry?: () => void;
  context?: WordsContext;
}) {
  const { me } = useSession();
  const role = me?.role ?? null;
  const words = describeProblem(error, { role: role ?? undefined, ...context });
  const traceId = error instanceof ApiProblem ? error.traceId : null;
  if (words.kind === "signed-out") return <SignedOut />;
  if (words.kind === "no-permission" && role) {
    return (
      <StateBlock
        kind="no-permission"
        title={words.title}
        actions={<RoleActions role={role} />}
        focusTitle
      >
        {words.body}
      </StateBlock>
    );
  }
  if (words.kind === "not-found") {
    return (
      <StateBlock
        kind="not-found"
        title={words.title}
        focusTitle
        actions={
          role ? (
            <Button variant="primary" to={homeFor(role)}>
              {homeButtonLabel(role)}
            </Button>
          ) : undefined
        }
      >
        {words.body}
      </StateBlock>
    );
  }
  return (
    <StateBlock
      kind={words.kind === "closed" ? "info" : "error"}
      title={words.title}
      traceId={words.kind === "error" ? traceId : undefined}
      focusTitle
      actions={
        retry && words.kind === "error" ? (
          <Button variant="primary" icon="refresh" onClick={retry}>
            Try again
          </Button>
        ) : undefined
      }
    >
      {words.body}
    </StateBlock>
  );
}
