// `book-customer` (staff.md 5.3, design.md 8.22): who is the booking for. Staff and the manager find a
// customer by name, phone or plate, or add a new one with their vehicle. What they type and pick stays in
// screen memory (staff-memory.ts); the address holds only `start`, `technicianId` and `dealership`.
import { useEffect, useRef, useState, type RefObject } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { mockEnabled } from "../../../config";
import { ActionBar } from "../../components/ActionBar";
import { Alert } from "../../components/Alert";
import { Button } from "../../components/Button";
import { focusField, TextField, type Choice } from "../../components/Fields";
import { CustomerResultRow, VehiclePick } from "../../components/ForCustomer";
import { query, useAfterDelay, useMediaQuery } from "../../components/hooks";
import { useTaskMode } from "../../components/shell-context";
import { PageBack } from "../../components/Small";
import { Skeleton, StateBlock } from "../../components/StateBlock";
import { ApiProblem } from "../../data/api-problem";
import { formatDay, formatTime } from "../../format/format";
import { useSelectedDealership } from "../../session/dealership";
import {
  CustomerFields,
  FormSummary,
  VehicleFields,
  validate,
} from "./CustomerFields";
import {
  ADD_VEHICLE,
  phoneEnding,
  useStaffMemory,
  vehiclesLine,
  type FoundCustomer,
} from "./staff-memory";
import {
  useCustomerSearch,
  useGapFromAddress,
  type Gap,
} from "./staff-queries";
import { addressFor } from "./staff-words";

/**
 * Where focus goes when the page switches between the search and the form (NFR-4, WCAG 2.4.3): the button
 * pressed is gone, so focus is put on purpose on the Full name field, the search field or the picked row.
 */
type Arrive = "name" | "search" | "picked" | null;

export function BookCustomerPage() {
  const [memory] = useStaffMemory();
  const arrive = useRef<Arrive>(null);
  return memory.mode === "form" ? (
    <NewCustomer arrive={arrive} />
  ) : (
    <FindCustomer arrive={arrive} />
  );
}

/** The note from a tapped free gap (state `from-gap`). */
export function GapNote({ gap, body }: { gap: Gap; body: string }) {
  const { selected } = useSelectedDealership();
  const zone = selected?.timeZone ?? "UTC";
  return (
    <Alert
      kind="info"
      title={`Booking ${gap.technicianName} on ${formatDay(gap.start, zone, Date.now())}, from ${formatTime(gap.start, zone)}.`}
    >
      <p>{body}</p>
    </Alert>
  );
}

function Heading() {
  const [params] = useSearchParams();
  const { selected } = useSelectedDealership();
  const { gap } = useGapFromAddress(selected);
  const zone = selected?.timeZone ?? "UTC";
  const until = gap?.end
    ? ` ${gap.technicianName} is free until ${formatTime(gap.end, zone)}.`
    : "";
  const dealership = params.get("dealership");
  return (
    <>
      <div>
        <PageBack
          to={`/schedule${dealership ? `?${new URLSearchParams({ dealership }).toString()}` : ""}`}
        >
          Back to schedule
        </PageBack>
        <h1 className="mt-2 text-2xl lg:text-3xl">Who is the booking for?</h1>
        <p className="mt-2 max-w-(--measure) text-text-secondary">
          Find the customer who is calling. If they are new, add them.
        </p>
      </div>
      {gap && (
        <GapNote
          gap={gap}
          body={`You tapped a free gap. We keep this time and this technician while you choose the customer.${until}`}
        />
      )}
    </>
  );
}

/**
 * Keeps the tab bar aside on a phone for the whole page, also while the action bar is not drawn (no results).
 * It is keyed by whether the bar shows, so it sets task mode again after the bar's own clean-up.
 */
function TaskMode() {
  useTaskMode("md");
  return null;
}

function FindCustomer({ arrive }: { arrive: RefObject<Arrive> }) {
  const [memory, update] = useStaffMemory();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const md = useMediaQuery(query.md);
  const [text, setText] = useState(memory.text.trim());
  // Results follow the typing, a moment after the last key.
  useEffect(() => {
    const wanted = memory.text.trim();
    if (wanted === text) return;
    const timer = setTimeout(() => setText(wanted), 250);
    return () => clearTimeout(timer);
  }, [memory.text, text]);
  const search = useCustomerSearch(text);
  const [addErrors, setAddErrors] = useState<Record<string, string> | null>(
    null,
  );

  const typed = memory.text.trim();
  const found = text.length >= 3 && typed === text ? search.data : undefined;
  const picked = memory.picked;
  const choice = memory.vehicleChoice;
  const adding = picked !== null && choice === ADD_VEHICLE;
  const ready =
    picked !== null &&
    choice !== null &&
    (adding || picked.vehicles.some((v) => v.id === choice));
  const listed = found !== undefined && found.length > 0;
  const none = found !== undefined && found.length === 0;
  // The search has answered (or will not run), so the picked row is drawn if it is there.
  const settled =
    typed.length < 3 ||
    (typed === text && (search.isError || search.data !== undefined));

  useEffect(() => {
    const to = arrive.current;
    if (to === null || to === "name" || (to === "picked" && !settled)) return;
    arrive.current = null;
    const row =
      to === "picked"
        ? document.querySelector<HTMLInputElement>(
            'input[name="customer"]:checked',
          )
        : null;
    if (row) row.focus();
    else focusField("field-customer-search");
  }, [arrive, settled]);

  function pick(customer: FoundCustomer) {
    setAddErrors(null);
    update({
      picked: customer,
      vehicleChoice:
        customer.vehicles.length === 1 ? customer.vehicles[0]!.id : null,
    });
  }

  function proceed() {
    if (!picked || !ready) return;
    if (adding) {
      const errors = validate(memory.addedVehicle, "vehicle");
      if (Object.keys(errors).length > 0) {
        setAddErrors(errors);
        focusField(`field-${Object.keys(errors)[0]}`);
        return;
      }
      void navigate(addressFor(params, { customerId: picked.id }));
      return;
    }
    void navigate(
      addressFor(params, { customerId: picked.id, vehicleId: choice! }),
    );
  }

  const why = !picked
    ? "Choose a customer and a vehicle to continue."
    : picked.vehicles.length === 0 && !adding
      ? "Choose another customer to continue."
      : "Choose a vehicle to continue.";
  const chosenVehicle = picked?.vehicles.find((v) => v.id === choice);

  const continueButton = (
    <Button
      variant="primary"
      disabled={!ready}
      disabledReason={md ? why : undefined}
      onClick={proceed}
    >
      Continue
    </Button>
  );
  const addVehicle: Choice = {
    value: ADD_VEHICLE,
    label: "Add another vehicle",
    icon: "plus",
  };

  return (
    <div className="grid gap-6">
      <TaskMode key={String(listed)} />
      <Heading />
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
        <div className="grid gap-4 md:w-(--size-side) md:shrink-0">
          <TextField
            label="Name, phone or number plate"
            type="search"
            name="customer-search"
            autoComplete="off"
            helper="Type at least 3 characters. We show up to 10 customers."
            value={memory.text}
            onChange={(e) =>
              update({
                text: e.target.value,
                picked: null,
                vehicleChoice: null,
              })
            }
          />
          <Button
            variant={none ? "primary" : "secondary"}
            icon="plus"
            onClick={() => {
              arrive.current = "name";
              update({ mode: "form" });
            }}
          >
            Add a new customer
          </Button>
        </div>
        <div className="grid min-w-0 flex-1 gap-4">
          <p role="status" className="sr-only">
            {found === undefined
              ? ""
              : found.length === 0
                ? "No customer matches."
                : `${found.length} ${found.length === 1 ? "customer" : "customers"} found`}
          </p>
          {typed.length === 0 ? (
            <p className="text-text-secondary">
              Customers you find appear here, as you type.
            </p>
          ) : typed.length < 3 ? (
            <p className="text-text-secondary">
              Keep typing. We search from 3 characters, so the list does not
              show everyone.
            </p>
          ) : search.isError && typed === text ? (
            <StateBlock
              kind="error"
              compact
              headingLevel={2}
              title="Search is not working."
              traceId={
                search.error instanceof ApiProblem ? search.error.traceId : null
              }
              actions={
                <Button
                  variant="primary"
                  icon="refresh"
                  onClick={() => void search.refetch()}
                >
                  Try again
                </Button>
              }
            >
              {searchFailure(search.error)}
            </StateBlock>
          ) : found === undefined ? (
            <Searching />
          ) : none ? (
            <StateBlock
              kind="empty"
              compact
              headingLevel={2}
              title={`No customer matches “${typed}”.`}
            >
              Check the spelling, or try the phone number or the number plate.
              If this is a new customer, add them with their vehicle.
            </StateBlock>
          ) : (
            // A fieldset, not a radio group: the chosen row opens its vehicle choice and fields inside it.
            <fieldset className="m-0 min-w-0 border-0 p-0">
              <legend className="p-0">
                <h2 className="text-xl">
                  {found.length} {found.length === 1 ? "customer" : "customers"}{" "}
                  found
                </h2>
              </legend>
              {found.length >= 10 && (
                <p className="mt-1 text-sm text-text-secondary">
                  Showing the first 10. Type more of the name, phone number or
                  plate to narrow it.
                </p>
              )}
              <div className="mt-3 grid gap-2">
                {found.map((customer) => {
                  const on = picked?.id === customer.id;
                  return (
                    <CustomerResultRow
                      key={customer.id}
                      name="customer"
                      row={{
                        id: customer.id,
                        name: customer.name,
                        phone: phoneEnding(customer.phone),
                        vehicles: vehiclesLine(customer),
                      }}
                      checked={on}
                      onChange={() => pick(customer)}
                    >
                      {on && (
                        <>
                          {customer.vehicles.length === 0 && (
                            <Alert
                              kind="warning"
                              headingLevel={3}
                              role={null}
                              title={`${customer.name} has no vehicle on file.`}
                            >
                              <p>
                                A booking needs a vehicle. Choose another
                                customer, or add a new customer with their
                                vehicle.
                              </p>
                            </Alert>
                          )}
                          <VehiclePick
                            vehicles={customer.vehicles}
                            value={choice}
                            onChange={(value) => {
                              setAddErrors(null);
                              update({ vehicleChoice: value });
                            }}
                            extra={addVehicle}
                          />
                          {adding && (
                            <VehicleFields
                              values={memory.addedVehicle}
                              errors={addErrors ?? {}}
                              onChange={(addedVehicle) => {
                                update({ addedVehicle });
                                if (addErrors)
                                  setAddErrors(
                                    validate(addedVehicle, "vehicle"),
                                  );
                              }}
                            />
                          )}
                        </>
                      )}
                    </CustomerResultRow>
                  );
                })}
              </div>
            </fieldset>
          )}
          {listed && md && (
            <div className="flex flex-wrap items-center gap-3">
              {continueButton}
            </div>
          )}
        </div>
      </div>
      <ActionBar
        hideFrom="md"
        title={picked && ready ? picked.name : undefined}
        status={
          picked && ready
            ? adding
              ? "Add another vehicle"
              : `${chosenVehicle!.make} ${chosenVehicle!.model} ${chosenVehicle!.registration}`
            : listed
              ? why
              : undefined
        }
        actions={listed && !md ? continueButton : undefined}
      />
    </div>
  );
}

function searchFailure(error: unknown): string {
  const problem = error instanceof ApiProblem ? error : null;
  const reference = problem?.traceId?.slice(0, 8);
  return `We could not search for customers just now. Nothing was changed. ${
    reference
      ? `Try again; if it keeps happening, quote reference ${reference}.`
      : "Try again."
  }`;
}

/** `searching`: shown only after 200 ms, so a quick answer does not flash. */
function Searching() {
  const visible = useAfterDelay(200);
  return (
    <div aria-busy="true" className="grid gap-3">
      <h2 className={visible ? "text-xl" : "invisible text-xl"}>Searching…</h2>
      <div
        className={visible ? "grid gap-2" : "invisible grid gap-2"}
        aria-hidden="true"
      >
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="min-h-(--size-header) rounded-control" />
        ))}
      </div>
    </div>
  );
}

function NewCustomer({ arrive }: { arrive: RefObject<Arrive> }) {
  const [memory, update] = useStaffMemory();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [errors, setErrors] = useState<Record<string, string> | null>(null);
  const now = Date.now();

  useEffect(() => {
    if (arrive.current !== "name") return;
    arrive.current = null;
    focusField("field-name");
  }, [arrive]);

  function proceed() {
    const found = {
      ...validate(memory.customer, "customer"),
      ...validate(memory.vehicle, "vehicle", now),
    };
    setErrors(found);
    const first = Object.keys(found)[0];
    // The first field to fix takes focus (D-0001-66, 2); the summary lists them all.
    if (first) {
      focusField(`field-${first}`);
      return;
    }
    update({ newCustomerReady: true });
    void navigate(addressFor(params, {}));
  }

  const live = errors === null ? {} : errors;
  return (
    <div className="grid gap-6">
      <TaskMode />
      <Heading />
      <div className="grid max-w-(--size-form) gap-6">
        {mockEnabled && (
          <Alert kind="info" title="This is a demo.">
            <p>
              What you type stays in this browser. Use made-up names, numbers
              and plates.
            </p>
          </Alert>
        )}
        {errors !== null && Object.keys(errors).length > 0 && (
          <FormSummary errors={errors} />
        )}
        <CustomerFields
          customer={memory.customer}
          vehicle={memory.vehicle}
          errors={live}
          onCustomer={(customer) => {
            update({ customer, newCustomerReady: false });
            if (errors)
              setErrors({
                ...validate(customer, "customer"),
                ...validate(memory.vehicle, "vehicle", now),
              });
          }}
          onVehicle={(vehicle) => {
            update({ vehicle, newCustomerReady: false });
            if (errors)
              setErrors({
                ...validate(memory.customer, "customer"),
                ...validate(vehicle, "vehicle", now),
              });
          }}
          onUseCustomer={(customer, by) => {
            const vehicle =
              customer.vehicles.find(
                (v) => v.registration === memory.vehicle.registration.trim(),
              ) ??
              (customer.vehicles.length === 1 ? customer.vehicles[0] : null);
            arrive.current = "picked";
            update({
              mode: "search",
              text: by,
              picked: customer,
              vehicleChoice: vehicle?.id ?? null,
            });
          }}
        />
        <p className="text-sm text-text-secondary">
          Nothing is saved yet. The customer and the vehicle are saved when you
          confirm a booking.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={proceed}>
            Continue
          </Button>
          <Button
            variant="quiet"
            icon="left"
            onClick={() => {
              arrive.current = "search";
              update({ mode: "search" });
            }}
          >
            Back to search
          </Button>
        </div>
      </div>
    </div>
  );
}
