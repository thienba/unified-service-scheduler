import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { pageDirectives } from "../../scripts/content-security-policy.mjs";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => readFileSync(path.join(repoRoot, file), "utf8");

// The host sends the page's policy as a real header too (SEC-15.AC-4, D-0000-38). The two must not drift.
describe("the Vercel header carries the built page's Content Security Policy (SEC-15.AC-4)", () => {
  const config = JSON.parse(read("vercel.json")) as {
    headers: { source: string; headers: { key: string; value: string }[] }[];
  };
  const header = config.headers
    .find((h) => h.source === "/(.*)")
    ?.headers.find((h) => h.key === "Content-Security-Policy")?.value;
  const pagePolicy = pageDirectives;

  it("has every directive of the page's policy", () => {
    expect(pagePolicy.length).toBeGreaterThan(3);
    const directives = (header ?? "").split("; ");
    for (const directive of pagePolicy) expect(directives).toContain(directive);
  });
  it("also forbids framing, which a meta policy cannot do", () => {
    expect(header).toContain("frame-ancestors 'none'");
  });
  it("sends every path but /api/ to the app, so a deep link opens it", () => {
    expect(config).toMatchObject({
      rewrites: [{ source: "/((?!api/).*)", destination: "/index.html" }],
      outputDirectory: "dist",
    });
  });
  // D-0001-142: a call that misses the mock gets the host's 404, not the app's page with 200.
  it("leaves /api/ paths out of the app rewrite, and keeps every other path in it", () => {
    const source = (config as unknown as { rewrites: { source: string }[] })
      .rewrites[0]!.source;
    const rule = new RegExp(`^${source}$`);
    for (const p of ["/api/service-types", "/api/dealerships/x/availability"])
      expect(rule.test(p)).toBe(false);
    for (const p of [
      "/",
      "/book",
      "/schedule",
      "/appointments/x/cancel",
      "/apiary",
    ])
      expect(rule.test(p)).toBe(true);
  });
});
