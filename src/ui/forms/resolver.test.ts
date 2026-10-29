import { expect, it } from "vitest";
import { z } from "zod";
import { zodResolver } from "./resolver";

const schema = z.object({
  registration: z
    .string()
    .min(
      2,
      "Registration is too short. Enter the plate, for example AB12 CDE.",
    ),
  customer: z.object({
    phone: z.string().regex(/^\d+$/, "Phone number can only have digits."),
  }),
});
const run = (values: unknown) =>
  zodResolver(schema as never)(values as never, undefined, {
    fields: {},
    shouldUseNativeValidation: false,
  } as never);

it("passes good values through", async () => {
  const result = await run({
    registration: "AB12 CDE",
    customer: { phone: "0113" },
  });
  expect(result.errors).toEqual({});
  expect(result.values).toEqual({
    registration: "AB12 CDE",
    customer: { phone: "0113" },
  });
});

it("gives each problem under its field, nested ones too, with the schema's own words and not the typed value", async () => {
  const result = await run({
    registration: "X",
    customer: { phone: "secret-123" },
  });
  expect(result.values).toEqual({});
  const errors = result.errors as Record<
    string,
    { message: string } & Record<string, { message: string }>
  >;
  expect(errors["registration"]!.message).toBe(
    "Registration is too short. Enter the plate, for example AB12 CDE.",
  );
  expect(errors["customer"]!["phone"]!.message).toBe(
    "Phone number can only have digits.",
  );
  expect(JSON.stringify(result.errors)).not.toContain("secret-123");
});
