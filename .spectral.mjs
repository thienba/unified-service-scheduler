// OpenAPI lint rules (D-0000-24, SEC-7.AC-3, SEC-14.AC-3). `npm run lint` runs them over openapi.yaml.
import { oas } from "@stoplight/spectral-rulesets";

const STRING_BOUNDS = ["maxLength", "enum", "const", "pattern", "format"];

/** What is wrong with one request schema (resolved, so every $ref is already in place). */
function boundsProblems(schema, path) {
  if (schema === null || typeof schema !== "object") return [];
  const problems = [];
  const types = [].concat(schema.type ?? []);
  const here = (text) => problems.push({ message: text, path });

  if (
    types.includes("string") &&
    !STRING_BOUNDS.some((key) => schema[key] !== undefined)
  ) {
    here(
      "A request string needs a maxLength, an enum or a fixed format or pattern.",
    );
  }
  if (types.includes("array") && schema.maxItems === undefined) {
    here("A request list needs a maxItems.");
  }
  if (types.includes("object")) {
    const closed = schema.additionalProperties === false;
    const bounded =
      typeof schema.additionalProperties === "object" &&
      schema.maxProperties !== undefined;
    if (!closed && !bounded) {
      here(
        "A request object needs additionalProperties: false (or a bounded map with maxProperties).",
      );
    }
  }
  for (const [key, child] of Object.entries(schema.properties ?? {})) {
    problems.push(...boundsProblems(child, [...path, "properties", key]));
  }
  if (schema.items) {
    problems.push(...boundsProblems(schema.items, [...path, "items"]));
  }
  if (typeof schema.additionalProperties === "object") {
    problems.push(
      ...boundsProblems(schema.additionalProperties, [
        ...path,
        "additionalProperties",
      ]),
    );
  }
  for (const key of ["allOf", "oneOf", "anyOf"]) {
    (schema[key] ?? []).forEach((child, i) =>
      problems.push(...boundsProblems(child, [...path, key, i])),
    );
  }
  return problems;
}

/** A path is demo-only when it sits under /_demo/, and only then it carries the tag. */
function demoTagProblems(pathItem, _options, context) {
  const path = context.path[1];
  const isDemo = String(path).startsWith("/_demo/");
  const problems = [];
  for (const [method, operation] of Object.entries(pathItem)) {
    if (typeof operation !== "object" || operation === null) continue;
    const tagged = (operation.tags ?? []).includes("demo-only");
    if (isDemo !== tagged) {
      problems.push({
        message: isDemo
          ? "Every path under /_demo/ needs the tag demo-only."
          : "Only paths under /_demo/ may carry the tag demo-only.",
        path: [...context.path, method, "tags"],
      });
    }
  }
  return problems;
}

export default {
  extends: [[oas, "recommended"]],
  rules: {
    "request-schema-bounds": {
      description:
        "Every request string, list and object is bounded (SEC-7.AC-3).",
      message: "{{error}}",
      severity: "error",
      given: [
        "$.paths[*][*].requestBody.content[*].schema",
        "$.paths[*][*].parameters[*].schema",
        "$.paths[*].parameters[*].schema",
      ],
      then: {
        function: (schema, _options, context) =>
          boundsProblems(schema, context.path),
      },
    },
    "demo-endpoints-are-tagged": {
      description: "Only /_demo/ paths carry the tag demo-only (SEC-14.AC-3).",
      message: "{{error}}",
      severity: "error",
      given: "$.paths[*]",
      then: { function: demoTagProblems },
    },
  },
};
