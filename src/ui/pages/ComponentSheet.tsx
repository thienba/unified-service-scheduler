// The demo-only component sheet (D-0001-56 A): every shared part in every state, on one page at `/components`.
// It is for evidence and for a reviewer to compare with design/foundation.html. A remote build has no route to it.
// Hover, focus and pressed are real here: use the pointer and the keyboard.
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { ActionBar } from "../components/ActionBar";
import { Alert } from "../components/Alert";
import {
  Badge,
  CountBadge,
  FlagBadge,
  StatusBadge,
  TransportBadge,
} from "../components/Badge";
import { Button } from "../components/Button";
import { DayStepper } from "../components/DayStepper";
import { Dialog } from "../components/Dialog";
import {
  Checkbox,
  ChoiceCards,
  DateField,
  EmailField,
  SelectField,
  Switch,
  TelField,
  TextField,
  TimeField,
} from "../components/Fields";
import { SegmentedControl } from "../components/SegmentedControl";
import {
  FactsList,
  InlineNote,
  PageBack,
  PhoneLink,
  Plate,
} from "../components/Small";
import { Skeleton, StateBlock } from "../components/StateBlock";
import { useToast } from "../components/Toast";
import { FormSummary } from "../forms/FormSummary";

function Part({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section
      className="grid grid-cols-1 gap-4 border-t border-border-subtle pt-8"
      aria-labelledby={`part-${title}`}
    >
      <h2 id={`part-${title}`} className="text-2xl">
        {title}
      </h2>
      {note && <p className="max-w-(--measure) text-text-secondary">{note}</p>}
      {children}
    </section>
  );
}

function Case({ name, children }: { name: string; children: ReactNode }) {
  return (
    <figure className="m-0 grid min-w-0 content-start gap-2">
      <div className="min-w-0">{children}</div>
      <figcaption className="text-sm text-text-secondary">{name}</figcaption>
    </figure>
  );
}

const grid = "grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3";
const carChoices = [
  { value: "wait", label: "Wait on site", icon: "hourglass" as const },
  { value: "drop_off", label: "Drop it off", icon: "login" as const },
  {
    value: "courtesy_car",
    label: "Borrow a courtesy car",
    icon: "key" as const,
  },
];
const sampleTrace = "4bf92f35a1b2c3d4e5f60718293a4b5c";

export function ComponentSheet() {
  const toast = useToast();
  const [segment, setSegment] = useState("technicians");
  const [day, setDay] = useState("2026-10-28");
  const [choice, setChoice] = useState<string | undefined>("drop_off");
  const [on, setOn] = useState(true);
  const [dialog, setDialog] = useState<
    null | "plain" | "destructive" | "busy" | "error"
  >(null);
  const safe = useRef<HTMLButtonElement>(null);

  return (
    <div className="grid grid-cols-1 gap-8">
      <div>
        <h1 className="text-2xl lg:text-3xl">Component sheet</h1>
        <p className="mt-2 max-w-(--measure) text-text-secondary">
          Every shared part in every state. Demo only. Hover, focus and pressed
          are real: use the pointer and the keyboard. All names and times are
          made-up sample data.
        </p>
      </div>

      <Part
        title="Button"
        note="Four variants. A disabled button says why in words. Loading keeps the width."
      >
        <div className={grid}>
          <Case name="Primary, secondary, quiet, danger">
            <div className="flex flex-wrap gap-2">
              <Button variant="primary">Confirm booking</Button>
              <Button>Reschedule</Button>
              <Button variant="quiet">Add another</Button>
              <Button variant="danger">Cancel appointment</Button>
            </div>
          </Case>
          <Case name="With an icon, and the icon-only button">
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon="plus">
                Book for a customer
              </Button>
              <Button icon="refresh">Try again</Button>
              <Button size="icon" icon="right" aria-label="Next day" />
            </div>
          </Case>
          <Case name="Disabled, with the reason in words">
            <Button
              variant="primary"
              disabled
              disabledReason="Pick a time to confirm"
            >
              Confirm booking
            </Button>
          </Case>
          <Case name="Disabled, every variant">
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" disabled>
                Confirm booking
              </Button>
              <Button disabled>Reschedule</Button>
              <Button variant="quiet" disabled>
                Add another
              </Button>
              <Button variant="danger" disabled>
                Cancel appointment
              </Button>
            </div>
          </Case>
          <Case name="Loading (aria-busy, presses ignored, same width)">
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" loading loadingLabel="Confirming…">
                Confirm booking
              </Button>
              <Button variant="danger" loading loadingLabel="Cancelling…">
                Cancel appointment
              </Button>
            </div>
          </Case>
          <Case name="Full width">
            <Button variant="primary" fullWidth>
              Confirm booking
            </Button>
          </Case>
        </div>
      </Part>

      <Part
        title="Form fields"
        note="Label above, helper and error below, 44px controls, 16px text. Errors name the field and the rule."
      >
        <div className={grid}>
          <Case name="Default with helper">
            <TextField
              label="Registration"
              name="sheet-reg"
              helper="For example AB12 CDE."
            />
          </Case>
          <Case name="Required">
            <TextField label="Last name" name="sheet-last" required />
          </Case>
          <Case name="Error">
            <TextField
              label="Registration"
              name="sheet-reg-error"
              required
              defaultValue="A"
              error="Registration is too short. Enter the plate, for example AB12 CDE."
            />
          </Case>
          <Case name="Disabled">
            <TextField
              label="Dealership"
              name="sheet-disabled"
              disabled
              defaultValue="Fakeford Motors (demo)"
            />
          </Case>
          <Case name="Telephone">
            <TelField
              label="Phone number"
              name="sheet-tel"
              helper="Made-up numbers only in this demo."
            />
          </Case>
          <Case name="Email">
            <EmailField label="Email" name="sheet-email" />
          </Case>
          <Case name="Select">
            <SelectField
              label="Service"
              name="sheet-service"
              placeholder="Choose a service"
              options={[
                { value: "full", label: "Full service" },
                { value: "mot", label: "MOT" },
              ]}
            />
          </Case>
          <Case name="Select, error">
            <SelectField
              label="Service"
              name="sheet-service-error"
              placeholder="Choose a service"
              error="Service is missing. Choose one from the list."
              options={[{ value: "full", label: "Full service" }]}
            />
          </Case>
          <Case name="Date and time">
            <div className="grid gap-3 sm:grid-cols-2">
              <DateField
                label="Date"
                name="sheet-date"
                thisYear={2026}
                defaultValue="2026-10-30"
              />
              <TimeField label="Start" name="sheet-time" defaultValue="10:00" />
            </div>
          </Case>
        </div>
        <div className="grid gap-4 sm:max-w-md">
          <FormSummary
            problems={[
              {
                name: "sheet-reg-error",
                message:
                  "Registration is too short. Enter the plate, for example AB12 CDE.",
              },
              {
                name: "sheet-service-error",
                message: "Service is missing. Choose one from the list.",
              },
            ]}
          />
        </div>
      </Part>

      <Part title="Choice cards, checkbox and switch">
        <div className={grid}>
          <Case name="No choice made">
            <ChoiceCards
              legend="What will you do with the car?"
              name="sheet-car-none"
              choices={carChoices}
            />
          </Case>
          <Case name="One chosen">
            <ChoiceCards
              legend="What will you do with the car?"
              name="sheet-car"
              choices={carChoices}
              value={choice}
              onChange={setChoice}
            />
          </Case>
          <Case name="Error, and an option that is not available">
            <ChoiceCards
              legend="What will you do with the car?"
              name="sheet-car-error"
              error="Choose what you will do with the car."
              choices={carChoices.map((c) =>
                c.value === "courtesy_car"
                  ? {
                      ...c,
                      disabled: true,
                      disabledReason: "Not available at this time",
                    }
                  : c,
              )}
            />
          </Case>
          <Case name="Checkbox: unchecked, checked, disabled">
            <div>
              <Checkbox label="Closed" name="sheet-closed" />
              <Checkbox label="On leave" name="sheet-leave" defaultChecked />
              <Checkbox label="Day off" name="sheet-off" disabled />
            </div>
          </Case>
          <Case name="Switch: on and off, and disabled">
            <div>
              <Switch label="Send reminders" checked={on} onChange={setOn} />
              <Switch label="Send copies" checked={false} onChange={() => {}} />
              <Switch label="Archive" checked disabled onChange={() => {}} />
            </div>
          </Case>
        </div>
      </Part>

      <Part title="Segmented control and day stepper">
        <div className={grid}>
          <Case name="Segmented control">
            <SegmentedControl
              label="Rows"
              value={segment}
              onChange={setSegment}
              options={[
                { value: "technicians", label: "Technicians" },
                { value: "bays", label: "Bays" },
              ]}
            />
          </Case>
          <Case name="Segmented control, disabled">
            <SegmentedControl
              label="View"
              value="list"
              disabled
              onChange={() => {}}
              options={[
                { value: "list", label: "List" },
                { value: "technician", label: "Technician" },
              ]}
            />
          </Case>
          <Case name="Day stepper with Today">
            <DayStepper date={day} today="2026-10-28" onChange={setDay} />
          </Case>
          <Case name="Day stepper at its limits">
            <DayStepper
              date="2026-10-28"
              today="2026-10-28"
              min="2026-10-28"
              max="2026-10-28"
              onChange={() => {}}
              label="Day, limited"
            />
          </Case>
        </div>
      </Part>

      <Part title="Badge" note="Always an icon and words.">
        <div className="flex flex-wrap gap-2">
          <StatusBadge status="confirmed" />
          <StatusBadge status="cancelled" />
          <StatusBadge status="past" />
          <TransportBadge transport="wait" />
          <TransportBadge transport="drop_off" />
          <TransportBadge transport="courtesy_car" />
          <Badge variant="danger" icon="x">
            Refused
          </Badge>
          <Badge variant="danger" icon="x" small>
            error
          </Badge>
          <CountBadge count={3} word="flagged" />
        </div>
        <div className="max-w-sm">
          <FlagBadge>
            Flagged: Ends after Bartholomew Wojciechowski&rsquo;s shift, 13:00
          </FlagBadge>
        </div>
      </Part>

      <Part
        title="Alert"
        note="The icon sits on the heading's line; the text and actions use the full width."
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Alert
            kind="warning"
            title="Sorry, 10:00 on Fri 30 Oct was just taken."
            actions={<Button variant="secondary">Choose another time</Button>}
          >
            <p>
              Another customer confirmed that time a moment before you. Nothing
              was booked for you.
            </p>
          </Alert>
          <Alert
            kind="info"
            title="Your current time stays until the new one is confirmed."
          >
            <p>Pick a new time below.</p>
          </Alert>
          <Alert kind="success" title="Saved.">
            <p>Your changes to the opening hours are in place.</p>
          </Alert>
          <Alert kind="danger" title="That change was not saved.">
            <p>Every technician who can do this job is busy then.</p>
          </Alert>
        </div>
      </Part>

      <Part
        title="State block"
        note="Empty, loading (the skeleton shows at once here; on a page only after 200 ms), error, info, compact, no-permission and not-found."
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <StateBlock
            kind="empty"
            headingLevel={2}
            title="You have no appointments yet"
            actions={
              <Button variant="primary" icon="plus">
                Book a service
              </Button>
            }
          >
            Book your first service and it will show here.
          </StateBlock>
          <StateBlock
            kind="loading"
            loadingLabel="Loading appointments"
            delay={0}
          />
          <StateBlock
            kind="error"
            headingLevel={2}
            title="Something went wrong on our side."
            traceId={sampleTrace}
            actions={
              <Button variant="primary" icon="refresh">
                Try again
              </Button>
            }
          >
            Nothing was changed. Try again; if it keeps happening, quote
            reference 4bf92f35.
          </StateBlock>
          <StateBlock
            kind="info"
            headingLevel={2}
            title="This appointment can no longer be changed online."
          >
            It starts in less than 2 hours. Contact Fakeford Motors (demo) to
            change it.
            <span className="mt-2 block">
              <PhoneLink phone="+44 1632 960 123" />
            </span>
          </StateBlock>
          <StateBlock
            kind="empty"
            compact
            headingLevel={3}
            title="No times left on this day"
          >
            Try another day.
          </StateBlock>
          <StateBlock
            kind="no-permission"
            headingLevel={2}
            title="You cannot do that as Customer."
            actions={
              <>
                <Button variant="primary">Go to Book a service</Button>
                <Button>Switch role</Button>
              </>
            }
          >
            Only garage staff and the garage manager can see the schedule.
            Switch role, or go to Book a service.
          </StateBlock>
          <StateBlock
            kind="not-found"
            headingLevel={2}
            title="We cannot find that appointment."
            actions={<Button variant="primary">Go to My appointments</Button>}
          >
            It may have been removed, or it belongs to someone else.
          </StateBlock>
          <Case name="Skeleton lines">
            <div className="grid gap-2">
              <Skeleton className="h-(--size-target)" />
              <Skeleton className="h-(--size-row)" />
            </div>
          </Case>
        </div>
      </Part>

      <Part
        title="Dialog and bottom sheet"
        note="A dialog from 640 wide, a bottom sheet below. Esc and the close button close it. The scrim does not close a destructive one."
      >
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setDialog("plain")}>Open a dialog</Button>
          <Button variant="danger" onClick={() => setDialog("destructive")}>
            Open a destructive dialog
          </Button>
          <Button onClick={() => setDialog("busy")}>
            Open it while it works
          </Button>
          <Button onClick={() => setDialog("error")}>
            Open it with an error
          </Button>
        </div>
        <Dialog
          open={dialog === "plain"}
          title="Leave without saving?"
          description="You changed the opening hours and have not saved them."
          onClose={() => setDialog(null)}
          actions={
            <>
              <Button variant="quiet" onClick={() => setDialog(null)}>
                Keep editing
              </Button>
              <Button variant="primary" onClick={() => setDialog(null)}>
                Leave page
              </Button>
            </>
          }
        />
        <Dialog
          open={dialog === "destructive"}
          destructive
          initialFocus={safe}
          title="Cancel this appointment?"
          description="The time will be free for other customers. We will send you a message to confirm, and your reminders are cancelled."
          onClose={() => setDialog(null)}
          actions={
            <>
              <Button ref={safe} onClick={() => setDialog(null)}>
                Keep appointment
              </Button>
              <Button variant="danger" onClick={() => setDialog(null)}>
                Cancel appointment
              </Button>
            </>
          }
        />
        <Dialog
          open={dialog === "busy"}
          destructive
          busy
          title="Cancel this appointment?"
          onClose={() => setDialog(null)}
          actions={
            <>
              <Button disabled>Keep appointment</Button>
              <Button variant="danger" loading loadingLabel="Cancelling…">
                Cancel appointment
              </Button>
            </>
          }
        />
        <Dialog
          open={dialog === "error"}
          title="Cancel this appointment?"
          error="This appointment can no longer be changed online. Contact Fakeford Motors (demo) to change it."
          onClose={() => setDialog(null)}
          actions={<Button onClick={() => setDialog(null)}>Close</Button>}
        />
      </Part>

      <Part
        title="Toast"
        note="Top centre from 1024 wide; above the bars on a phone. One at a time. Success and info close after 6 seconds; an error stays."
      >
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() =>
              toast.show({
                kind: "success",
                message: "Appointment cancelled. The time is free again.",
              })
            }
          >
            Show a success toast
          </Button>
          <Button
            onClick={() =>
              toast.show({
                kind: "info",
                message: "Now viewing as Staff, Demo Staff London",
              })
            }
          >
            Show an info toast
          </Button>
          <Button
            onClick={() =>
              toast.show({
                kind: "error",
                message: "We could not save that. Nothing was changed.",
              })
            }
          >
            Show an error toast
          </Button>
        </div>
      </Part>

      <Part title="Facts list, page back, inline note and phone link">
        <div className={grid}>
          <Case name="Facts list">
            <FactsList
              heading="Appointment"
              rows={[
                {
                  term: "Vehicle",
                  value: (
                    <>
                      Ford Focus, <Plate>AB12 CDE</Plate>
                    </>
                  ),
                },
                { term: "Service", value: "Full service, about 3 hours" },
                { term: "Technician", value: "Maya Okafor" },
                { term: "Notes", value: "" },
              ]}
            />
          </Case>
          <Case name="Facts list, cancelled">
            <FactsList
              tone="sunken"
              rows={[
                { term: "Service", value: "Brake pads" },
                { term: "Status", value: "Cancelled" },
              ]}
            />
          </Case>
          <Case name="Page back, inline note, phone link">
            <div className="grid gap-1">
              <PageBack to="/components">My appointments</PageBack>
              <InlineNote>The courtesy car is cleared at 09:00.</InlineNote>
              <PhoneLink phone="+44 1632 960 123" />
            </div>
          </Case>
        </div>
      </Part>

      <Part
        title="Action bar"
        note="Sticky at the bottom of a task screen on a phone (below 1024 here). The page keeps room for it."
      >
        <p className="text-text-secondary">
          At 390 wide the bar is at the bottom of this page.
        </p>
      </Part>
      <ActionBar
        title="Fri 30 Oct, 10:00"
        status="Ends 13:00"
        actions={<Button variant="primary">Confirm booking</Button>}
      />
    </div>
  );
}
