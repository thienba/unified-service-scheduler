// Builds the app in remote mode and searches the result for anything that exists only for the demo
// (SEC-14.AC-1, AD-15): the MSW worker file, the seed, and the strings `X-Demo-User`, `/_demo/` and `msw`.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const forbiddenStrings = ["X-Demo-User", "/_demo/", "msw"];
// Words that only the seed files hold.
const seedMarkers = ["Fakeford Motors", "customer.a@demo.example"];

/**
 * @param {Map<string, string>} files built file path (relative to the build) to its text
 * @returns {string[]} what is in the build that must not be
 */
export function findMockLeaks(files) {
  const problems = [];
  for (const [path, text] of files) {
    if (/(^|\/)mockServiceWorker\.js$/.test(path)) {
      problems.push(`${path} is the mock service worker`);
    }
    if (
      /seed|demo-users|customers|appointments|dealerships|resources/i.test(
        path,
      ) &&
      path.endsWith(".json")
    ) {
      problems.push(`${path} looks like seed data`);
    }
    for (const word of [...forbiddenStrings, ...seedMarkers]) {
      if (text.includes(word)) problems.push(`${path} contains "${word}"`);
    }
  }
  return problems;
}

function readTree(root, dir = root, files = new Map()) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) readTree(root, path, files);
    // Fonts and other binary files cannot hold the words as text we care about.
    else files.set(relative(root, path), readFileSync(path, "latin1"));
  }
  return files;
}

function main() {
  const outDir = mkdtempSync(join(tmpdir(), "remote-build-"));
  try {
    execFileSync(
      "npx",
      ["vite", "build", "--outDir", outDir, "--emptyOutDir"],
      {
        stdio: "inherit",
        env: {
          ...process.env,
          VITE_API_MODE: "remote",
          VITE_API_BASE_URL: "https://api.example.test/api",
        },
      },
    );
    const problems = findMockLeaks(readTree(outDir));
    if (problems.length > 0) {
      for (const problem of problems) console.error(problem);
      process.exit(1);
    }
    console.log("The remote build holds nothing that is only for the demo.");
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
