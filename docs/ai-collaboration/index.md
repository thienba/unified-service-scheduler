# AI collaboration files

These are copies of files from my private work repository, the place where the requirements, decisions, tickets and cost of this project are kept while the AI builds the product in this repository. They are here so a reviewer can open the files the README's [AI Collaboration Narrative](../../README.md#ai-collaboration-narrative) and the [System Design Document](../system-design.md) name, for example "D-0001-26" or "REQ-BOOK-009" (decisions D-0000-36 B and D-0001-63 B).

Copied on 2026-10-29. The work repository keeps changing; these copies do not follow it.

## What was changed in the copies

Nothing, except two things:

- Every message I send is saved word for word in the work repository's `references/` folder. Those raw chat copies are **not** published. Where a copied file said "see references/…" (the file name of a raw chat copy), the copy says "(the human's original message is kept in the private work repo)" instead.
- One decision ([D-0000-6](context/decisions/D-0000-6.md)) named the folder on my computer where the code lives. The copy leaves the path out.

The check `npm run check:public-docs` ([`scripts/check-public-docs.mjs`](../../scripts/check-public-docs.mjs)) runs in CI on every push. It fails if a file here, or the README, holds a secret-looking string, a local path, an email address that is not an obviously made-up one, or a link into the private `references/` folder.

Some links inside the copies point at files that were not copied, so they do not open here: the clickable design pages (`context/design/*.html`), the brief, the work repository's index pages, and one question that was later answered and removed.

## The files

| Where | What it is |
| --- | --- |
| [claude/skills/vtc-lite/SKILL.md](claude/skills/vtc-lite/SKILL.md) | **The process** (VTC Lite): how one request becomes requirements, tickets, a branch per ticket, checks, a fresh review and a pull request. |
| [claude/skills/vtc-lite/references/](claude/skills/vtc-lite/references/) | The process in detail: [context.md](claude/skills/vtc-lite/references/context.md) (how my messages are saved and turned into requirements and decisions), [never-stop.md](claude/skills/vtc-lite/references/never-stop.md) (questions and decisions), [roles.md](claude/skills/vtc-lite/references/roles.md) (which roles a request needs), [run.md](claude/skills/vtc-lite/references/run.md) (a run, step by step), [tickets.md](claude/skills/vtc-lite/references/tickets.md), [git.md](claude/skills/vtc-lite/references/git.md), [pr-evidence.md](claude/skills/vtc-lite/references/pr-evidence.md). This folder is part of the process, not the raw chat copies. In this project, decision [D-0000-17](context/decisions/D-0000-17.md) replaces the process's default "never ask, take a guess" with "ask, do not decide alone". |
| [claude/agents/](claude/agents/) | **The roles**: the instructions each AI agent got. The ones this project names: [researcher](claude/agents/researcher.md), [architect](claude/agents/architect.md), [designer](claude/agents/designer.md), [planner](claude/agents/planner.md), [engineer](claude/agents/engineer.md) (with its [frontend](claude/agents/engineer-frontend.md), [backend](claude/agents/engineer-backend.md), [data](claude/agents/engineer-data.md) and [devops](claude/agents/engineer-devops.md) profiles), [reviewer](claude/agents/reviewer.md) and [security](claude/agents/security.md). The other files ([ba](claude/agents/ba.md), [cartographer](claude/agents/cartographer.md), and the [mobile](claude/agents/engineer-mobile.md) and [LLM](claude/agents/engineer-ai-llm.md) engineer profiles) came with the process. |
| [context/ai-collaboration-log.md](context/ai-collaboration-log.md) | **The AI collaboration log**: what I asked, what came back, how I checked it, and whether I kept, changed or dropped it. |
| [cost.md](cost.md) | **The cost log**: tokens and price (at API prices) of every run. |
| [context/overview.md](context/overview.md) | The product in short, and the non-functional requirements NFR-1 to NFR-7. |
| [context/0001-booking/](context/0001-booking/) | **The requirements** `REQ-BOOK-001` to `REQ-BOOK-014`, each with acceptance criteria; **the decisions** `D-0001-n`, each with the question, the options and my answer; and **the questions** `Q-0001-n` that are still open. |
| [context/decisions/](context/decisions/) | Project-wide decisions `D-0000-n` (scope, stack, process, evidence, build order). |
| [context/design.md](context/design.md) | The design foundation: tokens, shared parts, words, the phone and desktop rules. |
| [context/design/](context/design/) | The design notes: the three [directions](context/design/directions.md) I chose from, and the [customer](context/design/customer.md), [staff](context/design/staff.md) and [manager](context/design/manager.md) flows. |

## How to read the ids

- `D-0000-n`, `D-0001-n`: a decision I made, with my reason. Most say "the recommended option": the AI wrote the options and a recommendation, and I chose.
- `Q-0001-n`: a question that is still open. It lists the options and a recommendation, and says which option the code uses until I answer.
- `REQ-BOOK-n`: a requirement; `REQ-BOOK-n.AC-m` is one of its acceptance criteria.
- `NFR-n`: a non-functional requirement ([overview.md](context/overview.md)).
- `AD-n` (architecture), `SEC-n` (security) and `S1`… (the scorecard) live in files that were not copied; the [System Design Document](../system-design.md) explains each one it uses.
