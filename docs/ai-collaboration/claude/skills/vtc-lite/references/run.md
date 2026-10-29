# The run, step by step

Scripts live in `bin/` of this work repo. Times you write (`created`, `updated`, decisions)
come from `date -u`, never from a guess.

## Start

1. The run's start time is the `date -u` output from step 0 of the skill.
2. Pull the work repo and fetch the product repo ([git.md](git.md)).
3. **First run** (`context/conventions.md` does not exist): read the product repo and fill what
   you can, with no confirmation step.
   - `checks`: `setup` (install dependencies from the lockfile), `build`, `typecheck`, `lint`,
     `test`, `e2e`, each a command run from the product root, or null when the product has none. Find them in `package.json` scripts, `Makefile`,
     `pyproject.toml`, `Cargo.toml`, `go.mod`, `composer.json`, CI workflow files; prefer what CI
     runs. Never invent a command.
   - `app`: `url` the dev server serves and `start`, the command that starts it, or null.
   - `context/conventions.md`: stack, then three to eight lines on layout, naming, error
     handling and test style.
   - `context/environment.md`: which checks can run on this machine and which cannot, and the
     tools they need (simulators, devices, browsers) that are present or missing.
   - `context/index.md`: one line for each file written.
   Commit memory. Each check you fill also goes into `.claude/settings.json` `permissions.allow`
   as `Bash(<command>:*)`, so later runs need no prompt for it; if the host refuses that edit,
   say in the report that `new-workspace.sh --update` adds them.

## One ticket

1. Move it to `doing` (edit `status` and `updated`, update the board, commit memory).
2. Create its worktree `.state/<id>` on branch `vtc/<id>` ([git.md](git.md)), run `checks.setup`
   in it when set, then run every other non-null check once **before any change** and note
   which already fail: that is the base.
3. **Engineer** (profile from [roles.md](roles.md)) in `.state/<id>`, with the ticket path,
   `vtc.config.json`, `context/conventions.md` and the context files the ticket links.
4. **Checks:** run every non-null `checks` command in `.state/<id>`. Keep the output's last lines
   for the PR. A check that already failed on the base is not this ticket's to fix: report it in
   the PR as "failing on base" and never send it to a fix round.
5. **Screenshots** when the diff changes UI and `app.url` is set: start the app from the worktree
   if `app.start` is set, then `node bin/ui-shots.mjs --base <app.url> --paths <changed
   routes> --out tasks/<id>/shots --project .state/<id>`. A "screenshots skipped" line is fine.
6. **Review** with `vtc-lite-reviewer` in a fresh context: the ticket, the diff
   (`git -C .state/<id> diff <base>...HEAD`), the check output, the screenshots. Add
   `vtc-lite-security` in verify mode when [roles.md](roles.md) says so.
7. **Fix rounds:** a check the diff turned red, or a `fail` verdict, goes back to the engineer with the findings
   only. At most 3 rounds. Still failing: set `status: error`, `reason: "rounds-exhausted: <the
   unresolved findings, one line>"`, keep the branch, remove the worktree, commit memory, go to
   the next ticket.
8. **Commit and push the code, open the PR** ([git.md](git.md), [pr-evidence.md](pr-evidence.md)).
9. Move the ticket to `done` with `pr: <url or branch>` and `rounds: <n>`; commit memory. Remove
   the worktree, keeping the branch.

A ticket whose `dependsOn` ticket is in `error` is skipped and set to `error` with
`reason: "blocked-by: <id>"`.

## End

0. **What the run learned** goes into `context/` first
   ([context.md](context.md#record-what-a-run-learned)).
1. **Cost**, as the last step before the final memory commit. Run
   `node bin/cost.mjs --host <claude|codex> --since <start time> --marker <run marker>
   --project . --record . --log logs
   --request "<the request, one line>" --tickets <ids>`.
   If `node` is missing or it prints `{"measured":false}`, write "cost not measured" in the
   report.
2. **Report.** Write `reports/<yyyy-mm-dd>-<slug of the request>.md` (`-2`, `-3` on a collision)
   and put the same text in chat:

   ```markdown
   # <the request, in the human's words>

   Run `<run marker>` · <start time> to <end time> · host <claude|codex>

   ## Tickets

   | Ticket | Status | PR or branch | Rounds |
   |---|---|---|---|
   | [<title>](../tasks/<id>/README.md) | done / error: <reason> | <url or branch> | <n> of 3 |

   ## Context written

   <each `context/` file added or changed by this run, linked, with one line on what it now says;
   or "none">

   ## Guesses taken

   <each new Q- file: the question and the option taken, linked; or "none">

   ## Roles and cost

   | Role | Calls | Tokens | USD (API price) |
   |---|---|---|---|
   | <from logs/<run marker>.json `roles`> | | | |

   Total: <tokens> tokens, <usd or "unpriced"> · log: [logs/<run marker>.json](../logs/<run marker>.json)

   ## Needs a human

   <refused pushes, error tickets, checks failing on base, anything else; or "nothing">
   ```

3. Commit memory (including `reports/` and `logs/`) and push the work repo ([git.md](git.md)).
