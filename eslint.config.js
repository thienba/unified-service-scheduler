// Lint rules that keep the architecture honest (D-0000-23, architecture.md AD-1..AD-16, SEC-11.AC-1).
// Each rule is tested in tests/lint/rules.test.ts, which lints small pieces of text.
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import boundaries from "eslint-plugin-boundaries";
import tseslint from "typescript-eslint";

const testFiles = (dir) => [`${dir}/**/*.test.{ts,tsx}`];

// ---------------------------------------------------------------------------
// Rules that apply to every file in src/ (SEC-11.AC-1)
// ---------------------------------------------------------------------------
const htmlSinkProperties = [
  {
    property: "innerHTML",
    message: "Show text as text. Never write HTML into the page.",
  },
  {
    property: "outerHTML",
    message: "Show text as text. Never write HTML into the page.",
  },
  {
    property: "insertAdjacentHTML",
    message: "Show text as text. Never write HTML into the page.",
  },
  {
    object: "document",
    property: "write",
    message: "Do not use document.write.",
  },
  {
    object: "document",
    property: "writeln",
    message: "Do not use document.writeln.",
  },
];

const dangerousSyntax = [
  {
    selector: "JSXIdentifier[name='dangerouslySetInnerHTML']",
    message: "dangerouslySetInnerHTML is not allowed (SEC-11).",
  },
  {
    selector: "Identifier[name='dangerouslySetInnerHTML']",
    message: "dangerouslySetInnerHTML is not allowed (SEC-11).",
  },
  {
    selector:
      "CallExpression[callee.name=/^(setTimeout|setInterval)$/]:matches([arguments.0.type='Literal'], [arguments.0.type='TemplateLiteral'])",
    message:
      "Do not pass a string of code to setTimeout or setInterval (SEC-11).",
  },
];

// ---------------------------------------------------------------------------
// AD-7: the domain is pure and synchronous
// ---------------------------------------------------------------------------
const domainSyntax = [
  {
    selector: "[async=true]",
    message: "The domain is synchronous. No async functions (AD-7).",
  },
  {
    selector: "AwaitExpression",
    message: "The domain is synchronous. No await (AD-7).",
  },
  {
    selector: "Identifier[name='Promise']",
    message: "The domain is synchronous. No promises (AD-7).",
  },
  {
    selector:
      "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message: "Pass the current time in as an argument. No Date.now() (AD-7).",
  },
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message:
      "Pass the current time in as an argument. No new Date() without an argument (AD-7).",
  },
  {
    selector: "MemberExpression[object.name='Math'][property.name='random']",
    message:
      "Pass random values or ids in as arguments. No Math.random() (AD-7).",
  },
];

const domainGlobals = [
  "crypto",
  "fetch",
  "window",
  "document",
  "localStorage",
  "indexedDB",
].map((name) => ({ name, message: `The domain must not use ${name} (AD-7).` }));

// ---------------------------------------------------------------------------
// AD-9: no local-time Date methods in the domain and application
// ---------------------------------------------------------------------------
const localTimeMethods = [
  "getFullYear",
  "getMonth",
  "getDate",
  "getDay",
  "getHours",
  "getMinutes",
  "getSeconds",
  "getMilliseconds",
  "setFullYear",
  "setMonth",
  "setDate",
  "setHours",
  "setMinutes",
  "setSeconds",
  "setMilliseconds",
  "getTimezoneOffset",
  "toLocaleString",
  "toLocaleDateString",
  "toLocaleTimeString",
].map((property) => ({
  property,
  message:
    "Do not use the browser's local time. Use the dealership time module (AD-9).",
}));

// ---------------------------------------------------------------------------
// AD-1: ask isBlocking(), never compare an appointment's status
// ---------------------------------------------------------------------------
const statusCompareSyntax = [
  {
    selector:
      "BinaryExpression[operator=/^[=!]==?$/] > MemberExpression[property.name='status']",
    message:
      "Do not compare status directly. Call isBlocking(appointment) (AD-1).",
  },
  {
    selector: "SwitchStatement[discriminant.property.name='status']",
    message:
      "Do not switch on status directly. Call isBlocking(appointment) (AD-1).",
  },
];

// ---------------------------------------------------------------------------
// AD-15: no web addresses in code outside src/config
// ---------------------------------------------------------------------------
const webAddressSyntax = [
  {
    selector: "Literal[value=/^https?:\\/\\//]",
    message:
      "No http:// or https:// address here. Settings live in src/config (AD-15).",
  },
  {
    selector: "TemplateElement[value.raw=/^https?:\\/\\//]",
    message:
      "No http:// or https:// address here. Settings live in src/config (AD-15).",
  },
];

// ---------------------------------------------------------------------------
// AD-16: no raw colours or arbitrary Tailwind values in src/ui
// ---------------------------------------------------------------------------
const rawColourPattern =
  "#[0-9a-fA-F]{3,8}\\b|\\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\\(";
const arbitraryValuePattern = "[A-Za-z0-9]-\\[(?!var\\(--)";
const rawColourSyntax = ["Literal", "TemplateElement"].flatMap((type) => {
  const field = type === "Literal" ? "value" : "value.raw";
  return [
    {
      selector: `${type}[${field}=/${rawColourPattern}/]`,
      message:
        "No raw colours. Use a token from src/styles/tokens.css (AD-16).",
    },
    {
      selector: `${type}[${field}=/${arbitraryValuePattern}/]`,
      message:
        "No arbitrary Tailwind values. Use a token class, or var(--token) (AD-16).",
    },
  ];
});

// ---------------------------------------------------------------------------
// Rule sets per folder. Each set is complete, because a later set replaces an
// earlier one for the same rule name.
// ---------------------------------------------------------------------------
function ruleSet({
  syntax = [],
  properties = [],
  globals = [],
  console = true,
  webAddress = true,
}) {
  return {
    "no-eval": "error",
    "no-implied-eval": "error",
    "no-new-func": "error",
    "no-console": console ? "error" : "off",
    "no-restricted-properties": ["error", ...htmlSinkProperties, ...properties],
    "no-restricted-globals": ["error", ...globals],
    "no-restricted-syntax": [
      "error",
      ...dangerousSyntax,
      ...syntax,
      ...(webAddress ? webAddressSyntax : []),
    ],
  };
}

// For one folder: its rules for normal files, and the same rules without the
// web-address ban for its test files (AD-15 allows addresses in tests).
function scope(dir, options) {
  return [
    {
      files: [`${dir}/**/*.{ts,tsx}`],
      ignores: testFiles(dir),
      rules: ruleSet(options),
    },
    {
      files: testFiles(dir),
      rules: ruleSet({ ...options, webAddress: false }),
    },
  ];
}

const domainOptions = {
  syntax: domainSyntax,
  properties: localTimeMethods,
  globals: domainGlobals,
};
const availabilityOptions = {
  ...domainOptions,
  syntax: [...domainSyntax, ...statusCompareSyntax],
};

// ---------------------------------------------------------------------------
// AD-2, AD-6: the import table of architecture.md section 7.1
// ---------------------------------------------------------------------------
const elements = [
  ["domain-time", "src/domain/time"],
  ["domain", "src/domain"],
  ["application", "src/application"],
  ["dexie", "src/infrastructure/storage/dexie"],
  ["telemetry", "src/infrastructure/telemetry"],
  ["infrastructure", "src/infrastructure"],
  ["api-contract", "src/api/contract"],
  ["api-mock", "src/api/mock"],
  ["api-client", "src/api/client"],
  ["ui", "src/ui"],
  ["config", "src/config"],
  ["styles", "src/styles"],
];

// What each folder may import (besides itself). `main` is the composition root and may import all.
const mayImport = {
  "domain-time": ["domain"],
  domain: ["domain-time"],
  application: ["domain", "domain-time"],
  dexie: [
    "application",
    "domain",
    "domain-time",
    "telemetry",
    "infrastructure",
  ],
  telemetry: ["application", "domain", "domain-time"],
  infrastructure: ["application", "domain", "domain-time", "telemetry"],
  "api-contract": [],
  "api-mock": [
    "api-contract",
    "application",
    "domain",
    "domain-time",
    "telemetry",
  ],
  "api-client": ["api-contract", "config", "telemetry"],
  ui: ["api-client", "api-contract", "config", "styles"],
  config: [],
  styles: [],
};

const allTypes = elements.map(([type]) => type);
const folderPolicies = Object.entries(mayImport).map(([from, allowed]) => ({
  from: { element: { type: from } },
  disallow: {
    to: {
      element: {
        type: allTypes.filter((t) => t !== from && !allowed.includes(t)),
      },
    },
  },
  message: `src/${from} must not import {{to.element.types}} (architecture.md section 7.1).`,
}));

const reactPackages = [
  "react",
  "react-dom",
  "react-router",
  "react-router-dom",
  "@tanstack/react-query",
];
const outerOnly = allTypes.filter((t) => !["ui", "main"].includes(t));
const packagePolicies = [
  {
    from: { element: { type: outerOnly } },
    disallow: { to: { module: { origin: "external", source: reactPackages } } },
    message: "Only src/ui may import React and its libraries (AD-6, AD-7).",
  },
  {
    from: { element: { type: ["domain", "application"] } },
    disallow: { to: { module: { origin: "external", source: "msw" } } },
    message:
      "The domain and application layers must not import MSW (AD-6, AD-7).",
  },
  {
    from: { element: { type: allTypes.filter((t) => t !== "dexie") } },
    disallow: { to: { module: { origin: "external", source: "dexie" } } },
    message: "Dexie is used only in src/infrastructure/storage/dexie/ (AD-8).",
  },
  {
    from: { element: { type: allTypes.filter((t) => t !== "domain-time") } },
    disallow: {
      to: {
        module: {
          origin: "external",
          source: ["@js-temporal/polyfill", "temporal-polyfill"],
        },
      },
    },
    message: "The date library is imported only in src/domain/time/ (AD-9).",
  },
];

// Test files may use the test libraries, whichever folder they sit in.
const testPolicies = [
  {
    from: { element: { type: allTypes } },
    allow: {
      from: { file: { categories: "test" } },
      to: {
        module: {
          origin: "external",
          source: [
            "vitest",
            "@testing-library/react",
            "@testing-library/dom",
            "fast-check",
            "fake-indexeddb",
          ],
        },
      },
    },
  },
];

const boundaryRules = {
  "boundaries/dependencies": [
    "error",
    {
      default: "allow",
      checkAllOrigins: true,
      policies: [...folderPolicies, ...packagePolicies, ...testPolicies],
    },
  ],
};

export default defineConfig(
  {
    ignores: [
      "dist",
      "coverage",
      "playwright-report",
      "test-results",
      "node_modules",
      ".state",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["eslint.config.js", "scripts/**/*.mjs"],
    languageOptions: { globals: { process: "readonly", console: "readonly" } },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      "boundaries/elements": elements.map(([type, pattern]) => ({
        type,
        pattern,
      })),
      "boundaries/files": [{ category: "test", pattern: "**/*.test.{ts,tsx}" }],
      "import/resolver": {
        node: { extensions: [".ts", ".tsx", ".js", ".mjs", ".json"] },
      },
    },
    rules: boundaryRules,
  },
  // General rules for all of src/, then the narrower folders. A later entry wins.
  ...scope("src", {}),
  ...scope("src/domain", domainOptions),
  ...scope("src/domain/availability", availabilityOptions),
  ...scope("src/application", {
    ...domainOptions,
    syntax: statusCompareSyntax,
    globals: [],
  }),
  ...scope("src/config", { webAddress: false }),
  ...scope("src/infrastructure/telemetry", { console: false }),
  ...scope("src/ui", { syntax: rawColourSyntax }),
);
