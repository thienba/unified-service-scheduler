Sources: Software Factory kit, assistant/skills/factory/references/tasks.md, tasks-intake.md; rewritten for VTC Lite.

# Tickets

A ticket is the folder `tasks/<id>/`. Its id is the folder name, `<creation date>-<slug of the
title>` (`-2`, `-3` on a same-day collision), and it is never renamed. The folder holds
`README.md` and resources: screenshots under `shots/`, the PR body `PR.md`. No secrets, ever.

## README.md

```markdown
---
title: "News listing: pagination lands on row 1"
type: bug            # bug | feature | chore
status: todo         # todo | doing | done | error
reason: null         # "<cause>: <text>" when status is error
priority: p2         # p0 | p1 | p2 | p3
requirement: 0007-news   # context/ folder, or null
dependsOn: []
branch: vtc/2026-10-21-news-listing-pagination-lands-on-row-1
pr: null             # URL once opened
rounds: 0
cost: { tokens: 0, usd: 0 }
created: 2026-10-21T08:38:42Z
updated: 2026-10-21T08:49:25Z
---
## Description

<what is wrong or missing and why it matters, in the human's words where possible>

## Acceptance criteria

- [ ] <observable outcome with concrete values> (REQ-NEWS-036)

## Questions

<Q- files this ticket raised and asked, or none>

## Evidence

<filled at the end: checks, proof per criterion, PR link>
```

Rules:

- **Status moves one way:** `todo → doing → done`, or `→ error` from `todo` or `doing`. `done`
  is final; a defect found later gets a new ticket.
- **`error` reasons** start with a cause: `rounds-exhausted:`, `blocked-by: <id>`,
  `cannot-build:`, `checks-unavailable:`.
- **Re-queue:** when the human asks to retry an `error` ticket, set it back to `todo` with
  `reason: null` and say so in the commit message. Its kept branch is reused ([git.md](git.md)).
- **Criteria are observable:** exact inputs, exact results, every message text, limit and
  boundary. "Fast", "nice" or "works" is not a criterion.
- **Writing a ticket from a small request:** title in the human's words; description restating
  the problem and the expected behaviour; one criterion per expected behaviour, including the
  failure and edge cases the request implies; `requirement` set when `context/` has the
  area, else `null`.

## The board: tasks/index.md

Rewrite it after every ticket change, from the ticket folders:

```markdown
# Tasks

## Todo (n)
- [<title>](<id>/README.md) · `<id>` · p1 · bug

## Doing (n)
## Error (n)
- [<title>](<id>/README.md) · `<id>` · <reason>

## Done (n)
- [<title>](<id>/README.md) · `<id>` · [PR](<url>)
```

Order inside a section: priority, then creation date.
