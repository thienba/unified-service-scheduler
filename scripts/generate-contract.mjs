// Turns src/api/contract/openapi.yaml into the generated files the code uses (D-0000-24):
//   openapi.json           read by the mock to find operations and parameters
//   schema.d.ts            the TypeScript types of the client and the handlers
//   validators.params.js, validators.body.js  the request checks, written out as plain code by Ajv
// The checks are written out ahead of time because the built page's Content Security Policy does not
// allow `eval`, which Ajv needs to build checks at run time (SEC-15).
// `--check` writes nothing and fails when a file is out of date, so a build cannot pass with types or
// checks that do not match the contract (AD-2).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import standaloneCode from "ajv/dist/standalone/index.js";
import spectralParsers from "@stoplight/spectral-parsers";
import openapiTS, { astToString } from "openapi-typescript";
import * as prettier from "prettier";

const { Yaml } = spectralParsers;
const dir = "src/api/contract";
const yamlFile = `${dir}/openapi.yaml`;
const jsonFile = `${dir}/openapi.json`;
const typesFile = `${dir}/schema.d.ts`;
const paramsFile = `${dir}/validators.params.js`;
const bodiesFile = `${dir}/validators.body.js`;

const METHODS = ["get", "put", "post", "patch", "delete"];

/** The header the client sets for tracing. A bad value is ignored, never refused (SEC-9.AC-3). */
export const IGNORED_HEADERS = ["traceparent"];

const pointer = (document, ref) =>
  ref
    .slice(2)
    .split("/")
    .reduce(
      (node, key) => node[key.replaceAll("~1", "/").replaceAll("~0", "~")],
      document,
    );

/** Gives the same schema with every local `$ref` pointed at the whole document (key `contract`). */
function anchored(node) {
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

/** The checks to write out: one schema for each part of each operation's request. */
function requestSchemas(document) {
  const schemas = {};
  for (const item of Object.values(document.paths)) {
    for (const method of METHODS.filter((m) => item[m])) {
      const operation = item[method];
      const id = operation.operationId;
      const parameters = [
        ...(item.parameters ?? []),
        ...(operation.parameters ?? []),
      ].map((p) => (p.$ref ? pointer(document, p.$ref) : p));
      const object = (where, filter = () => true) => {
        const own = parameters.filter((p) => p.in === where && filter(p));
        return {
          type: "object",
          // A query string or a path holds only what the contract lists.
          ...(where === "header" ? {} : { additionalProperties: false }),
          required: own.filter((p) => p.required).map((p) => p.name),
          properties: Object.fromEntries(own.map((p) => [p.name, p.schema])),
        };
      };
      schemas[`path_${id}`] = anchored(object("path"));
      schemas[`query_${id}`] = anchored(object("query"));
      schemas[`header_${id}`] = anchored(
        object(
          "header",
          (p) => !IGNORED_HEADERS.includes(p.name.toLowerCase()),
        ),
      );
      const body = operation.requestBody?.content?.["application/json"]?.schema;
      if (body) schemas[`body_${id}`] = anchored(body);
    }
  }
  return schemas;
}

function standalone(document, schemas, coerceTypes) {
  const ajv = new Ajv2020({
    strict: false,
    allErrors: true,
    coerceTypes,
    code: { source: true, esm: true },
  });
  ajv.addSchema(document, "contract");
  for (const [name, schema] of Object.entries(schemas))
    ajv.addSchema(schema, name);
  const code = standaloneCode(
    ajv,
    Object.fromEntries(Object.keys(schemas).map((name) => [name, name])),
  );
  // The output asks for Ajv's string-length helper with `require`, which a browser module cannot do.
  // The helper is small, so it is written into the file instead.
  return (
    code.replace(
      /const (\w+) = require\("ajv\/dist\/runtime\/ucs2length"\)\.default;/g,
      "const $1 = ucs2length;",
    ) + ucs2length
  );
}

/** Ajv's `ucs2length`: the length of a string in characters, counting a surrogate pair once. */
const ucs2length = `
function ucs2length(str) {
  const len = str.length;
  let length = 0;
  let pos = 0;
  let value;
  while (pos < len) {
    length++;
    value = str.charCodeAt(pos++);
    if (value >= 0xd800 && value <= 0xdbff && pos < len) {
      value = str.charCodeAt(pos);
      if ((value & 0xfc00) === 0xdc00) pos++;
    }
  }
  return length;
}
`;

const header =
  "// Generated from openapi.yaml by scripts/generate-contract.mjs. Do not edit.\n";

/** The generated files as text, from the YAML text: file name to contents. */
export async function generate(yamlText) {
  const parsed = Yaml.parse(yamlText);
  if (parsed.diagnostics?.length) {
    throw new Error(
      `openapi.yaml is not valid YAML: ${parsed.diagnostics[0].message}`,
    );
  }
  const document = parsed.data;
  const schemas = requestSchemas(document);
  const only = (keep) =>
    Object.fromEntries(Object.entries(schemas).filter(([name]) => keep(name)));
  return {
    [jsonFile]: await prettier.format(JSON.stringify(document), {
      parser: "json",
    }),
    [typesFile]: await prettier.format(
      `${header}${astToString(await openapiTS(document))}`,
      { parser: "typescript" },
    ),
    // Parameters arrive as text, so they are checked with coercion on; bodies are not.
    [paramsFile]:
      header +
      standalone(
        document,
        only((n) => !n.startsWith("body_")),
        true,
      ),
    [bodiesFile]:
      header +
      standalone(
        document,
        only((n) => n.startsWith("body_")),
        false,
      ),
  };
}

async function main() {
  const check = process.argv.includes("--check");
  const files = await generate(readFileSync(yamlFile, "utf8"));
  const stale = Object.entries(files).filter(
    ([file, text]) => !existsSync(file) || readFileSync(file, "utf8") !== text,
  );
  if (check) {
    if (stale.length > 0) {
      console.error(
        `Out of date with openapi.yaml: ${stale.map(([f]) => f).join(", ")}. Run: npm run contract`,
      );
      process.exit(1);
    }
    console.log("The generated contract files match openapi.yaml.");
    return;
  }
  for (const [file, text] of Object.entries(files)) writeFileSync(file, text);
  console.log(`Wrote ${Object.keys(files).join(", ")}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
