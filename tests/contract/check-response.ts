// Checks one response against openapi.yaml: an undeclared status, a missing or wrong header, a wrong content
// type, or a body that does not match the contract, including a field the contract does not describe (AD-2).
// Ajv builds these checks at run time, which is fine in Node; the built page cannot do that (see the
// request checks, which are generated ahead of time).
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import {
  document,
  resolve,
  type Operation,
} from "../../src/api/contract/validator";

type Json = Record<string, unknown>;

/** The same schema with every local `$ref` pointed at the whole document (key `contract`). */
function anchored(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(anchored);
  if (node !== null && typeof node === "object") {
    return Object.fromEntries(
      Object.entries(node).map(([key, value]) => [
        key,
        key === "$ref" && typeof value === "string"
          ? `contract${value}`
          : anchored(value),
      ]),
    );
  }
  return node;
}

const ajv = new Ajv2020({ strict: false, allErrors: true });
ajv.addSchema(document, "contract");
const compiled = new WeakMap<object, ValidateFunction>();
function compile(schema: unknown): ValidateFunction {
  const cached = compiled.get(schema as object);
  if (cached) return cached;
  const validate = ajv.compile(anchored(schema) as object);
  compiled.set(schema as object, validate);
  return validate;
}

export function checkResponse(
  operation: Operation,
  status: number,
  headers: Headers,
  body: unknown,
): string[] {
  const declared = (operation.node.responses as Json)[String(status)];
  if (!declared)
    return [`${operation.id}: status ${status} is not in the contract`];
  const response = resolve(declared as Json);
  const problems: string[] = [];

  for (const [name, header] of Object.entries(
    (response.headers as Json | undefined) ?? {},
  )) {
    const value = headers.get(name);
    if (value === null) {
      problems.push(`${operation.id} ${status}: header ${name} is missing`);
    } else if (!compile(resolve(header as Json).schema)(value)) {
      problems.push(
        `${operation.id} ${status}: header ${name} is not in the expected format`,
      );
    }
  }

  const content = (response.content as Json | undefined) ?? {};
  const type = (headers.get("content-type") ?? "").split(";")[0]!.trim();
  if (Object.keys(content).length === 0) {
    if (body !== undefined)
      problems.push(`${operation.id} ${status}: the contract has no body here`);
    return problems;
  }
  const media = content[type] as Json | undefined;
  if (!media) {
    problems.push(
      `${operation.id} ${status}: content type "${type}" is not in the contract`,
    );
    return problems;
  }
  const validate = compile(media.schema);
  if (!validate(body)) {
    for (const error of validate.errors!) {
      problems.push(
        `${operation.id} ${status}: body ${error.instancePath || "/"} ${error.keyword} ${error.message ?? ""}`.trim(),
      );
    }
  }
  return problems;
}
