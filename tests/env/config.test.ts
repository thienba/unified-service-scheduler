import { describe, expect, it } from "vitest";
import { readConfig } from "../../src/config";

describe("readConfig (AD-15, SEC-14.AC-4)", () => {
  it("defaults to the mock on the page's own /api", () => {
    expect(readConfig({})).toEqual({ apiMode: "mock", apiBaseUrl: "/api" });
  });

  it("takes remote mode with an https address, and http only for localhost", () => {
    for (const url of [
      "https://api.example.test/api",
      "http://localhost:8080/api",
      "http://localhost/api",
      "http://localhost",
    ]) {
      expect(
        readConfig({ VITE_API_MODE: "remote", VITE_API_BASE_URL: url }),
      ).toEqual({ apiMode: "remote", apiBaseUrl: url });
    }
  });

  it("refuses remote mode with any other address, or none", () => {
    for (const url of [
      "http://api.example.test/api",
      "http://localhost.evil.test/api",
      "ftp://x.test",
      "/api",
    ]) {
      expect(() =>
        readConfig({ VITE_API_MODE: "remote", VITE_API_BASE_URL: url }),
      ).toThrow("VITE_API_BASE_URL must start with https://");
    }
    expect(() => readConfig({ VITE_API_MODE: "remote" })).toThrow(
      "VITE_API_BASE_URL",
    );
  });

  it("refuses a mode that is not mock or remote", () => {
    expect(() => readConfig({ VITE_API_MODE: "prod" })).toThrow(
      "VITE_API_MODE must be mock or remote",
    );
  });

  it("is the only file that reads import.meta.env", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? walk(join(dir, entry.name))
          : [join(dir, entry.name)],
      );
    const readers = walk("src")
      .filter((file) => /\.(ts|tsx)$/.test(file) && !file.includes(".test."))
      .filter((file) => readFileSync(file, "utf8").includes("import.meta.env"))
      .filter((file) => !file.startsWith(join("src", "config")));
    expect(readers).toEqual([]);
    const names = readFileSync("src/config/index.ts", "utf8").match(
      /import\.meta\.env\.(\w+)/g,
    );
    expect([...new Set(names)].sort()).toEqual([
      "import.meta.env.VITE_API_BASE_URL",
      "import.meta.env.VITE_API_MODE",
    ]);
  });
});
