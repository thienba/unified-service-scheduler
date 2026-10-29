import { describe, expect, it } from "vitest";
import { findMockLeaks } from "../../scripts/check-remote-build.mjs";

const files = (entries: Record<string, string>) =>
  new Map(Object.entries(entries));

describe("findMockLeaks (SEC-14.AC-1)", () => {
  it("accepts a build with only the page and its assets", () => {
    expect(
      findMockLeaks(
        files({
          "index.html": "<html></html>",
          "assets/index-1.js": "console.log('hello')",
        }),
      ),
    ).toEqual([]);
  });

  it("refuses the worker file, seed data and each demo-only string", () => {
    expect(
      findMockLeaks(
        files({
          "mockServiceWorker.js": "",
          "assets/dealerships-1.json": "[]",
          "assets/a.js": "headers.set('X-Demo-User', id)",
          "assets/b.js": "fetch('/api/_demo/reset') // /_demo/",
          "assets/c.js": "import 'msw'",
          "assets/d.js": "name: 'Fakeford Motors (demo)'",
        }),
      ),
    ).toEqual([
      "mockServiceWorker.js is the mock service worker",
      "assets/dealerships-1.json looks like seed data",
      'assets/a.js contains "X-Demo-User"',
      'assets/b.js contains "/_demo/"',
      'assets/c.js contains "msw"',
      'assets/d.js contains "Fakeford Motors"',
    ]);
  });
});
