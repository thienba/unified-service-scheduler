// The checks of the new-customer form and of "Add another vehicle" (D-0001-18 A), in the screen's own words
// (staff.md 5.3). They match the domain's checks (src/domain/validation/new-customer.ts), which the screens may
// not import (architecture.md 7.1). Values are trimmed; a message never repeats what was typed (SEC-9.AC-2).
import { z } from "zod";

const words = {
  nameMissing:
    "Full name is missing. Enter the customer's first and last name, for example Marta Kowalska.",
  phoneMissing:
    "Phone number is missing. Enter a number we can call, for example 07700 900123.",
  phoneWrong:
    "That phone number looks too short or too long. Use 7 to 15 digits. Spaces, brackets and + are fine.",
  emailWrong:
    "That email address is missing an @. Check it, or leave it empty.",
  registrationMissing:
    "Registration is missing. Enter the plate, for example AB12 CDE.",
  registrationWrong:
    "That registration does not look right. Use 2 to 10 letters or numbers. Spaces are fine.",
  makeMissing: "Make is missing. Enter the make, for example Ford.",
  modelMissing: "Model is missing. Enter the model, for example Focus.",
};

/** The phone rule of D-0001-18: 7 to 15 digits; spaces, brackets, hyphens and + are fine (the API takes 20 characters). */
export function phoneLooksRight(phone: string): boolean {
  const value = phone.trim();
  const digits = value.replace(/\D/g, "").length;
  return (
    /^[\d\s()+-]+$/.test(value) &&
    value.length <= 20 &&
    digits >= 7 &&
    digits <= 15
  );
}

/** 2 to 10 letters or numbers once spaces and hyphens are left out (the API takes 15 characters in all). */
export function registrationLooksRight(registration: string): boolean {
  const value = registration.trim();
  return (
    value.length <= 15 &&
    /^[A-Za-z0-9 -]+$/.test(value) &&
    /^[A-Za-z0-9]{2,10}$/.test(value.replace(/[\s-]/g, ""))
  );
}

const required = (message: string) =>
  z.string().refine((v) => v.trim() !== "", message);

export const customerSchema = z.object({
  name: required(words.nameMissing),
  phone: required(words.phoneMissing).refine(
    (v) => v.trim() === "" || phoneLooksRight(v),
    words.phoneWrong,
  ),
  email: z
    .string()
    .refine((v) => v.trim() === "" || v.includes("@"), words.emailWrong),
});

/** The year rule: 1950 to next year, from the clock. */
export function lastYear(now: number): number {
  return new Date(now).getUTCFullYear() + 1;
}

export function vehicleSchema(now: number) {
  const top = lastYear(now);
  return z.object({
    registration: required(words.registrationMissing).refine(
      (v) => v.trim() === "" || registrationLooksRight(v),
      words.registrationWrong,
    ),
    make: required(words.makeMissing),
    model: required(words.modelMissing),
    year: z.string().refine((v) => {
      const value = v.trim();
      if (value === "") return true;
      const year = Number(value);
      return /^\d{4}$/.test(value) && year >= 1950 && year <= top;
    }, `That year does not look right. Use a year from 1950 to ${top}, or leave it empty.`),
  });
}

/** The label each field has, for the summary's links ("Phone number: That phone number …"). */
export const fieldLabels = {
  name: "Full name",
  phone: "Phone number",
  email: "Email",
  registration: "Registration",
  make: "Make",
  model: "Model",
  year: "Year",
} as const;

export type FormField = keyof typeof fieldLabels;
