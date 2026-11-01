# AI collaboration files

These are copies of files from my private work repository, the place where the requirements, decisions, tickets and cost of this project are kept while the AI builds the product in this repository. They are here so a reviewer can open the files the README's [AI Collaboration Narrative](../../README.md#ai-collaboration-narrative) talks about.

## What is left out or changed

- My own process and the agents' instructions stay private. The README's narrative says in plain words how they worked.
- Every message I send is saved word for word in the work repository. Those raw chat copies are not published. Where a copied file pointed at one, the copy says "(the human's original message is kept in the private work repo)".
- One decision named the folder on my computer where the code lives. The copy leaves the path out.
- The public project does not carry the company's name or the AI tool's name. The copies use neutral wording instead.

Some links inside the copies point at files that were not copied, so they do not open here.

## The files

| Where | What it is |
| --- | --- |
| [context/ai-collaboration-log.md](context/ai-collaboration-log.md) | **The AI collaboration log**: what I asked, what came back, how I checked it, and whether I kept, changed or dropped it. |
| [context/overview.md](context/overview.md) | What gets built, and what is out of scope. |
| [context/0001-booking/](context/0001-booking/) | The booking requirements, and the decisions and questions behind them. |
| [context/decisions/](context/decisions/) | Decisions that apply to the whole project. |
| [context/design.md](context/design.md) and [context/design/](context/design/) | The design: screens, states and flows. |
| [cost.md](cost.md) | **The cost log**: the tokens and price of each run. |

The check `npm run check:public-docs` ([`scripts/check-public-docs.mjs`](../../scripts/check-public-docs.mjs)) runs in CI on every push, and fails if a file here or the README holds a secret-looking string or a local path.

## How to read the ids

- `D-0000-n`, `D-0001-n`: a decision I made, with my reason. Most say "the recommended option": the AI wrote the options and a recommendation, and I chose.
- `Q-0001-n`: a question the AI asked me. Once answered, its file is removed, so most of these ids appear only in the text of decisions.
- `REQ-BOOK-n`: a requirement; `REQ-BOOK-n.AC-m` is one of its acceptance criteria.
- `NFR-n`: a non-functional requirement ([overview.md](context/overview.md)).
- `AD-n` (architecture) and `SEC-n` (security) live in files that were not copied; the [System Design Document](../system-design.md) explains each one it uses.
