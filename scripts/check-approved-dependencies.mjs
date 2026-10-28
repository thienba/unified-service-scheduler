// Fails when package.json lists a runtime dependency that docs/approved-dependencies.json does not (SEC-16.AC-3).
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * @param {{ dependencies?: Record<string, string> }} packageJson
 * @param {{ runtimeDependencies: Record<string, string> }} approved
 * @returns {string[]} the runtime packages that are not approved, or have no decision named
 */
export function findUnapproved(packageJson, approved) {
  return Object.keys(packageJson.dependencies ?? {}).filter((name) => {
    const decision = approved.runtimeDependencies[name];
    return typeof decision !== "string" || !/^D-\d{4}-\d+$/.test(decision);
  });
}

function main() {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  const approved = JSON.parse(
    readFileSync("docs/approved-dependencies.json", "utf8"),
  );
  const unapproved = findUnapproved(packageJson, approved);
  if (unapproved.length > 0) {
    console.error(
      `Not in docs/approved-dependencies.json (with a D- decision): ${unapproved.join(", ")}`,
    );
    process.exit(1);
  }
  console.log("Every runtime dependency is approved.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
