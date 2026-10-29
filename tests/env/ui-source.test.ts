// A search of the source, as SEC-12.AC-2 asks: no screen navigates to an address taken from the URL.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

const files: string[] = [];
const walk = (dir: string) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name))
      files.push(full);
  }
};
walk(path.resolve(import.meta.dirname, "../../src"));

it("no route reads a redirect, returnTo, next or url query value", () => {
  const readers = files.filter((f) =>
    /(\.get|\.getAll|\.has)\(\s*["'](redirect|returnTo|return_to|next|url)["']/.test(
      readFileSync(f, "utf8"),
    ),
  );
  expect(readers).toEqual([]);
});

it("window.location is never assigned", () => {
  const assigners = files.filter((f) =>
    /(window\.|globalThis\.)?location(\.href|\.assign|\.replace)?\s*(=[^=]|\.assign\(|\.replace\()/.test(
      readFileSync(f, "utf8"),
    ),
  );
  expect(assigners).toEqual([]);
});

// D-0001-131: the drop-down, date and time controls are our themed Select, DatePicker and TimeField. A native
// `<select>`, `type="date"` or `type="time"` written in src/ui would bring back the browser's own pickers.
it("src/ui writes no native <select>, date input or time input", () => {
  const uiFiles = files.filter((f) =>
    f.startsWith(path.resolve(import.meta.dirname, "../../src/ui")),
  );
  expect(uiFiles.length).toBeGreaterThan(50);
  const native =
    /<select[\s>]|createElement\(\s*["']select["']|type\s*[=:]\s*\{?\s*["'](date|time|datetime-local)["']/;
  const found = uiFiles.filter((f) => native.test(readFileSync(f, "utf8")));
  expect(found).toEqual([]);
});
