# AI collaboration files

These are copies of files from my private work repository, the place where the requirements, decisions, tickets and cost of this project are kept while the AI builds the product in this repository. They are here so a reviewer can open the files the README's [AI Collaboration Narrative](../../README.md#ai-collaboration-narrative) and the [System Design Document](../system-design.md) name, for example "D-0001-26" or "REQ-BOOK-009" (decisions D-0000-36 B and D-0001-63 B).

Copied (last refreshed on 2026-10-30, after my answers up to D-0001-148 and D-0000-45) by a script kept in the work repository, so the copies can be made again the same way. The work repository keeps changing; these copies do not follow it.

## What was changed in the copies

Nothing, except the five things below (decisions [D-0001-114](context/0001-booking/D-0001-114.md), [D-0000-40](context/decisions/D-0000-40.md), [D-0000-42](context/decisions/D-0000-42.md) and [D-0000-45](context/decisions/D-0000-45.md)):

- Every message I send is saved word for word in the work repository's `references/` folder. Those raw chat copies are **not** published. Where a copied file said "see references/…" (the file name of a raw chat copy), the copy says "(the human's original message is kept in the private work repo)" instead.
- One decision ([D-0000-6](context/decisions/D-0000-6.md)) named the folder on my computer where the code lives. The copy leaves the path out.
- The public project does not carry the company's name. The copy says "the company", "the assessment", "Unified Service Scheduler" or "a public dealer-software website" where the original named the company or its website, and the repository link uses the new name.
- The public project does not name the AI tool. The copy says "the AI assistant", and the tool's folder is `assistant/` here.
- The process files tell the AI to ask me when something needs confirming and not to decide alone. The originals said never to ask and to record a guess instead. In the copies, the "Never stop to ask" sections, the "guesses" lines of the result blocks and the file `never-stop.md` say this one rule instead, and the file is now [ask-the-human.md](assistant/skills/vtc-lite/references/ask-the-human.md).

Left as they are on purpose: the placeholder `.state/<id>` in the process files (it names no real folder, and the check allows only that placeholder), my messages quoted in Vietnamese in some decisions, and the GitHub organisation name.

The check `npm run check:public-docs` ([`scripts/check-public-docs.mjs`](../../scripts/check-public-docs.mjs)) runs in CI on every push. It fails if a file here, or the README, holds a secret-looking string, a local path, an email address that is not an obviously made-up one, or a link into the private `references/` folder. It also fails if a process file here says again that the AI should not ask me, or should record a guess instead.

Some links inside the copies point at files that were not copied, so they do not open here: the clickable design pages (`context/design/*.html`), the brief, the work repository's index pages, and the question files that were answered and removed.

## The files

| Where | What it is |
| --- | --- |
| [assistant/skills/vtc-lite/SKILL.md](assistant/skills/vtc-lite/SKILL.md) | **The process** (VTC Lite): how one request becomes requirements, tickets, a branch per ticket, checks, a fresh review and a pull request. |
| [assistant/skills/vtc-lite/references/](assistant/skills/vtc-lite/references/) | The process in detail: [context.md](assistant/skills/vtc-lite/references/context.md) (how my messages are saved and turned into requirements and decisions), [ask-the-human.md](assistant/skills/vtc-lite/references/ask-the-human.md) (questions and decisions), [roles.md](assistant/skills/vtc-lite/references/roles.md) (which roles a request needs), [run.md](assistant/skills/vtc-lite/references/run.md) (a run, step by step), [tickets.md](assistant/skills/vtc-lite/references/tickets.md), [git.md](assistant/skills/vtc-lite/references/git.md), [pr-evidence.md](assistant/skills/vtc-lite/references/pr-evidence.md). This folder is part of the process, not the raw chat copies. Decision [D-0000-17](context/decisions/D-0000-17.md) says the AI asks and does not decide alone; [D-0000-45](context/decisions/D-0000-45.md) says the copies carry only that rule. |
| [assistant/agents/](assistant/agents/) | **The roles**: the instructions each AI agent got. The ones this project names: [researcher](assistant/agents/researcher.md), [architect](assistant/agents/architect.md), [designer](assistant/agents/designer.md), [planner](assistant/agents/planner.md), [engineer](assistant/agents/engineer.md) (with its [frontend](assistant/agents/engineer-frontend.md), [backend](assistant/agents/engineer-backend.md), [data](assistant/agents/engineer-data.md) and [devops](assistant/agents/engineer-devops.md) profiles), [reviewer](assistant/agents/reviewer.md) and [security](assistant/agents/security.md). The other files ([ba](assistant/agents/ba.md), [cartographer](assistant/agents/cartographer.md), and the [mobile](assistant/agents/engineer-mobile.md) and [LLM](assistant/agents/engineer-ai-llm.md) engineer profiles) came with the process. |
| [context/ai-collaboration-log.md](context/ai-collaboration-log.md) | **The AI collaboration log**: what I asked, what came back, how I checked it, and whether I kept, changed or dropped it. |
| [cost.md](cost.md) | **The cost log**: tokens and price (at API prices) of every run. |
| [context/overview.md](context/overview.md) | The product in short, and the non-functional requirements NFR-1 to NFR-7. |
| [context/0001-booking/](context/0001-booking/) | **The requirements** `REQ-BOOK-001` to `REQ-BOOK-014`, each with acceptance criteria; and **the decisions** `D-0001-n`, each with the question, the options and my answer. Four question files are still here, because they were open when the copy was made ([Q-0001-267](context/0001-booking/Q-0001-267.md), [Q-0001-270](context/0001-booking/Q-0001-270.md), [Q-0001-271](context/0001-booking/Q-0001-271.md) and [Q-0001-272](context/0001-booking/Q-0001-272.md)); the others were answered and their files removed from the work repository. |
| [context/decisions/](context/decisions/) | Project-wide decisions `D-0000-n` (scope, stack, process, evidence, build order). |
| [context/design.md](context/design.md) | The design foundation: tokens, shared parts, words, the phone and desktop rules. |
| [context/design/](context/design/) | The design notes: the three [directions](context/design/directions.md) I chose from, and the [customer](context/design/customer.md), [staff](context/design/staff.md) and [manager](context/design/manager.md) flows. |

## How to read the ids

- `D-0000-n`, `D-0001-n`: a decision I made, with my reason. Most say "the recommended option": the AI wrote the options and a recommendation, and I chose.
- `Q-0001-n`: a question the AI asked me. Once answered, its file is removed, so ids like `Q-0001-256` appear only in the text of decisions. The decision that answers it ("resolves: Q-0001-n") holds the question and the options.
- `REQ-BOOK-n`: a requirement; `REQ-BOOK-n.AC-m` is one of its acceptance criteria.
- `NFR-n`: a non-functional requirement ([overview.md](context/overview.md)).
- `AD-n` (architecture), `SEC-n` (security) and `S1`… (the scorecard) live in files that were not copied; the [System Design Document](../system-design.md) explains each one it uses.
