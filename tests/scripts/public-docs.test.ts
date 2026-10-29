import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  findPublicDocProblems,
  findReferenceCodes,
  publicDocsDir,
} from "../../scripts/check-public-docs.mjs";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const file = `${publicDocsDir}/context/decisions/D-0000-1.md`;
const nothingExists = () => false;
const check = (text: string, exists: (p: string) => boolean = nothingExists) =>
  findPublicDocProblems(file, text, exists);

describe("public docs check (D-0000-36 B, D-0000-11)", () => {
  it.each([
    ["an AWS access key", "key AKIAABCDEFGHIJKLMNOP here"],
    ["a GitHub token", "ghp_abcdefghijklmnopqrstuvwxyz0123456789"],
    ["an API key", "sk-ant-api03-abcdefghijklmnopqrstuvwxyz"],
    ["a private key", "-----BEGIN RSA PRIVATE KEY-----"],
    [
      "a JSON web token",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc",
    ],
    ["a password value", "password: hunter2hunter2"],
    ["an API key value", 'API_KEY="abcd1234efgh5678"'],
    ["a bearer token", "Authorization: Bearer abcdefghijklmnopqrstuvwxyz"],
  ])("fails on %s", (_name, text) => {
    expect(check(text).join("\n")).toMatch(/looks like/);
  });

  it("does not fail on a placeholder or on the word token in a sentence", () => {
    expect(check("password: <your password>")).toEqual([]);
    expect(check("API_KEY=${API_KEY}")).toEqual([]);
    expect(check("Send the token as `Authorization: Bearer`.")).toEqual([]);
    expect(check("Design tokens live in one file.")).toEqual([]);
  });

  it.each([
    ["a macOS home folder", "see /Users/someone/work/file.md"],
    ["a Linux home folder", "in /home/someone/repo/"],
    ["a Windows path", "C:\\Users\\someone"],
    ["a home-folder path", "the repo is ~/Documents/repo"],
    ["a temporary folder", "/private/tmp/scratch/file"],
    ["a ticket worktree path", "cd .state/2026-10-28-some-ticket"],
  ])("fails on %s", (_name, text) => {
    expect(check(text).join("\n")).toMatch(/holds a/);
  });

  it("allows the .state/<id> placeholder", () => {
    expect(check("Work in `.state/<id>` and `<work>/.state/<id>`.")).toEqual(
      [],
    );
  });

  it("fails on a real-looking email address and allows made-up ones", () => {
    expect(check("write to someone@gmail.com").join("\n")).toMatch(
      /not a made-up one: someone@gmail.com/,
    );
    expect(
      check(
        "a@example.com b@demo.example c@shop.test x@evil.example d@example.org",
      ),
    ).toEqual([]);
  });

  it("does not take a package version for an email address", () => {
    expect(check("react@19.3.1 and @types/node")).toEqual([]);
  });

  it("fails on a raw chat copy, linked or not", () => {
    expect(
      check("Reason: see references/2026-10-28-answers.md.").join("\n"),
    ).toMatch(/raw chat copy/);
    expect(check("[words](../../references/notes.md)").join("\n")).toMatch(
      /links into the private references\/ folder/,
    );
    expect(
      check(
        "[x](https://github.com/someone/work/blob/main/references/a.md)",
      ).join("\n"),
    ).toMatch(/links into a references\/ folder/);
  });

  it("allows a link to the copied skill's own references/ folder", () => {
    const skill = `${publicDocsDir}/claude/skills/vtc-lite/SKILL.md`;
    const exists = (p: string) =>
      p === `${publicDocsDir}/claude/skills/vtc-lite/references/run.md`;
    expect(
      findPublicDocProblems(skill, "[run.md](references/run.md#a)", exists),
    ).toEqual([]);
    expect(
      findPublicDocProblems(skill, "[gone](references/gone.md)", exists).join(
        "\n",
      ),
    ).toMatch(/links into the private references/);
  });

  it("passes on the copied files and the README", () => {
    const walk = (dir: string): string[] =>
      readdirSync(path.join(repoRoot, dir)).flatMap((entry) => {
        const rel = `${dir}/${entry}`;
        if (statSync(path.join(repoRoot, rel)).isDirectory()) return walk(rel);
        return entry.endsWith(".md") ? [rel] : [];
      });
    const files = [...walk(publicDocsDir), "README.md"];
    expect(files.length).toBeGreaterThan(200);
    const exists = (p: string) => existsSync(path.join(repoRoot, p));
    const problems = files.flatMap((f) =>
      findPublicDocProblems(
        f,
        readFileSync(path.join(repoRoot, f), "utf8"),
        exists,
      ),
    );
    expect(problems).toEqual([]);
  });
});

describe("README reference codes", () => {
  it.each([
    "see D-0001-54",
    "question Q-0001-12",
    "REQ-BOOK-009",
    "SEC-15",
    "NFR-4",
    "AD-12",
    "scenario S3",
    "the Keyloop assessment",
    "keyloop-service-scheduler",
  ])("fails on %s", (text) => {
    expect(findReferenceCodes("README.md", text)).toHaveLength(1);
  });

  it("allows plain words", () => {
    expect(
      findReferenceCodes("README.md", "Book a time. Pull request 22, 23P01."),
    ).toEqual([]);
  });

  it("finds none in the real README", () => {
    expect(
      findReferenceCodes(
        "README.md",
        readFileSync(path.join(repoRoot, "README.md"), "utf8"),
      ),
    ).toEqual([]);
  });
});
