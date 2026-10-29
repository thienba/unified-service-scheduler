# Keyloop Service Scheduler

> **Draft.** The screens are still being built; today the app runs its API and tests. Built so far: the scheduling rules, storage, the booking and manager commands, the API contract, the mock API and the typed client. Not built yet: the screens, the reminder outbox (open pull request #9), logs and metrics, and hosting. This README will get a final pass when the screens exist.

This is my submission for the Keyloop Technical Assessment, Scenario A: the Unified Service Scheduler, an appointment scheduler for dealership service departments. It is a frontend with a mocked backend: the "server" is a mock API that runs in the browser, but the scheduling rules are real code behind a documented API contract, so a real backend can replace the mock. Three kinds of user work with it: customers book and manage their own appointments, staff book for customers and check the schedule, and managers adjust opening hours and technician shifts.

The System Design Document is at [`docs/system-design.md`](docs/system-design.md). It is still in review ([pull request #2](https://github.com/thienba/keyloop-service-scheduler/pull/2)), so the file is not on `main` yet.

## Build, run and test

You need Node 22 (the repository pins 22.17.1 in `.nvmrc`; `package.json` asks for 22 or newer) and npm.

```sh
npm ci                  # install exactly what package-lock.json says
npm run dev             # start the dev server at http://localhost:5173
npm run build           # check the generated API code is current, build, check the built page
npm run lint            # ESLint, Prettier and a lint of the OpenAPI contract
npm run typecheck       # TypeScript, no output files
npm test                # all unit, contract and component tests
npm run test:tz         # every test that doesn't draw screens, twice, in UTC and in Pacific/Kiritimati
npm run test:coverage   # all tests, with a coverage report in coverage/
npm run e2e             # end-to-end tests in Chromium
```

Notes:

- `npm run e2e` builds the app and serves it with `vite preview` on port 4173. The first time, install the browser with `npx playwright install chromium`. It records a video of every run in `test-results/`.
- `npm run dev` shows only a heading today, because the screens are not built. The mock API is already running behind it.
- `npm run e2e:other` runs the same tests in Firefox and WebKit. CI treats those two as warnings only.
- CI (`.github/workflows/ci.yml`) runs these same commands on every push and pull request, plus a dependency approval check, a workflow check and `npm audit`.

### Settings

| Variable | Values | Default | What it does |
|---|---|---|---|
| `VITE_API_MODE` | `mock` or `remote` | `mock` | `mock` starts the mock API (a service worker) in the browser. `remote` does not start it and sends calls to a real backend. |
| `VITE_API_BASE_URL` | an address | `/api` | Where the API answers. In `remote` mode it must start with `https://` (or `http://localhost` for local work) and must not contain a user name or password; otherwise the app refuses to start. |

Only `src/config/` reads these variables. A newer version of the sample data also resets the stored data when the app loads.

- **Reload once after a new version.** The mock runs as a service worker, and a browser can keep the old one until the page is reloaded. After a new version is deployed or built, reload once.
- **Resetting the demo data.** The design calls for `POST /api/_demo/reset`, which returns the browser database to the starting data. That endpoint is **not built yet**. Until it is, clear the site's data in your browser's developer tools (Application, then Storage, then "Clear site data") and reload.

### Where the business logic is and what its tests cover

The scheduling rules are plain TypeScript in `src/domain` (time, availability, appointments, policies, validation) and `src/application` (the booking and manager commands, and the queries). Their tests sit next to the code. To run only them:

```sh
npx vitest run src/domain src/application
```

In plain words, the tests check: two people confirming the same last slot, where one wins and the other is offered other times; times that are half-open (a job that ends at 10:00 does not clash with one that starts at 10:00); technician shifts and rest breaks; opening hours and single-day changes; and clock changes (daylight saving) in the branch's own time zone. Every test that doesn't draw screens also runs twice, with the machine set to two different time zones (`npm run test:tz`).

### Is this secure?

No, and the demo does not pretend to be. The "server" runs inside your own browser, so anyone can change the role, edit the stored data or skip a check. The role and dealership checks show the rules and make them testable; they protect nothing in the demo. The security section of the [System Design Document](docs/system-design.md) (in review in PR #2) (section 1 of the security notes) explains what a real backend must do instead.

### Folder map

```
src/
  domain/          the scheduling rules: pure TypeScript, no browser, no framework
  application/     commands and queries (book, cancel, reschedule, adjust); ports for storage
  infrastructure/  storage (in memory and IndexedDB), seed data; telemetry (logs and metrics) is not built yet
  api/             the OpenAPI contract, the mock API and the typed client
  ui/              the React screens (not built yet)
  config/          reads VITE_API_MODE and VITE_API_BASE_URL
  styles/          design tokens and fonts
```

The import rule: code may import only from layers below it (`domain` imports nothing from the others), and ESLint fails the build if that is broken. The design behind it is in the [System Design Document](docs/system-design.md) (in review in PR #2).

### Demo users

This is a demo, not real sign-in. The mock API reads the `X-Demo-User` header and looks up the user in the seed data. The role is never taken from the request.

| `X-Demo-User` | Name | Role | Dealership |
|---|---|---|---|
| `user-customer-a` | Demo Customer A | customer | none |
| `user-customer-b` | Demo Customer B | customer | none |
| `user-staff-london` | Demo Staff London | staff | London |
| `user-manager-london` | Demo Manager London | manager | London |
| `user-staff-saigon` | Demo Staff Saigon | staff | Saigon |
| `user-manager-saigon` | Demo Manager Saigon | manager | Saigon |
| `user-staff-both` | Demo Staff Both Sites | staff | London and Saigon |

All people and dealerships in the seed data are made up.

## AI Collaboration Narrative

I used AI agents for most of the typing and kept the decisions, the checking and the corrections for myself. This section says how. Where it names a number, the number comes from my AI collaboration log, a pull request or a command I ran. Some supporting files (requirements, decisions, the log, the cost log) live in a separate private work repository; see "What is not linked" below.

### How I guided the AI

- **A process, not a chat.** The work ran through a small process I call VTC Lite: requirements kept as plain files, one ticket per pull request, and a separate reviewer for each ticket. Every message I send is saved word for word. The AI turns it into requirements with acceptance criteria and into decisions with reasons, and these are committed. Each piece of work is a ticket with acceptance criteria, built on its own branch and opened as a pull request.
- **Roles.** Different agents did different jobs: a researcher (how big scheduling systems work, with sources), an architect, a designer, a planner, an engineer (the only one who writes product code) and a reviewer, plus a security reviewer. The reviewer and the security reviewer start with no memory of the builder's work.
- **Ask, do not decide alone.** I told the AI that anything needing confirmation (a product rule, a new library, a trade-off with no clear winner) must be asked, not decided. When an agent reaches such a point it writes a question file with the options and a recommendation, and waits for me. For example, the engineer who built the API contract left a question for me about how lint should treat generated files rather than changing the lint settings.

### How I checked and improved what it gave me

Each example says what I asked, what came back, how I checked it, and whether I kept, changed or dropped it. All are dated 2026-10-28, from my log.

1. **Who uses the app.** I described the problem: customers book, staff check the schedule, the manager adjusts it, and the app suggests another time on a clash. The AI wrote the requirements but had assumed only a service advisor uses the app. I read them against the brief and told it that was wrong. Changed: three kinds of user.
2. **One garage.** I asked for technician shifts and opening hours. The AI had assumed one garage with fixed hours. I told it that was wrong. Changed: several branches, hours each branch can set, and a change for a single day.
3. **Reminder times.** I asked for reminders and booking rules. The AI first suggested reminders 24 hours and 2 hours before. I checked Keyloop's own advice, and the AI changed them to 48 hours before and the morning of. Changed. The rest breaks for technicians were my idea, for staff wellbeing.
4. **New customers.** I asked that staff can book for a customer. The AI first allowed existing customers only. I asked for new customers too. Changed.
5. **Research with receipts.** I asked the AI to study big scheduling systems. Every claim had to link to a page it read, and anything it could not check was marked `UNVERIFIED:`. I looked at the sources; the AI had already dropped one page because it did not say what the search result claimed. Kept; the five must-have gaps went into the requirements.
6. **Claims marked UNVERIFIED, then proven.** In the architecture the AI marked two database claims it could not prove. I had them tested on a real PostgreSQL 17 database before relying on them: the database refuses an overlapping booking, and uuid columns work with the overlap rule. 20 of 20 checks passed. Kept; the two claims are now proven. The schema work is in [pull request #1](https://github.com/thienba/keyloop-service-scheduler/pull/1).
7. **A bug the builder worked around.** The bug came from the storage work ([pull request #6](https://github.com/thienba/keyloop-service-scheduler/pull/6)) and was caught while reviewing the book, cancel and reschedule commands ([pull request #7](https://github.com/thienba/keyloop-service-scheduler/pull/7)); the log records 376 passing tests, including two people confirming the last slot at once on both stores. A reviewer agent with no knowledge of the builder's work found a real bug the builder had only worked around: the browser database closed a read early after a few lookups. The reviewer reproduced it, and a new test now fails without the fix. The builder had also made five small choices alone, so I turned them into a question and answered it. Changed: bug fixed before merge.
8. **Security review of the API.** The API contract and mock ([pull request #10](https://github.com/thienba/keyloop-service-scheduler/pull/10)) were checked by a separate security agent after the builder and the code reviewer were done. It found two holes they had missed: a broken URL escape crashed the mock with a 500 error even for a stranger who was not signed in, and the "https only" check for a real backend could be tricked with `http://localhost:x@evil.example/`. Both were fixed, with tests, before the pull request. Changed.

### How I made sure the final quality was good

- **Tests from the acceptance criteria.** Each ticket lists acceptance criteria. The engineer writes a test for each one and first checks that it fails for the reason the ticket describes. The tests run in CI on every push (`.github/workflows/ci.yml`).
- **A fresh reviewer for every ticket.** A reviewer with no memory of the build checks the diff against the criteria. Example 7 shows what that caught.
- **Security check.** An agent whose only job is to attack the change. Example 8 shows what that caught.
- **CI.** Lint, types, tests in two time zones, coverage, a build, a check that a real-backend build contains no demo mock code, and end-to-end tests in a real browser.
- **Claims marked `UNVERIFIED` until a test settles them.** Example 6.
- **Evidence in every pull request.** Each pull request carries screenshots and test and coverage output, and a video where there is something to watch (screen videos come with the screens). Look at pull requests [#7](https://github.com/thienba/keyloop-service-scheduler/pull/7) and [#10](https://github.com/thienba/keyloop-service-scheduler/pull/10).
- **Cost log.** Each run's tokens and price are written down. The research run, for example, used 2,598,619 tokens, about 1.42 USD at API prices.

### What is not linked

The requirements, decisions, the full AI collaboration log and the cost log are in a private work repository, so I do not link to them here. Pull requests are linked instead. I have asked whether to publish copies in `docs/`. This section is a draft until that is settled and the screens exist.
