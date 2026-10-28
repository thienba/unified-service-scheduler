// What counts as a good new customer and vehicle (Q-0001-23 A, D-0001-18). Messages name the field
// and the rule and never repeat what was typed (SEC-9.AC-2).
import type { EpochMs } from "../model";

export interface NewCustomerInput {
  name?: string;
  phone?: string;
  email?: string;
}

export interface NewVehicleInput {
  registration?: string;
  make?: string;
  model?: string;
  year?: number;
}

export interface FieldError {
  field: string;
  message: string;
}

const blank = (value: string | undefined) =>
  value === undefined || value.trim() === "";

/** Checks the vehicle half of the form; `field` names are prefixed with `newVehicle.`. */
export function validateNewVehicle(
  vehicle: NewVehicleInput,
  now: EpochMs,
): FieldError[] {
  const errors: FieldError[] = [];
  const add = (field: string, message: string) =>
    errors.push({ field: `newVehicle.${field}`, message });

  if (blank(vehicle.registration))
    add("registration", "Registration is required.");
  else if (
    !/^[A-Za-z0-9]{2,10}$/.test(vehicle.registration!.replace(/[\s-]/g, ""))
  ) {
    add("registration", "Registration must be 2 to 10 letters or digits.");
  }
  if (blank(vehicle.make)) add("make", "Make is required.");
  if (blank(vehicle.model)) add("model", "Model is required.");
  if (vehicle.year !== undefined) {
    const nextYear = new Date(now).getUTCFullYear() + 1;
    if (
      !Number.isInteger(vehicle.year) ||
      vehicle.year < 1950 ||
      vehicle.year > nextYear
    ) {
      add("year", `Year must be a whole year from 1950 to ${nextYear}.`);
    }
  }
  return errors;
}

/** Checks the customer half of the form; `field` names are prefixed with `newCustomer.`. */
export function validateNewCustomer(customer: NewCustomerInput): FieldError[] {
  const errors: FieldError[] = [];
  const add = (field: string, message: string) =>
    errors.push({ field: `newCustomer.${field}`, message });

  if (blank(customer.name)) add("name", "Full name is required.");
  if (blank(customer.phone)) add("phone", "Phone is required.");
  else {
    const phone = customer.phone!;
    const digits = phone.replace(/\D/g, "").length;
    if (!/^[\d\s()+-]+$/.test(phone) || digits < 7 || digits > 15) {
      add("phone", "Phone must have 7 to 15 digits.");
    }
  }
  if (!blank(customer.email) && !customer.email!.includes("@")) {
    add("email", "Email must contain @.");
  }
  return errors;
}
