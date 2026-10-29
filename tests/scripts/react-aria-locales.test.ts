// D-0000-39: the build keeps React Aria's English words only (scripts/react-aria-locales.mjs).
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  keepEnglishStrings,
  stringsFile,
} from "../../scripts/react-aria-locales.mjs";

const modules = path.resolve(import.meta.dirname, "../../node_modules");
const files: string[] = [];
const walk = (dir: string) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (e.name === "intlStrings.mjs") files.push(full);
  }
};
for (const pkg of ["react-aria", "react-aria-components", "react-stately"]) {
  walk(path.join(modules, pkg, "dist"));
}

describe("React Aria's word lists keep English only", () => {
  it("finds every word list of the three packages, and the build's pattern matches each", () => {
    expect(files.length).toBeGreaterThan(20);
    for (const file of files) expect(stringsFile.test(file)).toBe(true);
  });

  it("keeps the en-US import and entry and drops the other 33 languages", () => {
    for (const file of files) {
      const code = readFileSync(file, "utf8");
      expect(code).toContain('"ja-JP"');
      const out: string = keepEnglishStrings(code, file);
      expect(out).toMatch(/^import \S+ from "[^"]*\/en-US\.mjs";$/m);
      expect(out).toMatch(/^\s*"en-US": \S+,?$/m);
      expect(
        out.match(/[a-z]{2,3}-[A-Z]{2}/g)?.every((l) => l === "en-US"),
      ).toBe(true);
      expect(out).toContain("export {");
    }
  });

  it("stops the build when a word list has no English words", () => {
    const code = [
      'import $a from "./intl/fr-FR.mjs";',
      "var $x = {};",
      "$x = {",
      '    "fr-FR": $a',
      "};",
      "export {$x as default};",
      "",
    ].join("\n");
    expect(() => keepEnglishStrings(code)).toThrow(
      "React Aria's English words (en-US) were not found",
    );
  });
});
