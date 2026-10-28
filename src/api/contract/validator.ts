// Finds the operation of a request and checks the request against openapi.yaml (D-0000-24, AD-2, SEC-7).
// The mock uses it to refuse bad input before the application layer is reached. The checks themselves are
// generated from the YAML (scripts/generate-contract.mjs), because the built page does not allow `eval`.
import type { ErrorObject } from "ajv";
import contract from "./openapi.json";
import * as bodyChecks from "./validators.body.js";
import * as paramChecks from "./validators.params.js";

type Json = Record<string, unknown>;
export const document = contract as unknown as Json;

export const METHODS = ["get", "put", "post", "patch", "delete"] as const;
export type Method = (typeof METHODS)[number];

export interface Operation {
  id: string;
  method: Method;
  /** The path template, such as `/appointments/{appointmentId}`. */
  path: string;
  tags: string[];
  node: Json;
}

export interface FieldIssue {
  field: string;
  message: string;
}

/** A generated check: true when the data is valid, and the reasons in `errors` when it is not. */
type Check = ((data: unknown) => boolean) & {
  errors?: ErrorObject[] | null;
};
const checkNamed = (module: object, name: string): Check =>
  (module as Record<string, Check>)[name]!;

const pointer = (ref: string): unknown =>
  ref
    .slice(2)
    .split("/")
    .reduce<unknown>(
      (node, key) =>
        (node as Json)[key.replaceAll("~1", "/").replaceAll("~0", "~")],
      document,
    );

/** Follows a `$ref` one step, as in `responses: { "401": { $ref: ... } }`. */
export function resolve<T extends Json>(node: T | { $ref: string }): Json {
  return "$ref" in node ? (pointer(node.$ref as string) as Json) : node;
}

// --- Operations -------------------------------------------------------------------------------

export const operations: Operation[] = Object.entries(
  document.paths as Record<string, Json>,
).flatMap(([path, item]) =>
  METHODS.filter((method) => item[method] !== undefined).map((method) => {
    const node = item[method] as Json;
    return {
      id: node.operationId as string,
      method,
      path,
      tags: (node.tags as string[] | undefined) ?? [],
      node: {
        ...node,
        parameters: [
          ...((item.parameters as []) ?? []),
          ...((node.parameters as []) ?? []),
        ],
      },
    };
  }),
);

const templateToPattern = (path: string) =>
  new RegExp(`^${path.replace(/\{[^}]+\}/g, "([^/]+)")}$`);

/** The operation for a method and a path under the base path, with the values of its path parameters. */
export function matchOperation(
  method: string,
  pathname: string,
): { operation: Operation; pathParams: Record<string, string> } | undefined {
  for (const operation of operations) {
    if (operation.method !== method.toLowerCase()) continue;
    const found = templateToPattern(operation.path).exec(pathname);
    if (!found) continue;
    const names = [...operation.path.matchAll(/\{([^}]+)\}/g)].map(
      (m) => m[1]!,
    );
    // A malformed escape such as `%` or `%E0%A4%A` matches nothing (it is not an error of ours).
    try {
      return {
        operation,
        pathParams: Object.fromEntries(
          names.map((name, i) => [name, decodeURIComponent(found[i + 1]!)]),
        ),
      };
    } catch {
      return undefined;
    }
  }
  return undefined;
}

// --- Requests ---------------------------------------------------------------------------------

interface Parameter {
  name: string;
  in: "path" | "query" | "header";
  required?: boolean;
  schema: unknown;
}
const parametersOf = (operation: Operation): Parameter[] =>
  (operation.node.parameters as Json[]).map(
    (p) => resolve(p) as unknown as Parameter,
  );

const KEYWORD_MESSAGES: Record<string, string> = {
  maxLength: "Is too long.",
  minLength: "Is too short.",
  pattern: "Is not in the expected format.",
  enum: "Must be one of the allowed values.",
  const: "Must be one of the allowed values.",
  maxItems: "Has too many entries.",
  minItems: "Has too few entries.",
  maxProperties: "Has too many entries.",
  minimum: "Is too small.",
  maximum: "Is too large.",
  oneOf: "Does not match any allowed form.",
  anyOf: "Does not match any allowed form.",
};

const dotted = (instancePath: string) =>
  instancePath
    .split("/")
    .slice(1)
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))
    .join(".");
const join = (...parts: string[]) => parts.filter((p) => p !== "").join(".");

/**
 * Turns Ajv's errors into `{ field, message }`. The message names the rule and never repeats the
 * submitted value (SEC-9.AC-2).
 */
function toIssues(errors: ErrorObject[], prefix = ""): FieldIssue[] {
  const unions = errors
    .filter((e) => e.keyword === "oneOf" || e.keyword === "anyOf")
    .map((e) => e.instancePath);
  const issues: FieldIssue[] = [];
  for (const error of errors) {
    // Inside a union, only the union's own error is useful.
    const insideUnion = unions.some(
      (path) =>
        error.instancePath.startsWith(path) &&
        !(error.instancePath === path && error.keyword === "oneOf"),
    );
    if (insideUnion && error.keyword !== "oneOf") continue;
    const base = join(prefix, dotted(error.instancePath));
    let field = base;
    let message = KEYWORD_MESSAGES[error.keyword] ?? "Is not valid.";
    if (error.keyword === "required") {
      field = join(base, String(error.params.missingProperty));
      message = "Is required.";
    } else if (error.keyword === "additionalProperties") {
      field = join(base, String(error.params.additionalProperty));
      message = "Is not accepted.";
    } else if (error.keyword === "propertyNames") {
      field = join(base, String(error.params.propertyName));
      message = "Is not a valid name.";
    } else if (error.keyword === "type") {
      message = `Must be of type ${String(error.params.type)}.`;
    }
    if (error.keyword === "propertyNames") continue;
    // Inside `propertyNames` the error is about the key itself.
    if (error.propertyName !== undefined)
      field = join(base, error.propertyName);
    if (!issues.some((i) => i.field === field && i.message === message)) {
      issues.push({ field: field || "body", message });
    }
  }
  return issues;
}

export type BodyInput =
  { kind: "none" } | { kind: "json"; value: unknown } | { kind: "invalid" };

export type RequestCheck =
  | {
      ok: true;
      query: Record<string, unknown>;
      path: Record<string, unknown>;
      body: unknown;
    }
  | { ok: false; issues: FieldIssue[]; missingHeaders: string[] };

export function validateRequest(
  operation: Operation,
  input: {
    query: URLSearchParams;
    pathParams: Record<string, string>;
    headers: Headers;
    body: BodyInput;
  },
): RequestCheck {
  const issues: FieldIssue[] = [];
  const missingHeaders: string[] = [];
  const parameters = parametersOf(operation);

  // Headers: a missing required one is reported on its own so the caller can pick its code. The values
  // that are there are checked as a group.
  const headerValues: Record<string, string> = {};
  for (const parameter of parameters.filter((p) => p.in === "header")) {
    const value = input.headers.get(parameter.name);
    if (value !== null) headerValues[parameter.name] = value;
    else if (parameter.required) missingHeaders.push(parameter.name);
  }
  const headerCheck = checkNamed(paramChecks, `header_${operation.id}`);
  if (!headerCheck(headerValues)) {
    for (const name of Object.keys(headerValues)) {
      if (headerCheck.errors!.some((e) => e.instancePath === `/${name}`)) {
        issues.push({ field: name, message: "Is not in the expected format." });
      }
    }
  }

  const grouped = (
    where: "path" | "query",
    values: Record<string, unknown>,
  ) => {
    const check = checkNamed(paramChecks, `${where}_${operation.id}`);
    if (!check(values)) issues.push(...toIssues(check.errors!));
    return values;
  };
  const path = grouped("path", { ...input.pathParams });
  const query = grouped(
    "query",
    Object.fromEntries(
      [...input.query.keys()].map((key) => {
        const all = input.query.getAll(key);
        return [key, all.length === 1 ? all[0] : all];
      }),
    ),
  );

  let body: unknown;
  if (operation.node.requestBody) {
    if (input.body.kind === "none") {
      issues.push({ field: "body", message: "A JSON body is required." });
    } else if (input.body.kind === "invalid") {
      issues.push({ field: "body", message: "Must be valid JSON." });
    } else {
      body = input.body.value;
      const check = checkNamed(bodyChecks, `body_${operation.id}`);
      if (!check(body)) issues.push(...toIssues(check.errors!));
    }
  }

  return issues.length > 0 || missingHeaders.length > 0
    ? { ok: false, issues, missingHeaders }
    : { ok: true, query, path, body };
}
