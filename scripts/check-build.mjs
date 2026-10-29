// Checks the built page (SEC-15.AC-1, AC-2): it has the Content Security Policy, and no built page or
// style sheet loads anything from another site.
import { readdirSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const requiredDirectives = [
  "default-src 'self'",
  "script-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
];

/**
 * @param {string} html the built index.html
 * @returns {string[]} what is wrong with it
 */
export function findPolicyProblems(html) {
  const meta = /<meta[^>]*http-equiv="Content-Security-Policy"[^>]*>/i.exec(
    html,
  )?.[0];
  if (!meta) return ["index.html has no Content Security Policy."];
  // Vite writes the quotes as &#39;.
  const content = (/content="([^"]*)"/.exec(meta)?.[1] ?? "")
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'");
  const directives = content.split(";").map((d) => d.trim());
  const problems = requiredDirectives
    .filter((directive) => !directives.includes(directive))
    .map((directive) => `The policy is missing: ${directive}`);
  if (/unsafe-(inline|eval)/.test(content))
    problems.push("The policy allows unsafe-inline or unsafe-eval.");
  return problems;
}

/**
 * @param {string} text a built page or style sheet
 * @returns {string[]} web addresses and imports that point off-site
 */
export function findOffSiteReferences(text) {
  // Comments (such as the Tailwind licence line) load nothing.
  const code = text.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...code.matchAll(/https?:\/\/[^\s"')]+|@import\s+url\(/g)].map(
    (m) => m[0],
  );
}

function main() {
  const html = readFileSync("dist/index.html", "utf8");
  const problems = findPolicyProblems(html);
  const files = ["dist/index.html"];
  for (const file of readdirSync("dist/assets"))
    if (file.endsWith(".css")) files.push(`dist/assets/${file}`);
  for (const file of files) {
    for (const reference of findOffSiteReferences(readFileSync(file, "utf8"))) {
      problems.push(`${file} refers to ${reference}`);
    }
  }
  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    process.exit(1);
  }
  console.log(
    "The built page has its Content Security Policy and loads nothing off-site.",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
