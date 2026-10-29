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
