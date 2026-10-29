// The new-customer form's two groups (staff.md 5.3), the vehicle group on its own for "Add another vehicle"
// (D-0001-61 A), the danger summary, and the duplicate hint (D-0001-30 B): a blue note that never blocks.
import { useRef, useState } from "react";
import { Alert } from "../../components/Alert";
import { Button } from "../../components/Button";
import {
  EmailField,
  focusField,
  TelField,
  TextField,
} from "../../components/Fields";
import {
  customerSchema,
  fieldLabels,
  phoneLooksRight,
  registrationLooksRight,
  vehicleSchema,
  type FormField,
} from "./customer-form";
import {
  phoneEnding,
  type CustomerValues,
  type FoundCustomer,
  type VehicleValues,
} from "./staff-memory";
import { useFindDuplicates } from "./staff-queries";

export type FieldErrors = Partial<Record<FormField, string>>;

/** The problems of one group, in the order of its fields. */
export function validate(
  values: CustomerValues | VehicleValues,
  group: "customer" | "vehicle",
  now = Date.now(),
): FieldErrors {
  const schema = group === "customer" ? customerSchema : vehicleSchema(now);
  const result = schema.safeParse(values);
  const errors: FieldErrors = {};
  if (result.success) return errors;
  const order = Object.keys(values) as FormField[];
  for (const field of order) {
    const issue = result.error.issues.find((i) => i.path[0] === field);
    if (issue) errors[field] = issue.message;
  }
  return errors;
}

/** "3 things need fixing before you can continue." with each problem as a link to its field. */
export function FormSummary({ errors }: { errors: FieldErrors }) {
  const entries = Object.entries(errors) as [FormField, string][];
  return (
    <Alert
      kind="danger"
      title={`${entries.length === 1 ? "1 thing needs" : `${entries.length} things need`} fixing before you can continue.`}
    >
      <ul className="m-0 list-disc ps-5">
        {entries.map(([field, message]) => (
          <li key={field}>
            <a
              href={`#field-${field}`}
              onClick={(event) => {
                event.preventDefault();
                focusField(`field-${field}`);
              }}
            >
              {fieldLabels[field]}: {message}
            </a>
          </li>
        ))}
      </ul>
    </Alert>
  );
}

const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");

/** "has a Kia Ceed", "has a Kia Ceed and an Audi A3", or "has no vehicle on file". */
function hasVehicles(customer: FoundCustomer): string {
  const cars = customer.vehicles.map(
    (v) => `${article(v.make)} ${v.make} ${v.model}`,
  );
  if (cars.length === 0) return "has no vehicle on file";
  if (cars.length === 1) return `has ${cars[0]}`;
  return `has ${cars.slice(0, -1).join(", ")} and ${cars.at(-1)}`;
}

interface Hint {
  by: "phone" | "registration";
  value: string;
  customer: FoundCustomer;
}

function DuplicateHint({
  hint,
  onUse,
  onKeep,
}: {
  hint: Hint;
  onUse: () => void;
  onKeep: () => void;
}) {
  const { customer } = hint;
  const ending = phoneEnding(customer.phone).toLowerCase();
  const same =
    "If this is the same person, use their record so they are not saved twice. You can also go on and add a new customer.";
  return (
    <Alert
      kind="info"
      title={
        hint.by === "phone"
          ? "A customer with this phone number already exists."
          : "A vehicle with this registration is already on file."
      }
      actions={
        <>
          <Button onClick={onUse}>Use this customer</Button>
          <Button variant="quiet" onClick={onKeep}>
            Keep adding a new customer
          </Button>
        </>
      }
    >
      <p>
        {hint.by === "phone"
          ? `${customer.name}, ${ending}, ${hasVehicles(customer)}. ${same}`
          : `It belongs to ${customer.name}, ${ending}. ${same}`}
      </p>
    </Alert>
  );
}

type Errors = FieldErrors;

/** Registration, Make, Model and Year (optional): the vehicle half of the form. */
export function VehicleFields({
  values,
  errors,
  onChange,
  onRegistrationBlur,
}: {
  values: VehicleValues;
  errors: Errors;
  onChange: (values: VehicleValues) => void;
  onRegistrationBlur?: () => void;
}) {
  const set = (field: keyof VehicleValues) => (value: string) =>
    onChange({ ...values, [field]: value });
  return (
    <fieldset className="m-0 grid min-w-0 content-start gap-4 border-0 p-0">
      <legend className="mb-2 p-0 text-lg font-semibold">Vehicle</legend>
      <TextField
        label="Registration"
        required
        name="registration"
        dir="ltr"
        autoComplete="off"
        helper="The number plate, for example AB12 CDE."
        value={values.registration}
        error={errors.registration}
        onChange={(e) => set("registration")(e.target.value)}
        onBlur={onRegistrationBlur}
      />
      <TextField
        label="Make"
        required
        name="make"
        autoComplete="off"
        value={values.make}
        error={errors.make}
        onChange={(e) => set("make")(e.target.value)}
      />
      <TextField
        label="Model"
        required
        name="model"
        autoComplete="off"
        value={values.model}
        error={errors.model}
        onChange={(e) => set("model")(e.target.value)}
      />
      <TextField
        label="Year (optional)"
        name="year"
        inputMode="numeric"
        maxLength={4}
        autoComplete="off"
        value={values.year}
        error={errors.year}
        onChange={(e) => set("year")(e.target.value)}
      />
    </fieldset>
  );
}

/** The two groups, side by side from 768 wide, with the duplicate hint above them. */
export function CustomerFields({
  customer,
  vehicle,
  errors,
  onCustomer,
  onVehicle,
  onUseCustomer,
}: {
  customer: CustomerValues;
  vehicle: VehicleValues;
  errors: Errors;
  onCustomer: (values: CustomerValues) => void;
  onVehicle: (values: VehicleValues) => void;
  /** "Use this customer": back to the search with them picked, found by what matched. */
  onUseCustomer: (customer: FoundCustomer, by: string) => void;
}) {
  const findDuplicates = useFindDuplicates();
  const [hint, setHint] = useState<Hint | null>(null);
  const [kept, setKept] = useState<string[]>([]);
  // The last value looked up for each field: an answer to an earlier one is dropped.
  const asked = useRef<Partial<Record<Hint["by"], string>>>({});
  const set = (field: keyof CustomerValues) => (value: string) =>
    onCustomer({ ...customer, [field]: value });

  // Leaving the phone or the plate with a value that matches a stored one shows the note (D-0001-30 B).
  function look(by: Hint["by"], raw: string) {
    const value = raw.trim();
    const looksRight =
      by === "phone" ? phoneLooksRight(value) : registrationLooksRight(value);
    asked.current[by] = value;
    if (!looksRight || kept.includes(`${by}:${value}`)) return;
    findDuplicates(
      by === "phone" ? { phone: value } : { registration: value },
    ).then(
      (found) => {
        if (asked.current[by] !== value) return;
        const match = found[0];
        if (match) setHint({ by, value, customer: match });
        else setHint((h) => (h?.by === by ? null : h));
      },
      // The note is a help, never a step: when the look-up fails, the form goes on without it.
      () => undefined,
    );
  }

  // The note stands only while its field still holds the value that was looked up: an edit takes it away,
  // and an answer to an older value is never shown.
  const shown =
    hint &&
    hint.value ===
      (hint.by === "phone" ? customer.phone : vehicle.registration).trim()
      ? hint
      : null;

  return (
    <>
      {shown && (
        <DuplicateHint
          hint={shown}
          onUse={() => onUseCustomer(shown.customer, shown.value)}
          onKeep={() => {
            setKept((k) => [...k, `${shown.by}:${shown.value}`]);
            setHint(null);
            // The buttons go with the note: focus goes back to the field it was about.
            focusField(`field-${shown.by}`);
          }}
        />
      )}
      <div className="grid gap-6 md:grid-cols-2">
        <fieldset className="m-0 grid min-w-0 content-start gap-4 border-0 p-0">
          <legend className="mb-2 p-0 text-lg font-semibold">Customer</legend>
          <TextField
            label="Full name"
            required
            name="name"
            dir="auto"
            autoComplete="off"
            value={customer.name}
            error={errors.name}
            onChange={(e) => set("name")(e.target.value)}
          />
          <TelField
            label="Phone number"
            required
            name="phone"
            autoComplete="off"
            helper="Spaces, brackets and + are fine."
            value={customer.phone}
            error={errors.phone}
            onChange={(e) => set("phone")(e.target.value)}
            onBlur={(e) => look("phone", e.target.value)}
          />
          <EmailField
            label="Email (optional)"
            name="email"
            dir="ltr"
            autoComplete="off"
            helper="For the confirmation message."
            value={customer.email}
            error={errors.email}
            onChange={(e) => set("email")(e.target.value)}
          />
        </fieldset>
        <VehicleFields
          values={vehicle}
          errors={errors}
          onChange={onVehicle}
          onRegistrationBlur={() => look("registration", vehicle.registration)}
        />
      </div>
    </>
  );
}
