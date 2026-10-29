Sources: Software Factory kit, .claude/skills/factory/references/context.md, context-concepts.md; rewritten for VTC Lite.

# Context: the project's memory

`context/` holds what the team knows, one fact per file where it matters, so a run reads only
what a request touches and never asks again what a file answers.

## Layout

| Path | Holds | Written by |
|---|---|---|
| `index.md` | one line per product-level file and per area, with a one-line summary | whoever adds a file |
| `overview.md` | product overview, non-functional requirements, out of scope | BA |
| `repo-map.md` | the existing code as it is | cartographer |
| `conventions.md` | stack and code conventions of the product | first run, cartographer |
| `environment.md` | how the product is built, run and verified on this machine: devices, simulators, accounts, tools present or missing, the way of verifying that worked | first run, any run that learns it |
| `research.md` | research brief | researcher |
| `architecture.md` | decisions AD-n | architect |
| `security.md` | threat model and SEC-n | security |
| `design.md`, `design/` | screens, flows, tokens, components, prototypes | designer |
| `<NNNN-area>/` | one folder per functional area (`0001-checkout`) | BA |
| `<NNNN-area>/index.md` | the area's business need, then every requirement, decision and open question with its body | whoever changes the area |
| `<NNNN-area>/REQ-<AREA>-NNN.md` | one requirement | BA, or the lead from what the human said |
| `<NNNN-area>/existing-behavior.md` | what the code does today in the flows a run touched, observable, with `path:line` | any run that learns it |
| `<NNNN-area>/Q-NNNN-n.md` | an open question with the option taken | any role |
| `<NNNN-area>/D-NNNN-n.md` | a decision | any role, from an answer or a meaning change |
| `questions/`, `decisions/` | product-wide `Q-0000-n.md` and `D-0000-n.md` | any role |

## Requirement file

```markdown
---
type: requirement
title: News archive pagination lands on the grid
priority: P2
---
When a user opens page N of a news archive, the system shall scroll to the first row of the
news grid.

- REQ-NEWS-036.AC-1: Given the EN archive, When the user clicks page 2, Then row 1 of the grid is
  at the top of the viewport below the sticky header.
```

## Decision file

```markdown
---
type: decision
resolves: Q-0007-3   # or none
created: 2026-10-21
---
<what was decided, and why>
```

## Rules

- Ids never change and are never reused; continue the numbering of the folder.
- The area `index.md` is the entry point: read it instead of opening every file.
- Update the matching `index.md` in the same commit as any file you add, change or delete.
- Never record a secret or personal data in `context/`.
- Changing an existing requirement's meaning needs a `D-` file saying what changed and why.

## Capture what the human said

Every message that carries context is written down before the work starts, so no later run asks
for it again. Runs on every request, with or without planning roles.

1. **Keep the words.** Save the message verbatim, with any pasted text, to
   `references/<yyyy-mm-dd>-<slug>.md` (`-2`, `-3` on a collision). A file the human points at
   stays where it is; name it in the step below. Files in `references/` are never edited.
2. **Write what it means into `context/`.** Find the area it touches in `context/index.md`, or
   start the next `NNNN-<slug>/` folder.
   - A requirement or a change of behavior: a `REQ-` file with acceptance criteria, in the human's
     words where they gave them. A changed meaning also gets a `D-` file.
   - A decision, a priority or a constraint ("only iOS Safari", "no new dependency"): a `D-` file
     in the area it settles (`decisions/` when product-wide), with the reason when given.
   - An answer to a `Q-` file: [never-stop.md](never-stop.md#when-the-human-answers).
   - A fact about the product, its users, devices or environment: the matching file
     (`overview.md`, `environment.md`, the area's `index.md`).
   Write only what the human said or what follows from it with no other reading; anything you have
   to guess is a `Q-` file ([never-stop.md](never-stop.md)), never a fact.
3. **Index and commit.** Update every `index.md` you touched and commit memory as
   `context: <slug>`, together with the `references/` file.

Skip only when the message adds nothing `context/` does not already say.

## Record what a run learned

Before the cost step, write down the facts this run found that are still true after it ends and
that the next run would otherwise spend tokens finding again:

- how the code behaves in a flow it read (the area's `existing-behavior.md`);
- a root cause, or an approach tried and why it failed (the area's `index.md`, under `## Findings`);
- what this machine can and cannot run, and the way of verifying that worked
  (`environment.md`); a ticket set to `error` because a check cannot run here always adds a line;
- a convention the code follows that `conventions.md` lacks.

One line per fact, with the ticket id and the date; replace a line a newer fact makes wrong instead
of adding a second one. Nothing about this run alone (its tokens, its rounds): that is the report.
Nothing new: write nothing. Update the `index.md` files and commit with the run's memory commit.
