import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findUnapproved } from "../../scripts/check-approved-dependencies.mjs";
import {
  findOffSiteReferences,
  findPolicyProblems,
} from "../../scripts/check-build.mjs";
import { findWorkflowProblems } from "../../scripts/check-workflows.mjs";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => readFileSync(path.join(repoRoot, file), "utf8");

describe("approved runtime dependencies (SEC-16.AC-3)", () => {
  const approved = { runtimeDependencies: { react: "D-0000-5" } };

  it("accepts a package on the list", () => {
    expect(
      findUnapproved({ dependencies: { react: "1.0.0" } }, approved),
    ).toEqual([]);
  });
  it("refuses a package that is not on the list", () => {
    expect(
      findUnapproved(
        { dependencies: { react: "1.0.0", left: "1.0.0" } },
        approved,
      ),
    ).toEqual(["left"]);
  });
  it("refuses a package with no decision named", () => {
    expect(
      findUnapproved(
        { dependencies: { react: "1.0.0" } },
        { runtimeDependencies: { react: "" } },
      ),
    ).toEqual(["react"]);
  });
  it("accepts the real package.json", () => {
    const packageJson = JSON.parse(read("package.json"));
    expect(
      findUnapproved(
        packageJson,
        JSON.parse(read("docs/approved-dependencies.json")),
      ),
    ).toEqual([]);
  });
});

describe("workflow files (SEC-16.AC-4)", () => {
  const sha = "3d3c42e5aac5ba805825da76410c181273ba90b1";

  it("refuses an action pinned to a tag", () => {
    const text =
      "permissions: read-all\njobs:\n  a:\n    steps:\n      - uses: actions/checkout@v4\n";
    expect(findWorkflowProblems(text)).toHaveLength(1);
  });
  it("accepts an action pinned to a full commit id", () => {
    const text = `permissions: read-all\njobs:\n  a:\n    steps:\n      - uses: actions/checkout@${sha} # v7\n`;
    expect(findWorkflowProblems(text)).toEqual([]);
  });
  it("refuses a workflow with no permissions", () => {
    expect(findWorkflowProblems("jobs: {}\n")).toHaveLength(1);
  });
  it("refuses write permission", () => {
    expect(
      findWorkflowProblems("permissions:\n  contents: write\n").length,
    ).toBeGreaterThan(0);
  });
  it("accepts contents: read", () => {
    expect(findWorkflowProblems("permissions:\n  contents: read\n")).toEqual(
      [],
    );
  });
  it("accepts every real workflow", () => {
    const dir = path.join(repoRoot, ".github/workflows");
    for (const file of readdirSync(dir)) {
      expect(
        findWorkflowProblems(readFileSync(path.join(dir, file), "utf8")),
        file,
      ).toEqual([]);
    }
  });
});

describe("Content Security Policy and local assets (SEC-15.AC-1, AC-2)", () => {
  const policy =
    "default-src 'self'; script-src 'self'; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'";
  const page = (content: string) =>
    `<head><meta http-equiv="Content-Security-Policy" content="${content}"></head>`;

  it("accepts the full policy", () => {
    expect(findPolicyProblems(page(policy))).toEqual([]);
  });
  it("accepts the policy with its quotes written as &#39;", () => {
    expect(findPolicyProblems(page(policy.replaceAll("'", "&#39;")))).toEqual(
      [],
    );
  });
  it("refuses a page with no policy", () => {
    expect(findPolicyProblems("<head></head>")).toHaveLength(1);
  });
  it("refuses a policy with a directive missing", () => {
    expect(
      findPolicyProblems(page(policy.replace("; object-src 'none'", ""))),
    ).toEqual(["The policy is missing: object-src 'none'"]);
  });
  it("refuses unsafe-inline", () => {
    expect(
      findPolicyProblems(page(`${policy}; style-src 'unsafe-inline'`)),
    ).toHaveLength(1);
  });
  it("finds an off-site address and an @import url(", () => {
    expect(
      findOffSiteReferences(
        '@import url("x"); a{background:url(https://example.com/a.png)}',
      ),
    ).toHaveLength(2);
  });
  it("ignores a web address inside a comment", () => {
    expect(
      findOffSiteReferences(
        "/*! MIT License | https://example.com */ a{color:red}",
      ),
    ).toEqual([]);
  });
  it("finds none in the source files of the page and the styles", () => {
    const files = ["index.html"];
    const stylesDir = path.join(repoRoot, "src/styles");
    for (const file of readdirSync(stylesDir))
      if (file.endsWith(".css")) files.push(`src/styles/${file}`);
    for (const file of files)
      expect(findOffSiteReferences(read(file)), file).toEqual([]);
  });
});

describe("one token file (D-0000-12, AD-16)", () => {
  it("no other style file or page defines a colour, a font or a theme", () => {
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(path.join(repoRoot, dir), {
        withFileTypes: true,
      })) {
        const file = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(file);
        else if (
          /\.(css|html)$/.test(entry.name) &&
          file !== "src/styles/tokens.css"
        ) {
          const text = read(file);
          if (
            /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch)\(|@theme|font-family/.test(
              text,
            )
          )
            found.push(file);
        }
      }
    };
    walk("src");
    expect(found).toEqual([]);
    expect(read("index.html")).not.toMatch(
      /#[0-9a-fA-F]{3,8}\b|font-family|<style/,
    );
  });
  it("tokens.css has local @font-face rules and no @import of a web address", () => {
    const css = read("src/styles/tokens.css");
    expect(css).toContain("@font-face");
    expect(css).not.toMatch(/^@import/m);
  });
});
