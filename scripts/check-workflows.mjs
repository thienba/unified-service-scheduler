// Checks the GitHub Actions workflows (SEC-16.AC-4): every action from outside this repository is pinned
// to a full commit id, and the workflow asks for read-only permissions.
import { readdirSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * @param {string} text the workflow file
 * @returns {string[]} what is wrong with it
 */
export function findWorkflowProblems(text) {
  const problems = [];
  for (const line of text.split("\n")) {
    const match = /^\s*(?:-\s*)?uses:\s*([^\s#]+)/.exec(line);
    if (!match) continue;
    const action = match[1] ?? "";
    if (action.startsWith("./")) continue;
    if (!/@[0-9a-f]{40}$/.test(action))
      problems.push(`Action is not pinned to a full commit id: ${action}`);
  }
  const permissions = /^permissions:\s*(.*)$/m.exec(text);
  if (!permissions) {
    problems.push("The workflow has no top-level permissions.");
  } else if (
    (permissions[1] ?? "").trim() !== "read-all" &&
    !/^permissions:\s*\n\s+contents: read\s*$/m.test(text)
  ) {
    problems.push(
      "Top-level permissions must be read-all or contents: read only.",
    );
  }
  if (/^\s+[a-z-]+:\s*write\s*$/m.test(text))
    problems.push("A permission is set to write.");
  return problems;
}

function main() {
  const dir = ".github/workflows";
  let failed = false;
  for (const file of readdirSync(dir).filter((f) => /\.ya?ml$/.test(f))) {
    for (const problem of findWorkflowProblems(
      readFileSync(`${dir}/${file}`, "utf8"),
    )) {
      console.error(`${dir}/${file}: ${problem}`);
      failed = true;
    }
  }
  if (failed) process.exit(1);
  console.log("Workflows are pinned and read-only.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
