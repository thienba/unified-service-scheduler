# Keyloop Service Scheduler

This is my submission for the Keyloop Technical Assessment, Scenario A: the Unified Service Scheduler, where a dealership's service department books a vehicle in only when a service bay and a qualified technician are both free for the whole job. It is a frontend with a mocked backend: the "server" is a mock API that runs in your browser, while the scheduling rules are real code behind a documented API contract, so a real backend can take the mock's place. Three kinds of user work with it: customers book and manage their own appointments, garage staff check the schedule and book for customers, and garage managers adjust appointments, opening hours and technician shifts.

The System Design Document is [`docs/system-design.md`](docs/system-design.md). The files behind the [AI Collaboration Narrative](#ai-collaboration-narrative) are in [`docs/ai-collaboration/`](docs/ai-collaboration/index.md).

The hosted demo link is in the README once hosting is done. Until then, run it on your own machine with the steps below.

## Build, run and test

You need **Node 22** (the repository pins 22.17.1 in `.nvmrc`; `package.json` asks for 22 or newer) and npm. Run these from the repository's folder, in this order:

```sh
npm ci                      # install exactly what package-lock.json says
npm run dev                 # start the app at http://localhost:5173 (stop it with Ctrl+C)
npm run build               # check the generated API code is current, build into dist/, check the built page
npm run lint                # ESLint, Prettier and a lint of the OpenAPI contract
npm run typecheck           # TypeScript, no output files
npm test                    # all unit, component and contract tests
npm run test:tz             # the tests that draw no screens, twice: in UTC and in Pacific/Kiritimati
npm run test:coverage       # all tests, with a coverage report in coverage/
npm run e2e                 # end-to-end tests in Chromium, against the built app
npm run check:deps          # every runtime library is on the approved list
npm run check:remote-build  # a build for a real backend holds no demo-only code
```

Notes:

- `npm run e2e` builds the app and serves it with `vite preview` on port 4173. The first time, install the browser with `npx playwright install chromium`. It records a video of every test in `test-results/`.
- `npm run e2e:other` runs the same tests in Firefox and WebKit (install them with `npx playwright install firefox webkit`). CI treats those two as a warning only; see [Known gaps](#known-gaps).
- `npm run check:public-docs` checks the copies in `docs/ai-collaboration/` and this README for secrets, local paths, real email addresses and links into the private chat folder. `npm run check:workflows` checks that the CI workflow uses pinned actions and read-only permissions.
- CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs all of these on every push and pull request, plus `npm audit`.

### Settings

| Variable            | Values             | Default | What it does                                                                                                                                                                                                                                                                                              |
| ------------------- | ------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_MODE`     | `mock` or `remote` | `mock`  | `mock` starts the mock API (a service worker) in the browser, with the demo users, the dev panel and the sample data. `remote` starts none of that, sends every call to a real backend, and leaves the mock, the sample data and the dev panel out of the build (`npm run check:remote-build` proves it). |
| `VITE_API_BASE_URL` | an address         | `/api`  | Where the API answers. In `remote` mode it must start with `https://` (or `http://localhost` for local work) and must not hold a user name or password; otherwise the app refuses to start.                                                                                                               |

Only `src/config/` reads these two variables.

### Reset the demo data

Your bookings are kept in your browser (IndexedDB), so they survive a reload. To go back to the starting data, either:

- open the **dev panel** (the "Dev panel" link at the bottom of every page, or `/dev`) and press **Reset demo data**, then confirm; or
- call `POST /api/_demo/reset`. It answers `204` and puts this browser's data back to the seed. For example, with `npm run dev` running, open http://localhost:5173 and type this in the browser's developer console:

  ```js
  await fetch("/api/_demo/reset", {
    method: "POST",
    headers: { "X-Demo-User": "user-manager-london" },
  }).then((r) => r.status);
  // 204
  ```

Both are for the demo only: a `remote` build has no dev panel and no `/_demo/` calls. Other browsers are not touched.

**Reload once after a new version.** The mock runs as a service worker, and a browser can keep the old one until the page is reloaded. After you pull or build a new version, reload the page once.

## Try the app

This is a demo, not real sign-in: there is no password. Pick who you are with **Viewing as** at the top of the page (on a phone, the button at the top opens the same choice). When a role has more than one user, a **Who** list picks between them. The choice is kept in your browser.

| User                | Role     | Dealership |
| ------------------- | -------- | ---------- |
| Demo Customer A     | customer | none       |
| Demo Customer B     | customer | none       |
| Demo Staff London   | staff    | London     |
| Demo Manager London | manager  | London     |
| Demo Staff Saigon   | staff    | Saigon     |
| Demo Manager Saigon | manager  | Saigon     |

Each staff member works at one dealership only, so staff see and book only at their own dealership ([D-0001-89](docs/ai-collaboration/context/0001-booking/D-0001-89.md)). The technicians have made-up but real-sounding names, such as Oliver Hughes in London and Minh Tran in Saigon ([D-0001-87](docs/ai-collaboration/context/0001-booking/D-0001-87.md)). All people, cars and contact details in the sample data are made up.

Five things to try, in this order:

1. **Book a time.** As Demo Customer A, pick a dealership, a car and a service, then a day and a time, choose wait, drop-off or a courtesy car, and confirm. If someone takes the time first, the page tells you early and offers the closest free times.
2. **See it on the staff schedule.** Switch to Demo Staff London (or Saigon, if you booked there). Your booking is on its technician's row on **Schedule**. Free gaps are shown; tap one to book for a customer.
3. **Cancel and reschedule.** Switch back to Demo Customer A and open **My appointments**. Open the booking, move it with **Reschedule** (the old time is kept until the new one is confirmed), or cancel it.
4. **The manager's adjust and flagged list.** Switch to Demo Manager London. Open a booking on Schedule and **Adjust** it (new time, technician or bay). Then shorten a day's opening hours under **Settings**, or change a technician's shift under **Shifts**: bookings that no longer fit are not deleted, they show up in **Flagged** for you to move.
5. **The outbox.** As the manager, open **Outbox**: the confirmation and reminder messages (48 hours before, and the morning of) that a real system would send by SMS or email. Nothing leaves the browser.

The manager can also book for a customer, from the **Book for a customer** button on Schedule ([D-0001-54](docs/ai-collaboration/context/0001-booking/D-0001-54.md)). Times are always shown in the dealership's own clock; when your browser is in another time zone, every customer screen says so ([D-0001-108](docs/ai-collaboration/context/0001-booking/D-0001-108.md)).

## Screens

Fifteen screens. `/` sends a customer to `book` and staff or a manager to `schedule`. A role that may not open a page sees `no-permission` in its place. Screenshots come from the evidence of the screen pull requests: phone at 390 px wide, desktop at 1440 px.

| Role               | Screen                | Route                                       | Screenshots                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------ | --------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| customer           | `book`                | `/book`                                     | [phone](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-29-time-zone-note-on-every-customer-screen/book-saigon-390.png?raw=true) · [desktop](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-29-time-zone-note-on-every-customer-screen/book-saigon-1440.png?raw=true)                                                                                         |
| customer           | `book-confirmed`      | `/book/confirmed/:appointmentId`            | [phone](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-29-time-zone-note-on-every-customer-screen/book-confirmed-saigon-390.png?raw=true) · [desktop](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-29-time-zone-note-on-every-customer-screen/book-confirmed-saigon-1440.png?raw=true)                                                                     |
| customer           | `my-appointments`     | `/appointments`                             | [phone](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-29-time-zone-note-on-every-customer-screen/my-appointments-saigon-390.png?raw=true) · [desktop](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-29-time-zone-note-on-every-customer-screen/my-appointments-saigon-1440.png?raw=true)                                                                   |
| customer and staff | `appointment`         | `/appointments/:appointmentId`              | [phone](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-29-time-zone-note-on-every-customer-screen/appointment-saigon-390.png?raw=true) · [desktop](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-29-time-zone-note-on-every-customer-screen/appointment-saigon-1440.png?raw=true)                                                                           |
| customer           | `reschedule`          | `/appointments/:appointmentId/reschedule`   | [phone](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-29-time-zone-note-on-every-customer-screen/reschedule-saigon-390.png?raw=true) · [desktop](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-29-time-zone-note-on-every-customer-screen/reschedule-saigon-1440.png?raw=true)                                                                             |
| staff and manager  | `schedule`            | `/schedule`                                 | [phone](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-29-merge-wave-2-screens-and-apply-their-answers/staff-header-one-dealership-390.png?raw=true) · [desktop](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-29-merge-wave-2-screens-and-apply-their-answers/staff-header-one-dealership-1440.png?raw=true)                                               |
| staff and manager  | `book-customer`       | `/book/for-customer`                        | [phone](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-29-time-zone-note-on-every-customer-screen/book-for-customer-saigon-390.png?raw=true) · [desktop](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-29-time-zone-note-on-every-customer-screen/book-for-customer-saigon-1440.png?raw=true)                                                               |
| manager            | `adjust`              | `/appointments/:appointmentId/adjust`       | [phone](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-29-time-zone-note-on-every-customer-screen/adjust-saigon-390.png?raw=true) · [desktop](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-29-time-zone-note-on-every-customer-screen/adjust-saigon-1440.png?raw=true)                                                                                     |
| manager            | `flagged`             | `/manage/flagged`                           | [phone](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-29-merge-wave-2-screens-and-apply-their-answers/flagged-list-390.png?raw=true) · [desktop](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-29-merge-wave-2-screens-and-apply-their-answers/flagged-list-1440.png?raw=true)                                                                             |
| manager            | `dealership-settings` | `/manage/dealership`                        | [phone](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-28-manager-dealership-settings-and-technician-shifts/dealership-settings-idle-390.png?raw=true) · [desktop](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-28-manager-dealership-settings-and-technician-shifts/dealership-settings-idle-1440.png?raw=true)                                           |
| manager            | `shifts`              | `/manage/shifts`                            | [desktop, WebKit](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-29-content-security-policy-messages-in-firefox-and-webkit/webkit-manager-shifts-after.png?raw=true) (the only shot with the current technician names; the older phone shot still shows the earlier names)                                                                                                                   |
| manager            | `outbox`              | `/manage/outbox`                            | [phone](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-28-manager-outbox-screen/outbox-list-390.png?raw=true) · [desktop](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-28-manager-outbox-screen/outbox-list-1440.png?raw=true)                                                                                                                             |
| every role (demo)  | `dev-panel`           | `/dev`                                      | [phone](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-28-dev-panel-logs-metrics-and-reset/dev-panel-logs-390.png?raw=true) · [desktop](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-28-dev-panel-logs-metrics-and-reset/dev-panel-logs-1440.png?raw=true)                                                                                                 |
| every role         | `no-permission`       | in place, on any page the role may not open | [phone](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-28-app-shell-role-switcher-dealership-picker-and-shared-components/no-permission-customer-schedule-390.png?raw=true) · [desktop](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-28-app-shell-role-switcher-dealership-picker-and-shared-components/no-permission-customer-schedule-1440.png?raw=true) |
| every role         | `not-found`           | any other address, and any 404 from the API | [phone](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-28-customer-appointments-list-cancel-and-reschedule/not-found-page-390.png?raw=true) · [desktop](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-28-customer-appointments-list-cancel-and-reschedule/not-found-page-1440.png?raw=true)                                                                 |

The `appointment` page is also open to the staff and manager of its dealership; `book` is also used by staff and managers once a customer is chosen. The [System Design Document](docs/system-design.md#screens-and-flows) has the flows of each role.

## Where the business logic is and what its tests cover

The scheduling rules are plain TypeScript with no React and no browser: `src/domain` (time, availability, appointments, policies, validation) and `src/application` (the booking and manager commands, and the queries). Their tests sit next to the code. To run only them:

```sh
npx vitest run src/domain src/application
```

In plain words, the tests check: two people confirming the same last time, where exactly one wins and the other is offered other times; times that are half-open (a job that ends at 10:00 does not clash with one that starts at 10:00); technician shifts, leave and the rest break after each job; opening hours and single-day changes; and clock changes (daylight saving) in the dealership's own time zone. Every test that draws no screens also runs twice with the machine set to two different time zones (`npm run test:tz`).

The numbers, from the [Results](docs/system-design.md#results) of the System Design Document (re-run on `main` at commit `a4f4c24` on 2026-10-29, with the command named):

| What                               | Result                                                                                 | Command                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Unit, component and contract tests | **1323 passed**, 0 failed, in 61 files                                                 | `npx vitest run --coverage`                            |
| Coverage of `src/domain`           | lines **99.78%** (449 of 450), branches **99.70%** (330 of 331)                        | the same, from `coverage/coverage-summary.json`        |
| Coverage of `src/application`      | lines **99.83%** (602 of 603), branches **97.73%** (431 of 441)                        | the same                                               |
| The same tests in two time zones   | **1112 passed** in 40 files under `TZ=UTC`, and the same under `TZ=Pacific/Kiritimati` | `npm run test:tz`                                      |
| End-to-end tests in Chromium       | **380 passed**, 0 failed, 4 skipped (the video recordings, which need `VIDEO_DIR`)     | `E2E_PORT=4391 npx playwright test --project=chromium` |
| Two-tab race, repeated 5 times     | **5 of 5**: one page booked, the other got the apology, one appointment stored         | see the Results table                                  |
| Accessibility                      | **0 axe-core violations** on every page each role can open, at 390 and 1440 px         | `tests/e2e/whole-app.spec.ts`                          |

This branch adds 21 tests for the public-docs check, so a run of `npm test` on it counts 1344.

## Is this secure?

The "server" runs inside your own browser, so the role and dealership checks show the rules and make them testable, but they protect nothing in the demo: anyone can change the role, edit the stored data or skip a check. The [security section of the System Design Document](docs/system-design.md#security-and-privacy) says what a real backend must do instead.

## Folder map

```
src/
  domain/          the scheduling rules: pure TypeScript, no browser, no framework, no clock
  application/     commands and queries (book, cancel, reschedule, adjust, hours, shifts); role checks; ports for storage
  infrastructure/  storage (in memory and IndexedDB), the sample data, logs and metrics
  api/             the OpenAPI contract, the mock API (a service worker) and the typed client
  ui/              the React screens; they reach the rest only through the API client
  config/          reads VITE_API_MODE and VITE_API_BASE_URL
  styles/          design tokens and fonts
docs/
  system-design.md   the System Design Document
  postgres/          the real backend's database schema, with its checks
  ai-collaboration/  copies of the process, roles, log, cost, requirements, decisions and design notes
```

**The import rule:** code may import only from the layers below it (`domain` imports nothing from the others; `ui` never imports `domain` or `infrastructure`), and ESLint fails the build if that is broken. The design behind it is in the [System Design Document](docs/system-design.md#layers-and-import-rules).

## Known gaps

- **One car can have two appointments at the same time.** Nothing checks the vehicle, only the bay, the technician and the courtesy car. It was left out for the deadline ([D-0001-27](docs/ai-collaboration/context/0001-booking/D-0001-27.md)).
- **No time is held** while you fill in the form. The page checks your chosen time again every 30 seconds and warns you early if it was taken; a short hold is a considered extension ([D-0001-107](docs/ai-collaboration/context/0001-booking/D-0001-107.md)).
- **Two browser messages are set aside** in the Content Security Policy tests: one WebKit message for native drop-down lists, and one Firefox error from the mock's service worker ([D-0001-109](docs/ai-collaboration/context/0001-booking/D-0001-109.md), [D-0001-110](docs/ai-collaboration/context/0001-booking/D-0001-110.md)). The Firefox one has a bug ticket still to do.
- **The full end-to-end run in Firefox and WebKit is not green.** It is a warning-only job with known failures, mostly focus and visibility checks in WebKit. Only the race and policy tests are claimed for those two browsers.
- **Thirteen early questions are still open** (Q-0001-1, 2, 7, 9, 10, 11, 12, 13, 18, 19, 20, 21 and 23, in [`docs/ai-collaboration/context/0001-booking/`](docs/ai-collaboration/context/0001-booking/)). The code uses the option written in each, the tests cover it, and whether to confirm them is asked in [Q-0001-256](docs/ai-collaboration/context/0001-booking/Q-0001-256.md). The System Design Document lists them under [Assumptions](docs/system-design.md#assumptions).
- **Some claims are still unverified**, such as where MSW runs its handlers and whether the WebKit message also appears in real Safari. The list, with what is settled, is in the System Design Document under [Claims marked unverified](docs/system-design.md#claims-marked-unverified).
- **No hosted demo yet.** Hosting is the last step ([D-0000-25](docs/ai-collaboration/context/decisions/D-0000-25.md)).

## AI Collaboration Narrative

I used AI agents for most of the typing and kept the decisions, the checking and the corrections for myself. Every file named here is a copy in [`docs/ai-collaboration/`](docs/ai-collaboration/index.md) or a merged pull request.

### How I guided the AI

- **A process, not a chat.** The work ran through a small process called VTC Lite ([the process](docs/ai-collaboration/claude/skills/vtc-lite/SKILL.md)). Every message I sent was saved word for word in the private work repository, then turned into requirements with acceptance criteria (for example [REQ-BOOK-009](docs/ai-collaboration/context/0001-booking/REQ-BOOK-009.md)) and decisions with reasons (for example [D-0001-6](docs/ai-collaboration/context/0001-booking/D-0001-6.md)), and committed ([how messages are captured](docs/ai-collaboration/claude/skills/vtc-lite/references/context.md)). Each piece of work was a ticket with acceptance criteria, built on its own branch and opened as a pull request.
- **Roles.** Different agents did different jobs, each with its own instructions: a [researcher](docs/ai-collaboration/claude/agents/researcher.md), an [architect](docs/ai-collaboration/claude/agents/architect.md), a [designer](docs/ai-collaboration/claude/agents/designer.md), a [planner](docs/ai-collaboration/claude/agents/planner.md), an [engineer](docs/ai-collaboration/claude/agents/engineer.md) (the only one that writes product code), a [reviewer](docs/ai-collaboration/claude/agents/reviewer.md) and a [security](docs/ai-collaboration/claude/agents/security.md) reviewer. The reviewer and the security reviewer start with no memory of the builder's work.
- **Ask, do not decide alone.** I told the AI that anything needing confirmation (a product rule, a new library, a design choice, a trade-off with no clear winner) must be asked, not decided ([D-0000-17](docs/ai-collaboration/context/decisions/D-0000-17.md)). An agent that reaches such a point writes a question file with the options and a recommendation, and waits for me. The product's 111 `D-0001` decisions each record my answer and its reason.
- **Build order.** The core first: the scheduling rules and their tests, then customer booking, the staff schedule, cancel and reschedule, the manager screens, and last courtesy cars and the reminder outbox ([D-0000-9](docs/ai-collaboration/context/decisions/D-0000-9.md)). Every screen was approved on a clickable prototype before it was coded ([D-0001-44](docs/ai-collaboration/context/0001-booking/D-0001-44.md)).

### How I checked and improved what it gave me

Each example says what I asked, what came back, how I checked it, and whether I kept, changed or dropped it. The first five are from my [AI collaboration log](docs/ai-collaboration/context/ai-collaboration-log.md); the last three come from the screen phase and are recorded in the decisions they name.

1. **Who uses the app (2026-10-28).** I described the problem: customers book, staff check the schedule, the manager adjusts it. The AI wrote the requirements but had assumed only a service advisor uses the app. I read them against the brief and told it that was wrong. **Changed** by me: three kinds of user ([D-0001-1](docs/ai-collaboration/context/0001-booking/D-0001-1.md)).
2. **One garage (2026-10-28).** I asked for technician shifts and opening hours. The AI had assumed one garage with fixed hours. **Changed** by me: several dealerships, hours each one sets, and a change for a single day ([D-0001-3](docs/ai-collaboration/context/0001-booking/D-0001-3.md), [D-0001-4](docs/ai-collaboration/context/0001-booking/D-0001-4.md)).
3. **New customers (2026-10-28).** I asked that staff can book for a customer. The AI first allowed existing customers only. **Changed** by me: new customers too ([D-0001-12](docs/ai-collaboration/context/0001-booking/D-0001-12.md)).
4. **Claims marked UNVERIFIED, then proven (2026-10-28).** In the architecture the AI marked two database claims it could not prove. I had them tested on a real PostgreSQL 17 database before relying on them: the database refuses an overlapping booking with error 23P01, and the uuid columns work with the overlap rule. 20 of 20 checks passed. **Kept**, now proven ([pull request #1](https://github.com/thienba/keyloop-service-scheduler/pull/1)).
5. **A security review that found what the builder missed (2026-10-28).** The API contract and mock were checked by a separate security agent after the builder and the code reviewer. It found a broken URL escape that crashed the mock with a 500 error, and an "https only" check for a real backend that `http://localhost:x@evil.example/` could trick. **Changed**: both fixed with tests before the pull request ([pull request #10](https://github.com/thienba/keyloop-service-scheduler/pull/10)).
6. **The manager books for a customer (2026-10-28, prototype review).** The approved design gave "Book for a customer" to staff only. I said the manager must be able to book too, for example when a customer phones in ([D-0001-53](docs/ai-collaboration/context/0001-booking/D-0001-53.md)). The AI then asked where the button goes, and I took its recommendation. **Changed** by me: a "Book for a customer" button on Schedule ([D-0001-54](docs/ai-collaboration/context/0001-booking/D-0001-54.md), built in [pull request #22](https://github.com/thienba/keyloop-service-scheduler/pull/22), checked by end-to-end scenario 5 in [pull request #27](https://github.com/thienba/keyloop-service-scheduler/pull/27)).
7. **A staff member at two dealerships (2026-10-29).** While building the staff booking screens ([pull request #22](https://github.com/thienba/keyloop-service-scheduler/pull/22)), the AI found that a staff user linked to two dealerships booked at the wrong one from a free gap. The AI offered three fixes, each keeping that user. I read them and chose none: each staff member works at one dealership only. **Changed** by me: the two-site user removed ([D-0001-89](docs/ai-collaboration/context/0001-booking/D-0001-89.md), [pull request #25](https://github.com/thienba/keyloop-service-scheduler/pull/25)).
8. **Holding a time (2026-10-29).** I asked whether a time can be held while the customer fills in the form. The AI wrote three options with their costs: no hold, a 5-minute hold, or no hold with an early warning. I weighed the costs and took the early warning. **Kept** the recommendation; the hold is written down as a considered extension ([D-0001-107](docs/ai-collaboration/context/0001-booking/D-0001-107.md), [pull request #29](https://github.com/thienba/keyloop-service-scheduler/pull/29)).

### How I made sure the final quality was good

- **Tests written from the acceptance criteria.** Each ticket lists acceptance criteria, and the engineer writes a test for each one and first checks it fails for the reason the ticket names ([engineer instructions](docs/ai-collaboration/claude/agents/engineer.md)). The end-to-end demo scenarios follow the requirements one by one ([pull request #27](https://github.com/thienba/keyloop-service-scheduler/pull/27)). The numbers are in [Where the business logic is](#where-the-business-logic-is-and-what-its-tests-cover).
- **A reviewer in a fresh context for every ticket.** It checks the diff against the criteria with no memory of the build ([reviewer instructions](docs/ai-collaboration/claude/agents/reviewer.md)). It found a real bug the builder had only worked around: the browser database closed a read early after a few lookups; a new test now fails without the fix ([pull request #7](https://github.com/thienba/keyloop-service-scheduler/pull/7)). In [pull request #22](https://github.com/thienba/keyloop-service-scheduler/pull/22) the first review asked for changes, a fix round added a test for each finding, and a second fresh review passed.
- **Evidence in every pull request** ([D-0000-13](docs/ai-collaboration/context/decisions/D-0000-13.md)): screenshots of every state at phone and desktop width, test and coverage screenshots, and videos. For example the screens in [pull request #16](https://github.com/thienba/keyloop-service-scheduler/pull/16), and the two-tab race video in [pull request #27](https://github.com/thienba/keyloop-service-scheduler/pull/27).
- **Claims marked `UNVERIFIED` until a test settles them.** The research and the architecture marked every claim they could not check. Example 4 shows two that a test settled; the rest are listed in the System Design Document under [Claims marked unverified](docs/system-design.md#claims-marked-unverified).
- **The cost log.** Every run's tokens and price are written down ([cost.md](docs/ai-collaboration/cost.md)). On 2026-10-29, after its last row, the total was **566,550,105 tokens, about 213.46 USD** at API prices, over 8 runs. The research run alone was 2,598,619 tokens, about 1.42 USD.
