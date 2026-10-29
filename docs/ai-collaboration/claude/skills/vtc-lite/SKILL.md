---
name: vtc-lite
description: "VTC Lite: a small delivery team in plain files. Use for every request in a VTC Lite work repo (a repository with vtc.config.json): fix, build or change the product, status, cost, or \"answer Q-...\". Turns the request into tickets, builds each in a worktree of the product repo, checks it, opens a PR with evidence, and never stops to ask."
---

# VTC Lite

You run a small software team from a **work repo**: this repository holds the product's
requirements (`context/`), tickets (`tasks/`) and cost (`cost.md`); the product's code lives in
the repo at `target.path` in `vtc.config.json`. The product repo only ever receives
`vtc/<ticket>` branches and pull requests. Plain words in, pull requests out, no stops. Read only
the reference a step needs.

## A run

0. **Start the clock first**, before reading anything: run
   `echo vtc-run-$(date -u +%Y%m%dT%H%M%SZ); date -u +%Y-%m-%dT%H:%M:%SZ` and keep both lines:
   the first is this run's marker, the second its start time, both for the cost step.
1. **Read memory:** `vtc.config.json`, `context/index.md`, the open `Q-` files of the areas the
   request touches, and `tasks/index.md`.
2. **Capture what the human said** ([context.md](references/context.md#capture-what-the-human-said)):
   when the message carries context (a requirement, a change, a constraint, a priority, a
   decision, an answer, a fact about the product, its users, devices or environment, or a file it
   points at), save the words to `references/` and write what they mean into `context/`, then
   commit memory, before any planning or code. A bare command ("continue", "check again",
   "status") has nothing to capture.
3. **Size the request and pick roles** with the table in [roles.md](references/roles.md). A bug
   or small change gets no planning roles.
4. **Plan** only when a planning role is picked: run the roles in the table's order. They write
   `context/` ([context.md](references/context.md)) and the tickets.
5. **Write the ticket** yourself for a small change ([tickets.md](references/tickets.md)).
6. **Work each `todo` ticket** in `dependsOn` order: worktree, engineer, checks, one review, fix
   rounds, PR ([run.md](references/run.md), [git.md](references/git.md),
   [pr-evidence.md](references/pr-evidence.md)).
7. **Record what the run learned** ([context.md](references/context.md#record-what-a-run-learned)):
   facts found while working that the next run would otherwise find again (how the code behaves,
   a root cause, what this machine can and cannot run, which way of verifying worked).
8. **Record cost and the log** with `bin/cost.mjs` ([run.md](references/run.md)).
9. **Write the report** to `reports/` and in chat, then commit the work repo
   ([run.md](references/run.md)).

Never skipped, whatever the size: capturing the human's context, recording what the run learned,
the reviewer in a fresh context (a subagent on Claude Code), and the cost step. For a change of a few lines you may do the engineer's work yourself, following
`.claude/agents/engineer.md`; the review still runs.

Throughout: never ask the human; record guesses ([never-stop.md](references/never-stop.md)).
Never edit the product repo's own checkout; all code changes happen in `.state/<ticket-id>`.

## Roles

Each role's instructions are in `.claude/agents/<role>.md`.

- **Claude Code:** run a role as a subagent (`vtc-lite-<role>`) with the inputs its file lists,
  and the worktree path when it works on code.
- **Codex:** read `.claude/agents/<role>.md` and do that role's work yourself as a separate step,
  then return to this skill.

Every role ends its reply with a `## Result` block; read it, never the role's whole transcript.

## Other requests

- **Status:** read `tasks/index.md` and summarise by status, with `error` reasons.
- **Cost:** read `cost.md`; totals by day or request; per role from `logs/`.
- **What happened:** read `reports/`, newest first.
- **Answer Q-...:** the human's answer becomes `D-NNNN-n.md` ([never-stop.md](references/never-stop.md)).
