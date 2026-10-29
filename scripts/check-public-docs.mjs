// Checks the public copies in docs/ai-collaboration/ and the README (D-0000-36 B, D-0000-11). It fails
// when a file holds a secret-looking string, a local path, an email address that is not an obviously
// made-up one, or a link into the work repo's private `references/` folder.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

export const publicDocsDir = "docs/ai-collaboration";

/** Strings that look like a secret. A placeholder such as `<token>` or `${KEY}` does not match. */
const secretPatterns = [
  { name: "an AWS access key", re: /\bA(?:KIA|SIA)[0-9A-Z]{16}\b/ },
  {
    name: "a GitHub token",
    re: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/,
  },
  { name: "a Slack token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  {
    name: "an API key (sk-…)",
    re: /\bsk-(?:ant-|proj-|live_|test_)?[A-Za-z0-9_-]{20,}/,
  },
  { name: "a Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "a private key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  {
    name: "a JSON web token",
    re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/,
  },
  { name: "a bearer token", re: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/ },
  {
    name: "a password, secret, token or key written as a value",
    re: /\b(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?key|auth[_-]?token|client[_-]?secret|token)\b["']?\s*[:=]\s*["']?(?![<$({])[^\s"'`<>]{8,}/i,
  },
];

/** Paths on someone's own computer. `.state/<id>` (a placeholder) is allowed; `.state/my-ticket` is not. */
const localPathPatterns = [
  { name: "a macOS home folder", re: /\/Users\/[A-Za-z0-9._-]+/ },
  { name: "a Linux home folder", re: /\/home\/[A-Za-z0-9._-]+\// },
  { name: "a Windows path", re: /\b[A-Za-z]:\\/ },
  { name: "a home-folder path", re: /(?:^|[\s(`"'])~\/[A-Za-z0-9._-]/ },
  { name: "a temporary folder", re: /\/(?:private\/tmp|var\/folders)\// },
  { name: "a ticket worktree path", re: /\.state\/[A-Za-z0-9]/ },
];

const emailPattern =
  /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})\b/g;
/** Domains reserved for examples (RFC 2606, RFC 6761). */
function madeUpDomain(domain) {
  const d = domain.toLowerCase();
  return (
    /^example\.(?:com|org|net)$/.test(d) ||
    /(?:^|\.)(?:example|test|invalid|localhost)$/.test(d)
  );
}

/** A raw chat copy is named `references/<yyyy-mm-dd>-<slug>.md` in the work repo. */
const rawChatCopy = /references\/\d{4}-\d{2}-\d{2}-[A-Za-z0-9-]+/;
const markdownLink = /\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;

/**
 * @param {string} file path of the file, relative to the repository root
 * @param {string} text the file's text
 * @param {(path: string) => boolean} exists whether a repository-relative path exists
 * @returns {string[]} what is wrong, one line each, as `file:line: problem`
 */
export function findPublicDocProblems(file, text, exists) {
  const problems = [];
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    const at = `${file}:${index + 1}`;
    for (const { name, re } of secretPatterns)
      if (re.test(line)) problems.push(`${at}: looks like ${name}`);
    for (const { name, re } of localPathPatterns)
      if (re.test(line)) problems.push(`${at}: holds ${name}`);
    for (const match of line.matchAll(emailPattern))
      if (!madeUpDomain(match[1] ?? ""))
        problems.push(
          `${at}: holds an email address that is not a made-up one: ${match[0]}`,
        );
    if (rawChatCopy.test(line))
      problems.push(
        `${at}: names a raw chat copy in the private references/ folder`,
      );
    for (const match of line.matchAll(markdownLink)) {
      const target = match[1] ?? "";
      if (!/(?:^|\/)references\//.test(target)) continue;
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) {
        problems.push(`${at}: links into a references/ folder: ${target}`);
        continue;
      }
      const path = normalize(join(dirname(file), target.split("#")[0] ?? ""));
      const inside =
        path.startsWith(publicDocsDir + sep) ||
        path.startsWith(publicDocsDir + "/");
      if (!inside || !exists(path))
        problems.push(
          `${at}: links into the private references/ folder: ${target}`,
        );
    }
  });
  return problems;
}

/** @param {string} dir */
function markdownFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...markdownFiles(path));
    else if (entry.endsWith(".md")) found.push(path);
  }
  return found;
}

function main() {
  const root = process.cwd();
  if (!existsSync(publicDocsDir)) {
    console.error(`${publicDocsDir} is missing.`);
    process.exit(1);
  }
  const files = [...markdownFiles(publicDocsDir), "README.md"];
  const exists = (path) => existsSync(join(root, path));
  const problems = files.flatMap((file) =>
    findPublicDocProblems(
      relative(root, join(root, file)),
      readFileSync(file, "utf8"),
      exists,
    ),
  );
  for (const problem of problems) console.error(problem);
  if (problems.length > 0) {
    console.error(`${problems.length} problem(s) in the public docs.`);
    process.exit(1);
  }
  console.log(
    `Public docs are clean: ${files.length} files checked for secrets, local paths, real email addresses and links into references/.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
