// Joins Zod and React Hook Form (D-0001-59): a small function of ours, no extra package.
import type { FieldErrors, FieldValues, Resolver } from "react-hook-form";
import type { ZodType } from "zod";

/**
 * A React Hook Form resolver for a Zod schema. The message is the schema's own words: write them to name
 * the field and the rule and never the typed value (SEC-9.AC-2). Zod's messages do not repeat the value.
 */
export function zodResolver<T extends FieldValues>(
  schema: ZodType<T>,
): Resolver<T> {
  return (values) => {
    const result = schema.safeParse(values);
    if (result.success) return { values: result.data, errors: {} };
    const errors: Record<string, unknown> = {};
    for (const issue of result.error.issues) {
      let node = errors;
      issue.path.forEach((key, index) => {
        const name = String(key);
        if (index === issue.path.length - 1) {
          // The first problem of a field is the one shown.
          node[name] ??= { type: issue.code, message: issue.message };
        } else {
          node = (node[name] ??= {}) as Record<string, unknown>;
        }
      });
    }
    return { values: {}, errors: errors as FieldErrors<T> };
  };
}
