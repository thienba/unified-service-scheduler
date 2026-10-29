import { ESLint } from "eslint";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Each test lints a small piece of text as if it sat in a given folder of src/.
// Imports need real files to point at, so a temporary folder gets one module per layer.
const repoRoot = path.resolve(import.meta.dirname, "../..");
const layerFolders = [
  "src/domain",
  "src/domain/time",
  "src/application",
  "src/infrastructure/storage/memory",
  "src/infrastructure/storage/dexie",
  "src/infrastructure/telemetry",
  "src/api/contract",
  "src/api/mock",
  "src/api/client",
  "src/ui",
  "src/config",
];

let root: string;
let eslint: ESLint;

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), "lint-fixture-"));
  for (const folder of layerFolders) {
    mkdirSync(path.join(root, folder), { recursive: true });
    writeFileSync(path.join(root, folder, "m.ts"), "export const v = 1;\n");
  }
  symlinkSync(
    path.join(repoRoot, "node_modules"),
    path.join(root, "node_modules"),
  );
  eslint = new ESLint({
    cwd: root,
    overrideConfigFile: path.join(repoRoot, "eslint.config.js"),
  });
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

async function problems(file: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, {
    filePath: path.join(root, file),
  });
  return (result?.messages ?? []).map(
    (m) => m.ruleId ?? `parse error: ${m.message}`,
  );
}

async function fails(file: string, code: string, rule: string) {
  expect(await problems(file, code)).toContain(rule);
}

async function passes(file: string, code: string) {
  expect(await problems(file, code)).toEqual([]);
}

const syntax = "no-restricted-syntax";
const boundary = "boundaries/dependencies";

describe("no raw colours or arbitrary values in src/ui (AD-16, D-0000-12)", () => {
  it("fails on a raw hex colour", async () => {
    await fails("src/ui/a.tsx", 'export const c = "#ff0000";', syntax);
  });
  it("fails on rgb()", async () => {
    await fails("src/ui/a.tsx", 'export const c = "rgb(255 0 0)";', syntax);
  });
  it("fails on an arbitrary colour class", async () => {
    await fails("src/ui/a.tsx", 'export const c = "bg-[#fff]";', syntax);
  });
  it("fails on an arbitrary size class", async () => {
    await fails("src/ui/a.tsx", 'export const c = "w-[13px]";', syntax);
  });
  it("fails on a raw colour in a template string", async () => {
    await fails("src/ui/a.tsx", "export const c = `border ${1} #abc`;", syntax);
  });
  it("passes on var(--token) and token classes", async () => {
    await passes(
      "src/ui/a.tsx",
      'export const a = "bg-[var(--color-surface)] bg-surface-page text-text"; export const b = "var(--color-text)";',
    );
  });
  it("does not lint tokens.css, which is where colours are defined", async () => {
    const [result] = await eslint.lintText(
      "@theme { --color-carbon: #11181c; }",
      {
        filePath: path.join(root, "src/styles/tokens.css"),
      },
    );
    expect(result?.errorCount).toBe(0);
  });
});

describe("import table of architecture.md section 7.1 (AD-6, AD-2)", () => {
  // [importing file, a forbidden import, an allowed import]
  const rows: [string, string, string][] = [
    ["src/domain/x.ts", "../application/m", "./time/m"],
    ["src/domain/time/x.ts", "../../ui/m", "../m"],
    [
      "src/application/x.ts",
      "../infrastructure/storage/memory/m",
      "../domain/m",
    ],
    [
      "src/infrastructure/storage/memory/x.ts",
      "../../../ui/m",
      "../../../application/m",
    ],
    [
      "src/infrastructure/storage/dexie/x.ts",
      "../../../api/client/m",
      "../../../application/m",
    ],
    ["src/infrastructure/telemetry/x.ts", "../../ui/m", "../../application/m"],
    ["src/api/contract/x.ts", "../../domain/m", "./m"],
    ["src/api/mock/x.ts", "../../ui/m", "../../application/m"],
    ["src/api/client/x.ts", "../../application/m", "../contract/m"],
    ["src/ui/x.ts", "../domain/m", "../api/client/m"],
    ["src/config/x.ts", "../domain/m", "./m"],
  ];

  for (const [file, forbidden, allowed] of rows) {
    it(`${path.dirname(file)}: refuses ${forbidden} and accepts ${allowed}`, async () => {
      await fails(
        file,
        `import { v } from "${forbidden}"; export const x = v;`,
        boundary,
      );
      await passes(file, `import { v } from "${allowed}"; export const x = v;`);
    });
  }

  it("src/domain refuses react", async () => {
    await fails(
      "src/domain/x.ts",
      'import { useState } from "react"; export const x = useState;',
      boundary,
    );
  });
  it("src/ui accepts react", async () => {
    await passes(
      "src/ui/x.ts",
      'import { useState } from "react"; export const x = useState;',
    );
  });
});

describe("the domain is pure and synchronous (AD-7)", () => {
  const cases: [string, string][] = [
    ["an async function", "export async function f() { return 1; }"],
    ["await", "export const f = () => { void (async () => { await 1; })(); };"],
    ["Date.now()", "export const t = Date.now();"],
    ["new Date() with no argument", "export const t = new Date();"],
    ["Math.random()", "export const r = Math.random();"],
    ["crypto.randomUUID()", "export const id = crypto.randomUUID();"],
    ["console.log", 'console.log("x");'],
  ];
  for (const [name, code] of cases) {
    it(`fails on ${name}`, async () => {
      expect(await problems("src/domain/model/x.ts", code)).not.toEqual([]);
    });
  }
  it("passes on new Date(0) and plain code", async () => {
    await passes(
      "src/domain/model/x.ts",
      "export const t = new Date(0).getTime();",
    );
  });
});

describe("no local-time Date methods in the domain and application (AD-9)", () => {
  const methods = [
    "getHours",
    "getDay",
    "setHours",
    "getTimezoneOffset",
    "toLocaleString",
  ];
  for (const folder of ["src/domain/model", "src/application"]) {
    for (const method of methods) {
      it(`${folder} fails on ${method}`, async () => {
        await fails(
          `${folder}/x.ts`,
          `export const x = (d: Date) => d.${method}(0);`,
          "no-restricted-properties",
        );
      });
    }
  }
  it("src/ui may format with Intl, and Date methods are not banned there", async () => {
    await passes(
      "src/ui/x.ts",
      "export const x = (d: Date) => d.toLocaleString();",
    );
  });
  for (const library of ["@js-temporal/polyfill", "temporal-polyfill"]) {
    it(`${library} is refused outside src/domain/time`, async () => {
      const code = `import * as t from "${library}"; export const x = t;`;
      await fails("src/application/x.ts", code, boundary);
      await fails("src/domain/model/x.ts", code, boundary);
    });
    it(`${library} is accepted in src/domain/time`, async () => {
      await passes(
        "src/domain/time/x.ts",
        `import * as t from "${library}"; export const x = t;`,
      );
    });
  }
});

describe("one place for each outside concern", () => {
  it("console.log fails outside src/infrastructure/telemetry (AD-12)", async () => {
    await fails("src/ui/x.ts", 'console.log("x");', "no-console");
    await fails("src/application/x.ts", 'console.log("x");', "no-console");
  });
  it("console.log passes in src/infrastructure/telemetry (AD-12)", async () => {
    await passes("src/infrastructure/telemetry/x.ts", 'console.log("x");');
  });
  it("a web address fails in src/ui and passes in src/config (AD-15)", async () => {
    await fails(
      "src/ui/x.ts",
      'export const u = "https://example.com";',
      syntax,
    );
    await fails(
      "src/ui/x.ts",
      'export const u = "http://example.com";',
      syntax,
    );
    await passes("src/config/x.ts", 'export const u = "https://example.com";');
  });
  it("a web address passes in a test file (AD-15)", async () => {
    await passes("src/ui/x.test.ts", 'export const u = "https://example.com";');
  });
  it("dexie fails outside src/infrastructure/storage/dexie and passes inside (AD-8)", async () => {
    const code = 'import Dexie from "dexie"; export const x = Dexie;';
    await fails("src/ui/x.ts", code, boundary);
    await fails("src/application/x.ts", code, boundary);
    await fails("src/infrastructure/storage/memory/x.ts", code, boundary);
    await passes("src/infrastructure/storage/dexie/x.ts", code);
  });
  it("comparing an appointment status fails in availability and application (AD-1)", async () => {
    const code =
      'export const f = (a: { status: string }) => a.status === "cancelled";';
    await fails("src/domain/availability/x.ts", code, syntax);
    await fails("src/application/x.ts", code, syntax);
  });
  it("comparing a status passes elsewhere in the domain, where isBlocking lives (AD-1)", async () => {
    const code =
      'export const f = (a: { status: string }) => a.status !== "cancelled";';
    await passes("src/domain/appointment/x.ts", code);
  });
});

describe("no HTML or code sinks anywhere in src (SEC-11.AC-1)", () => {
  const cases: [string, string, string][] = [
    [
      "dangerouslySetInnerHTML",
      "export const x = <div dangerouslySetInnerHTML={{ __html: 'a' }} />;",
      "tsx",
    ],
    [
      ".innerHTML =",
      "export const f = (e: Element) => { e.innerHTML = 'a'; };",
      "ts",
    ],
    [
      ".outerHTML =",
      "export const f = (e: Element) => { e.outerHTML = 'a'; };",
      "ts",
    ],
    [
      "insertAdjacentHTML",
      "export const f = (e: Element) => { e.insertAdjacentHTML('beforeend', 'a'); };",
      "ts",
    ],
    ["document.write", "document.write('a');", "ts"],
    ["eval(...)", "export const x = eval('1');", "ts"],
    ["new Function(...)", "export const x = new Function('return 1');", "ts"],
    ["setTimeout with a string", "setTimeout('run()', 10);", "ts"],
    ["setInterval with a string", "setInterval('run()', 10);", "ts"],
  ];
  for (const [name, code, extension] of cases) {
    for (const folder of [
      "src/ui",
      "src/application",
      "src/infrastructure/seed",
    ]) {
      it(`${folder} fails on ${name}`, async () => {
        expect(await problems(`${folder}/x.${extension}`, code)).not.toEqual(
          [],
        );
      });
    }
  }
  it("setTimeout with a function passes", async () => {
    await passes("src/ui/x.ts", "setTimeout(() => undefined, 10);");
  });
});
