// The Spectral rules of .spectral.mjs (SEC-7.AC-3, SEC-14.AC-3, D-0000-24) are tested on small contracts,
// and openapi.yaml itself must pass them with no error.
import { readFileSync } from "node:fs";
import {
  Document,
  Spectral,
  type RulesetDefinition,
} from "@stoplight/spectral-core";
import spectralParsers from "@stoplight/spectral-parsers";
import { describe, expect, it } from "vitest";
import ruleset from "../../.spectral.mjs";
import { generate } from "../../scripts/generate-contract.mjs";

const { Yaml } = spectralParsers;

async function lint(yaml: string) {
  const spectral = new Spectral();
  spectral.setRuleset(ruleset as unknown as RulesetDefinition);
  const results = await spectral.run(new Document(yaml, Yaml));
  return results.map((r) => ({
    code: r.code,
    severity: r.severity,
    message: r.message,
  }));
}

/** A request body schema inside an otherwise valid contract. */
const withBody = (schema: string, extraPath = "") => `
openapi: 3.1.0
info: { title: T, version: "1", contact: { name: n } }
tags: [{ name: t }]
paths:
  /things:
    post:
      operationId: makeThing
      tags: [t]
      summary: s
      description: d
      requestBody:
        content:
          application/json:
            schema:
${schema
  .split("\n")
  .map((line) => `              ${line}`)
  .join("\n")}
      responses:
        "200": { description: ok }
${extraPath}`;

const ruleCodes = async (yaml: string) =>
  (await lint(yaml))
    .filter((r) => r.code === "request-schema-bounds")
    .map((r) => r.message);

describe("request-schema-bounds (SEC-7.AC-3)", () => {
  it("passes a closed object with bounded strings and lists", async () => {
    expect(
      await ruleCodes(
        withBody(`type: object
additionalProperties: false
properties:
  name: { type: string, maxLength: 100 }
  kind: { type: string, enum: [a, b] }
  when: { type: string, pattern: "^[0-9]+$" }
  tags: { type: array, maxItems: 5, items: { type: string, maxLength: 5 } }`),
      ),
    ).toEqual([]);
  });

  it("fails a request string with no maxLength, enum, format or pattern", async () => {
    expect(
      await ruleCodes(
        withBody(`type: object
additionalProperties: false
properties:
  name: { type: string }`),
      ),
    ).toEqual([expect.stringContaining("request string")]);
  });

  it("fails a request list with no maxItems", async () => {
    expect(
      await ruleCodes(
        withBody(`type: object
additionalProperties: false
properties:
  tags: { type: array, items: { type: string, maxLength: 5 } }`),
      ),
    ).toEqual([expect.stringContaining("request list")]);
  });

  it("fails a request object without additionalProperties: false", async () => {
    expect(
      await ruleCodes(
        withBody(`type: object
properties:
  name: { type: string, maxLength: 5 }`),
      ),
    ).toEqual([expect.stringContaining("request object")]);
  });

  it("accepts a bounded map but not an unbounded one, and looks inside allOf and oneOf", async () => {
    expect(
      await ruleCodes(
        withBody(`type: object
maxProperties: 5
additionalProperties: { type: string, maxLength: 5 }`),
      ),
    ).toEqual([]);
    expect(
      await ruleCodes(
        withBody(`type: object
additionalProperties: { type: string, maxLength: 5 }`),
      ),
    ).toEqual([expect.stringContaining("request object")]);
    expect(
      await ruleCodes(
        withBody(`oneOf:
  - { type: string }
  - type: object
    additionalProperties: false`),
      ),
    ).toEqual([expect.stringContaining("request string")]);
  });
});

describe("demo-endpoints-are-tagged (SEC-14.AC-3)", () => {
  const demo = (path: string, tag: string) => `
openapi: 3.1.0
info: { title: T, version: "1", contact: { name: n } }
tags: [{ name: ${tag} }]
paths:
  ${path}:
    get:
      operationId: op
      tags: [${tag}]
      summary: s
      description: d
      responses:
        "200": { description: ok }
`;
  const problems = async (yaml: string) =>
    (await lint(yaml))
      .filter((r) => r.code === "demo-endpoints-are-tagged")
      .map((r) => r.message);

  it("passes a demo path with the tag and a normal path without it", async () => {
    expect(await problems(demo("/_demo/reset", "demo-only"))).toEqual([]);
    expect(await problems(demo("/things", "things"))).toEqual([]);
  });

  it("fails a demo path without the tag, and a normal path with it", async () => {
    expect(await problems(demo("/_demo/reset", "other"))).toEqual([
      expect.stringContaining("needs the tag demo-only"),
    ]);
    expect(await problems(demo("/things", "demo-only"))).toEqual([
      expect.stringContaining("Only paths under /_demo/"),
    ]);
  });
});

describe("openapi.yaml", () => {
  const yaml = readFileSync("src/api/contract/openapi.yaml", "utf8");

  it("passes every rule with no error and no warning", async () => {
    expect(await lint(yaml)).toEqual([]);
  });

  it("has its generated files up to date, and a change to it makes them out of date (the build check)", async () => {
    const current: Record<string, string> = await generate(yaml);
    expect(Object.keys(current)).toEqual([
      "src/api/contract/openapi.json",
      "src/api/contract/schema.d.ts",
      "src/api/contract/validators.params.js",
      "src/api/contract/validators.body.js",
    ]);
    for (const [file, text] of Object.entries(current)) {
      expect(readFileSync(file, "utf8"), file).toBe(text);
    }
    const changed = await generate(
      yaml.replace("maxLength: 100\n", "maxLength: 101\n"),
    );
    const outOfDate = Object.entries(changed)
      .filter(([file, text]) => text !== current[file])
      .map(([file]) => file);
    expect(outOfDate).toEqual([
      "src/api/contract/openapi.json",
      "src/api/contract/validators.body.js",
    ]);
  });
});
