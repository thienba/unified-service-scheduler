Final pass, 2026-10-29. Written against commit `a4f4c24` on `main`, after all 30 pull requests were merged. This document is final for the submission (brief, deliverable 1).

# System Design Document: Keyloop Service Scheduler

This is deliverable 1 of the Keyloop Technical Assessment, Scenario A (the Unified Service Scheduler). It describes what is built, why, and what a real backend would look like.

The hosted demo link is in the README once hosting is done.

Contents:

- [Overview and scope](#overview-and-scope)
- [Architecture (diagram)](#architecture-diagram)
- [Components and their roles](#components-and-their-roles)
- [Data flow](#data-flow)
- [Screens and flows](#screens-and-flows)
- [Technology choices](#technology-choices)
- [Observability](#observability)
- [Scalability and reliability](#scalability-and-reliability)
- [Real backend design (PostgreSQL)](#real-backend-design-postgresql)
- [Time zones](#time-zones)
- [Security and privacy](#security-and-privacy)
- [Results](#results)
- [Pull requests](#pull-requests)
- [How GenAI was used in design](#how-genai-was-used-in-design)
- [Assumptions](#assumptions)
- [Out of scope](#out-of-scope)

How to read the ids. `D-0000-n` and `D-0001-n` are decisions the human made. `Q-` files are open questions where we took a reasonable option and wrote it down. `AD-n` are architecture decisions. `REQ-BOOK-n` are requirements. `SEC-n` are security requirements. `NFR-n` are non-functional requirements. These files live in the work repo (`context/`), not in this repo. The README pass copies them into `docs/ai-collaboration/` so a reviewer can follow an id (D-0001-63 B).

Words used below, in plain terms:

- **Actor**: who is making the call (their role, customer id and list of dealerships), built by the mock from the chosen demo user.
- **Ring buffer**: a fixed-size list in memory that drops the oldest line when full.
- **Idempotency key**: a random id sent with a booking, so that sending the same booking twice gives one appointment.
- **GiST**: the kind of PostgreSQL index that can compare time ranges for overlap.
- **SQLSTATE**: the five-character error code PostgreSQL gives with an error. `23P01` means an exclusion constraint was broken.
- **p95**: the time that 95 out of 100 requests beat.

## Overview and scope

**The problem.** A dealership service department books by hand. The scheduler replaces that. A customer asks for a service for a vehicle, at a dealership, at a time. The system confirms it only when a **service bay** and a **qualified technician** are both free for the **whole job**. If they are not, it suggests other times. A confirmed **appointment** links the customer, the vehicle, the technician and the bay, and it is kept.

**Who uses it.** Three kinds of user (D-0001-1): the customer books and changes their own bookings, and sees their past ones (D-0001-94); garage staff check the schedule and book for customers (D-0001-12); the garage manager adjusts appointments, opening hours, technician shifts and booking rules, and can also book for a customer from the "Book for a customer" button on Schedule (D-0001-53, D-0001-54 B). Each staff member works at one dealership only; there is no staff user for two sites (D-0001-89). The sample technicians have real-sounding, made-up names such as Oliver Hughes and Minh Tran (D-0001-87).

**What is built.** The brief lets us build one layer and mock the other. We build the **frontend fully** and mock the backend (D-0000-2). The scheduling rules are still real. They live in a plain TypeScript module with no React, behind an OpenAPI contract, so a real backend can replace the mock with no screen changes (D-0000-3, NFR-2).

**The core, from the brief.** These three come first and are tested first (D-0000-9):

1. A user requests an appointment for a vehicle, a service type and a dealership at a time (REQ-BOOK-001).
2. Before confirming, the system checks that a bay and a qualified technician are free for the whole duration (REQ-BOOK-002).
3. On success, it stores a persistent appointment record (REQ-BOOK-003).

**Beyond the core.** Several dealerships with their own hours and time zones (D-0001-3, D-0001-4, D-0001-10); technician shifts the manager edits (D-0001-5); rest breaks, a lead time and a booking horizon (D-0001-8); wait, drop-off or courtesy car (D-0001-7); customers cancel and reschedule themselves, with reminders in a mocked outbox (D-0001-9); a staff timeline with free gaps (D-0001-11, D-0001-13). The design direction is A (Front desk) plus the free gaps from B (D-0001-13). Every screen is mobile responsive, from 360 px wide up (NFR-7).

**Non-functional goals.** Scalability, performance, reliability, maintainability and observability are part of the design and the code (NFR-1). The rules have their own test suite (NFR-3). The look follows Keyloop's visual language and WCAG 2.1 AA contrast, with no Keyloop logo (NFR-4, D-0000-4). Every AI-assisted step is logged (NFR-5). Logs, metrics and trace ids are built in (NFR-6).

**Words.** Code and API use the brief's names: `Dealership`, `ServiceBay`, `Technician`, `Appointment`, `Customer`, `Vehicle`, `ServiceType` (D-0000-14).

**Deadline.** 2026-11-01 (D-0000-9).

**Where it stands.** Everything in this document that is marked as built is merged into `main`: the rules, the contract and mock API, the store, telemetry, and all 15 screens. [Screens and flows](#screens-and-flows) shows the screens, [Results](#results) gives the numbers re-run for this pass, and [Pull requests](#pull-requests) lists every merged change. Hosting is the last step (D-0000-25). The hosted demo link is in the README once hosting is done.

## Architecture (diagram)

### The idea in short

Build **one Vite React app that carries its own mock backend in the browser**. This was candidate A of three.

- The **rules** live in a pure TypeScript `domain` folder. The **booking commands** (book, reschedule, adjust, cancel, edit hours and shifts) live in an `application` folder on top of it.
- The **mock API** (MSW) answers an **OpenAPI contract** by calling the application folder. The **screens talk only to that contract**, through a typed client (AD-2).
- Data sits in **IndexedDB through Dexie**, behind a **repository port**. Tests use an in-memory version of the same port (AD-8).
- Each booking write (book, reschedule, adjust) is **one IndexedDB read-write transaction**: check again, then write. The first transaction the browser commits wins. The other one finds the time gone and gets a **409 with suggested times** (AD-4).
- Every time is a **UTC instant plus the dealership's IANA zone**. Only one folder knows about time zones (AD-9).
- Every call carries a **trace id**. Logs are JSON with no contact details. A few metrics feed a small **dev panel** (AD-12).
- For the real backend, the same `domain` and `application` code runs on a server with **PostgreSQL**, where **exclusion constraints** refuse overlapping bookings (AD-18).

### Why this candidate

| Candidate                                                                | What it is                                                                                                                                         | Score (out of 150) |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| A. Mock backend in the page, IndexedDB transaction as the point of order | MSW's service worker catches each `/api` call and hands it to handlers in the page. Handlers call the application code, which writes through Dexie | **138**            |
| B. A plus a cross-tab lock                                               | The same, plus the browser's Web Locks API around each write                                                                                       | 133                |
| C. Mock backend in a SharedWorker                                        | One worker serves every tab: one queue, one log                                                                                                    | 118                |

A leads B by 5 points and C by 20. It wins because it is the smallest design that meets the hard constraints and the top drivers: one winner per race, a swappable backend, tests in Node, and DST-safe times. It adds almost no new technology.

One condition. A's score for "one winner per race" rests on a claim about IndexedDB that is still unverified (see [Assumptions](#assumptions)). If the Playwright two-tab race ever fails in a target browser, we add B's lock inside the Dexie adapter. That is one wrapper in one folder.

### What the design gives up

| Decision                                           | Gains                                                                        | Gives up                                                                                        | What softens it                                                                    |
| -------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| IndexedDB transaction is the point of order (AD-4) | No server; the same "check again, then write" shape as the PostgreSQL design | Bookings are per browser profile, so the race exists only between tabs of one browser           | Written as an assumption; the PostgreSQL design is the real fix                    |
| MSW ships in the hosted demo (AD-2, AD-15)         | Reviewers open a link and the whole flow works                               | A service worker can keep an old version until reload; the mock is code a real build leaves out | `VITE_API_MODE=mock` switches it on; the README says to reload once after a deploy |
| Instants plus dealership zone (AD-1, AD-9)         | DST-safe; one meaning for every stored time                                  | Every display and every "local day" query needs a zone conversion                               | One time module; one UI format helper; a test under two `TZ` values                |
| "Outside hours" is a flag, not a status (AD-14)    | A flagged appointment keeps its bay and technician until moved               | Screens show a status and a flag                                                                | A status badge plus a warning chip                                                 |
| The same appointment record on reschedule (AD-4)   | One id for the customer, the outbox and links                                | No built-in history of old times                                                                | `version` grows on each change; an audit log is a later step                       |

### Level 1: system context

```mermaid
flowchart TB
  customer["Customer<br/>(person)<br/>books, cancels and reschedules own appointments"]
  staff["Garage staff<br/>(person)<br/>checks the schedule, books for customers"]
  manager["Garage manager<br/>(person)<br/>adjusts appointments, hours, shifts, policies"]
  sched["Keyloop Service Scheduler<br/>(software system)<br/>finds a free bay and a qualified technician for the whole job and keeps the appointment record"]
  site["Dealer website<br/>(external system, not built)"]
  msg["SMS and email provider<br/>(external system, later; the outbox stands in)"]
  idp["Identity provider<br/>(external system, later; the role switcher stands in)"]
  dms["Dealer management system<br/>(external system, later)"]
  customer -->|"books, HTTPS"| sched
  staff -->|"views schedule, books, HTTPS"| sched
  manager -->|"adjusts and configures, HTTPS"| sched
  site -->|"links to /book with dealership and service"| sched
  sched -.->|"confirmations and reminders"| msg
  sched -.->|"sign-in, tokens"| idp
  sched -.->|"appointments both ways"| dms
```

Solid arrows exist in the demo. Dashed arrows are later integrations.

### Level 2: containers

```mermaid
flowchart TB
  people["Customer, garage staff, garage manager<br/>(people)"]
  host["Static host<br/>(container: static files, D-0000-25)<br/>index.html, JS bundle with seed JSON, mockServiceWorker.js"]
  subgraph browser["Browser: the demo today"]
    ui["Web UI<br/>(container: React, TypeScript, Tailwind v4)<br/>screens for three roles, role switcher, dev panel"]
    client["API client<br/>(component: typed fetch)<br/>adds traceparent, X-Demo-User, Idempotency-Key"]
    sw["Mock Service Worker<br/>(container: MSW service worker)<br/>catches /api calls"]
    mock["Mock API<br/>(container: MSW handlers in the page)<br/>finds the Actor, checks requests, maps results to HTTP"]
    core["Scheduler core<br/>(component: TypeScript application + domain)<br/>availability, booking commands, policies, time"]
    tel["Telemetry<br/>(component: logger and metrics)<br/>JSON logs, counters, trace ids"]
    idb[("IndexedDB via Dexie<br/>(container: browser database)<br/>appointments, customers, settings, outbox")]
  end
  subgraph later["Real backend: described only"]
    api["Scheduler API<br/>(container: TypeScript service)<br/>same core code, implements openapi.yaml"]
    pg[("PostgreSQL<br/>(container: database)<br/>exclusion constraints per bay, technician, car")]
    otel["OpenTelemetry Collector<br/>(container)<br/>logs, metrics, traces"]
  end
  host -->|"serves the app, HTTPS"| ui
  people -->|"use"| ui
  ui -->|"calls"| client
  client -->|"fetch /api, JSON"| sw
  sw -->|"hands the request to the page"| mock
  mock -->|"calls commands and queries"| core
  core -->|"read and write units"| idb
  mock -->|"logs, metrics"| tel
  core -->|"logs, metrics"| tel
  client -.->|"same contract when VITE_API_MODE=remote, HTTPS"| api
  api -.->|"SQL"| pg
  api -.->|"OTLP"| otel
```

### Layers and import rules

Code is split in layers. Inner code never names outer code (AD-6). Lint rules fail the build when a rule is broken.

```
src/
  domain/          pure rules, synchronous, no I/O (AD-7)
  application/     use cases; imports domain only
  infrastructure/  adapters: storage (memory, Dexie), seed, telemetry
  api/             contract, mock handlers, typed client
  ui/              screens; reaches the rest only over HTTP through api/client
  config/          reads VITE_API_MODE and VITE_API_BASE_URL (AD-15)
  styles/tokens.css  the only place colours, fonts and sizes are defined (AD-16)
docs/postgres/     the real backend's schema (AD-18)
```

The domain is pure: no React, no Dexie, no `async`, no `Date.now()`, no `Math.random`. "Now" and new ids come in as arguments (AD-7). That is why every rule runs as a Node unit test with no browser.

## Components and their roles

The twenty components below come from the requirement map of the architecture. Folders are in the product repo.

| Component | Role                                                                                                                                                                                                | Folder                                                                                              |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| UI-C      | The customer screens: pick a dealership, service and time; see suggested times; confirm; see, cancel and reschedule own appointments.                                                               | `src/ui/features/book/`, `my-appointments/`, `appointment/`, `reschedule/`                          |
| UI-S      | The staff screens (also open to the manager): the day schedule as a timeline (one row per technician), a bay view and a list; free gaps that start a booking; book for an existing or new customer. | `src/ui/features/schedule/`, `src/ui/features/book/` (`BookCustomerPage`)                           |
| UI-M      | The manager screens: adjust an appointment, edit opening hours and date overrides, edit technician shifts and booking rules, see the outbox.                                                        | `src/ui/features/adjust/`, `flagged/`, `manage/`, `outbox/`                                         |
| UI-Shell  | The frame around the screens: routes, the role switcher and the dealership picker.                                                                                                                  | `src/ui/app/`, `src/ui/session/`, shared parts in `src/ui/components/`                              |
| UI-Dev    | The dev panel: recent logs and the metric values.                                                                                                                                                   | `src/ui/features/dev/`                                                                              |
| Client    | The typed client the screens use. It adds the `traceparent`, `X-Demo-User` and `Idempotency-Key` headers.                                                                                           | `src/api/client/`                                                                                   |
| Contract  | `openapi.yaml`, the one agreed shape of every request and answer, and the types made from it.                                                                                                       | `src/api/contract/`                                                                                 |
| Mock      | The MSW handlers. They find the Actor, check the request against the contract, call the application code and turn the result into HTTP.                                                             | `src/api/mock/`                                                                                     |
| Cmd       | The booking commands: book, reschedule, adjust, cancel, update dealership settings, update technician shifts. Each write is one all-or-nothing write unit.                                          | `src/application/commands/`                                                                         |
| Qry       | The read operations: search and check availability, get the schedule, get an appointment, list my appointments, search customers, list the outbox.                                                  | `src/application/queries/`                                                                          |
| Avail     | The availability rules. `checkStart` is the only function that says yes or no for a start time and picks the technician, bay and courtesy car. Search and suggestions only call it.                 | `src/domain/availability/`                                                                          |
| Appt      | The appointment rules: which appointments block resources, status changes, and flags such as "outside opening hours".                                                                               | `src/domain/appointment/`                                                                           |
| Time      | The only place that knows time zones. It turns local dates and times into instants and back.                                                                                                        | `src/domain/time/`                                                                                  |
| Policy    | The dealership rules about lead time, booking horizon, the break between jobs and the customer change cutoff.                                                                                       | `src/domain/policies/`                                                                              |
| Outbox    | Which messages go out for a booking and at what times, in the dealership's zone.                                                                                                                    | `src/domain/outbox/`                                                                                |
| Valid     | The checks for a new customer and vehicle, and the check of the seed data.                                                                                                                          | `src/domain/validation/`                                                                            |
| Store     | The repository port (small interfaces and the write unit) and its two implementations: in memory for tests and Dexie over IndexedDB for the app.                                                    | `src/application/ports/`, `src/infrastructure/storage/memory/`, `src/infrastructure/storage/dexie/` |
| Seed      | The made-up sample data in JSON and the loader that fills an empty database.                                                                                                                        | `src/infrastructure/seed/`                                                                          |
| Tel       | The logger, the metrics and the trace ids.                                                                                                                                                          | `src/infrastructure/telemetry/`                                                                     |
| PG        | The PostgreSQL schema for the real backend, with its SQL test. It is a design, not used by the demo.                                                                                                | `docs/postgres/`                                                                                    |

The repository port gives five guarantees, and one shared test suite checks each on every implementation (AD-8):

1. Two write units that would leave two blocking appointments overlapping on the same bay, technician (with the break) or courtesy car never both commit.
2. If the work fails, nothing it wrote is kept.
3. Reads inside a unit see the writes made earlier in the same unit.
4. The work awaits only store calls (Dexie needs this, AD-7).
5. Instants come back exactly as they went in.

## Data flow

### Confirming a booking

This is the path of the most important call: two people may press Confirm for the same last free time.

```mermaid
sequenceDiagram
  participant UI as Web UI
  participant C as API client
  participant M as Mock API (MSW)
  participant A as bookAppointment
  participant D as checkStart (domain)
  participant S as Store (IndexedDB)
  UI->>C: confirm(form, idempotency key)
  C->>M: POST /api/appointments + traceparent, X-Demo-User, Idempotency-Key
  M->>M: find the Actor, check the body against the contract
  M->>A: bookAppointment(actor, request)
  A->>S: open write unit
  S-->>A: saved answer for this key? (if yes, return it)
  A->>S: load the dealership-day
  A->>D: checkStart(snapshot, request, now)
  alt a technician and a bay are free
    D-->>A: technician, bay (and car)
    A->>S: write customer if new, appointment, outbox, idempotency record
    S-->>A: commit
    A-->>M: ok(appointment)
    M-->>C: 201 Appointment, X-Trace-Id
  else taken (another write unit committed first)
    D-->>A: reasons
    A->>S: end write unit, nothing written
    A->>S: read unit: suggest(...)
    A-->>M: SLOT_UNAVAILABLE(reasons, suggestions)
    M-->>C: 409 problem+json, X-Trace-Id
  end
  C-->>UI: result, the screen shows confirmation or the apology with suggestions
```

In words:

1. The screen sends the form with a new idempotency key, one per Confirm press. A retry of the same press reuses the key.
2. The client adds a trace id and the demo user, and calls `POST /api/appointments`. The service worker catches the call and hands it to the handlers in the page.
3. The handler builds the Actor from the demo user (never from the request body) and checks the body against the contract.
4. The command opens one write unit. First it looks for a saved answer for this key. If there is one, it returns that and stops.
5. It loads the dealership's day and runs `checkStart` on what is stored right now. This is the second check. The first one happened when the grid was shown.
6. If a technician and a bay are free, it writes the appointment (and the new customer and vehicle, the outbox messages and the idempotency record) in the same unit. The commit makes it real. The answer is 201.
7. If another write unit committed first, the check fails. Nothing is written. A read step then works out up to five other times. The answer is 409 `SLOT_UNAVAILABLE` with the reasons and the suggestions.
8. The screen shows the confirmation, or a polite "sorry, that time was just taken" with the suggested times. The form keeps what the user typed (REQ-BOOK-009).

"First" means first accepted by the server, never the user's clock (D-0001-6). Two confirms in the same millisecond still give exactly one winner.

### Searching for free times

This is the flow behind the time grid (REQ-BOOK-001, REQ-BOOK-002).

```mermaid
sequenceDiagram
  participant UI as Web UI
  participant C as API client
  participant M as Mock API (MSW)
  participant Q as searchAvailability
  participant D as searchDay (domain)
  participant S as Store (IndexedDB)
  UI->>C: show times(dealership, service, date, transport)
  C->>M: GET /api/dealerships/id/availability + traceparent, X-Demo-User
  M->>M: find the Actor, check the query against the contract
  M->>Q: searchAvailability(actor, query)
  Q->>S: open read unit, load dealership, technicians, bays, cars, day's appointments
  Q->>D: searchDay(snapshot, request, now)
  loop each start time on the 15-minute grid
    D->>D: checkStart: hours, shifts, skill, breaks, bay, car
  end
  D-->>Q: free start times
  Q-->>M: slots
  M-->>C: 200 date, timeZone, gridMinutes, slots, X-Trace-Id
  C-->>UI: the screen shows the free times
```

In words:

1. The customer picks a dealership, a service type, a date and how they will handle the car (wait, drop off or courtesy car).
2. The handler checks the query against the contract and finds the Actor.
3. One read unit loads everything the check needs for that one local date: the dealership's hours and policies, the service type, the technicians with skills and shifts, the bays, the courtesy cars and the day's blocking appointments.
4. `searchDay` walks the start-time grid from opening time to the last start that still ends by closing time. For each start it asks `checkStart`: is the time inside the opening hours, is there a qualified technician on shift for the whole job (with the break after their last job), is a bay free, and, when a courtesy car was chosen, is a car free?
5. The free starts go back as `slots`. The grid steps are taken in real time from the opening instant, so a DST day stays right.
6. The grid can show a time that someone books a moment later. That is why the confirm checks again (see above).

A time that is not free is answered with reasons such as `TECHNICIAN_BUSY`, `BAY_BUSY`, `TOO_SOON` or `DEALERSHIP_CLOSED`. A separate call, `POST /availability-checks`, answers for one start time and never returns 409.

### The contract in short

- Base path `/api`, JSON. Instants on the wire are RFC 3339 UTC. Local dates are `YYYY-MM-DD`, local times `HH:mm`. Every dealership and appointment carries its `timeZone`.
- Every error is `application/problem+json` with a fixed `code` and a `traceId` (AD-11). Codes: `VALIDATION_FAILED` (422), `IDEMPOTENCY_KEY_MISSING` (400), `IDEMPOTENCY_KEY_REUSED` (422), `UNKNOWN_USER` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `SLOT_UNAVAILABLE` (409), `CHANGE_WINDOW_CLOSED` (409), `SEARCH_RANGE_TOO_LARGE` (422), `INTERNAL` (500).
- Limits: a start-time grid of 15 minutes (Q-0001-11); one local date per availability call; up to five suggestions within 14 days (D-0001-16); list and shift ranges up to 31 days.
- The two availability calls, `GET /dealerships/{id}/availability` and `POST /availability-checks`, take an optional `appointmentId`. That appointment is left out of the check, so a customer moving their own booking, or a manager adjusting one, sees every time it could move to. Only someone who may change that appointment may send it; anyone else gets the same answer as for an appointment they cannot see (D-0001-101, D-0001-102).
- `GET /appointments` takes `includePast=true`, so a customer sees their past appointments as well (D-0001-94).
- "Real-time" means the check runs live when a user asks and again inside the confirm. Other people's bookings are not pushed to open screens. The booking pages also re-check the chosen time every 30 seconds (see [Concurrency](#concurrency-no-hold-and-an-early-warning)).

## Screens and flows

The screens follow the approved design (design.md sections 3 to 9 in the work repo, approved on a clickable prototype, D-0001-44). The tables and diagrams below are the built result.

### The 15 screens

`/` is not a screen of its own: it sends a customer to `book` and staff or a manager to `schedule`. A role that may not open a page sees `no-permission` in place, and the address stays. Screenshots are from the evidence of the screen pull requests (390 px wide for the phone, 1440 px for the desktop).

| Screen                | Route                                             | Who may open it                                    | Requirements                               | Screenshots                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------- | ------------------------------------------------- | -------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `book`                | `/book?dealership&service&customerId&vehicleId`   | customer; staff and manager with a customer chosen | REQ-BOOK-001, 002, 003, 007, 009, 010, 011 | [phone](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-29-time-zone-note-on-every-customer-screen/book-saigon-390.png?raw=true) · [desktop](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-29-time-zone-note-on-every-customer-screen/book-saigon-1440.png?raw=true)                                                                                         |
| `book-confirmed`      | `/book/confirmed/:appointmentId`                  | every role that booked                             | REQ-BOOK-003, 010, 013                     | [phone](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-29-time-zone-note-on-every-customer-screen/book-confirmed-saigon-390.png?raw=true) · [desktop](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-29-time-zone-note-on-every-customer-screen/book-confirmed-saigon-1440.png?raw=true)                                                                     |
| `my-appointments`     | `/appointments`                                   | customer                                           | REQ-BOOK-003, 012                          | [phone](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-29-time-zone-note-on-every-customer-screen/my-appointments-saigon-390.png?raw=true) · [desktop](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-29-time-zone-note-on-every-customer-screen/my-appointments-saigon-1440.png?raw=true)                                                                   |
| `appointment`         | `/appointments/:appointmentId`                    | the owner, staff and manager of its dealership     | REQ-BOOK-003, 004, 010, 012                | [phone](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-29-time-zone-note-on-every-customer-screen/appointment-saigon-390.png?raw=true) · [desktop](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-29-time-zone-note-on-every-customer-screen/appointment-saigon-1440.png?raw=true)                                                                           |
| `reschedule`          | `/appointments/:appointmentId/reschedule`         | customer                                           | REQ-BOOK-009, 012                          | [phone](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-29-time-zone-note-on-every-customer-screen/reschedule-saigon-390.png?raw=true) · [desktop](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-29-time-zone-note-on-every-customer-screen/reschedule-saigon-1440.png?raw=true)                                                                             |
| `book-customer`       | `/book/for-customer?start&technicianId`           | staff, manager                                     | REQ-BOOK-014                               | [phone](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-29-time-zone-note-on-every-customer-screen/book-for-customer-saigon-390.png?raw=true) · [desktop](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-29-time-zone-note-on-every-customer-screen/book-for-customer-saigon-1440.png?raw=true)                                                               |
| `schedule`            | `/schedule?date&dealership&rows&view`             | staff, manager                                     | REQ-BOOK-004, 006, 010, 013                | [phone](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-28-staff-schedule-timeline-list-and-appointment-view/schedule-list-390.png?raw=true) · [desktop](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-28-staff-schedule-timeline-list-and-appointment-view/schedule-timeline-1440.png?raw=true)                                                             |
| `adjust`              | `/appointments/:appointmentId/adjust`             | manager                                            | REQ-BOOK-005                               | [phone](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-29-time-zone-note-on-every-customer-screen/adjust-saigon-390.png?raw=true) · [desktop](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-29-time-zone-note-on-every-customer-screen/adjust-saigon-1440.png?raw=true)                                                                                     |
| `flagged`             | `/manage/flagged`                                 | manager                                            | REQ-BOOK-005, 007, 008                     | [phone](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-29-merge-wave-2-screens-and-apply-their-answers/flagged-list-390.png?raw=true) · [desktop](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-29-merge-wave-2-screens-and-apply-their-answers/flagged-list-1440.png?raw=true)                                                                             |
| `dealership-settings` | `/manage/dealership?dealership`                   | manager                                            | REQ-BOOK-007, 011                          | [phone](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-28-manager-dealership-settings-and-technician-shifts/dealership-settings-idle-390.png?raw=true) · [desktop](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-28-manager-dealership-settings-and-technician-shifts/dealership-settings-idle-1440.png?raw=true)                                           |
| `shifts`              | `/manage/shifts?technicianId&dealership`          | manager                                            | REQ-BOOK-006, 008                          | [phone](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-28-manager-dealership-settings-and-technician-shifts/shifts-idle-390.png?raw=true) · [desktop](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-28-manager-dealership-settings-and-technician-shifts/shifts-idle-1440.png?raw=true)                                                                     |
| `outbox`              | `/manage/outbox?dealership&appointmentId`         | manager                                            | REQ-BOOK-013                               | [phone](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-28-manager-outbox-screen/outbox-list-390.png?raw=true) · [desktop](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-28-manager-outbox-screen/outbox-list-1440.png?raw=true)                                                                                                                             |
| `dev-panel`           | `/dev`                                            | every role, demo only (left out of a real build)   | NFR-6                                      | [phone](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-28-dev-panel-logs-metrics-and-reset/dev-panel-logs-390.png?raw=true) · [desktop](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-28-dev-panel-logs-metrics-and-reset/dev-panel-logs-1440.png?raw=true)                                                                                                 |
| `no-permission`       | shown in place on any route the role may not open | every role                                         | REQ-BOOK-005, 008, 012, 014                | [phone](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-28-app-shell-role-switcher-dealership-picker-and-shared-components/no-permission-customer-schedule-390.png?raw=true) · [desktop](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-28-app-shell-role-switcher-dealership-picker-and-shared-components/no-permission-customer-schedule-1440.png?raw=true) |
| `not-found`           | `*`, and any 404 from the API                     | every role                                         | REQ-BOOK-012                               | [phone](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-28-customer-appointments-list-cancel-and-reschedule/not-found-page-390.png?raw=true) · [desktop](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-28-customer-appointments-list-cancel-and-reschedule/not-found-page-1440.png?raw=true)                                                                 |

Every requirement REQ-BOOK-001 to 014 has at least one screen. Every data screen also has a loading, an error, an empty (where a list can be empty) and a no-permission state; the screen pull requests hold a screenshot of each.

### Flow: entry and roles

```mermaid
flowchart TD
  open["Open the app"] --> pick["Role switcher: Customer, Staff or Manager, a sample user each"]
  pick -->|Customer| cHome["book"]
  pick -->|Staff| sHome["schedule"]
  pick -->|Manager| sHome
  site["Dealer website link: /book with dealership and service filled in"] --> cHome
  cHome -->|"switches role on a page the new role may not open"| np["no-permission: says what, why, and offers the role's home or Switch role"]
  sHome -->|"typed address of a page for another role or another dealership"| np
  anyPage["Any page, API answers 403 or 401"] --> np
  anyPage2["Any page, someone else's appointment or a missing id, API answers 404"] --> nf["not-found: says it may not exist or is not yours, offers the role's home"]
```

### Flow: customer

```mermaid
flowchart TD
  C0["Customer opens book, maybe from the dealer website"] --> C1["book: dealership, car, service type"]
  C1 -->|"a field is missing"| C1e["book: the missing field is named, nothing is checked"] --> C1
  C1 -->|"no car on file"| C1v["book: no car yet, ask the dealership to add one"]
  C1 --> C2["book: day strip shows how full each day is"]
  C2 -->|"closed, full, too soon or too far ahead"| C2x["Day disabled, the reason is written on it"] --> C2
  C2 -->|"no times left on the chosen day"| C2n["book: empty day, closest times on other days offered"] --> C3
  C2 -->|"day has times"| C3["book: pick a start time"]
  C3 --> C4["book: choose wait, drop-off or courtesy car"]
  C3 -->|"re-checked at once and every 30 seconds: just taken"| C7
  C4 --> C5{"Confirm: server checks again, then writes"}
  C5 -->|"201"| C6["book-confirmed"]
  C5 -->|"409 just taken"| C7["book: Sorry, that time was just taken. Everything entered is kept. Closest times shown"]
  C7 -->|"picks a closest time"| C5
  C7 -->|"no suggestions"| C7e["book: no other times in the next 14 days, pick another day or contact the dealership"]
  C5 -->|"422 field problem"| C1e
  C5 -->|"network error or 500"| C8["Error panel with Try again, same key, so it cannot book twice"] --> C5
  C6 --> C9["my-appointments: upcoming, then past and cancelled"]
  C9 --> C10["appointment"]
  C10 -->|"Cancel, before the cutoff"| C11["Cancel dialog or sheet"]
  C11 -->|"Cancel appointment"| C12["appointment: cancelled, times freed"]
  C11 -->|"409 CHANGE_WINDOW_CLOSED"| C13["Changes closed: contact the dealership"]
  C10 -->|"Reschedule, before the cutoff"| C14["reschedule"]
  C10 -->|"after the cutoff"| C13
  C14 -->|"free time, confirm"| C15["appointment: new time shown, old time released"]
  C14 -->|"409"| C16["reschedule: just taken, your current appointment is unchanged"]
  C10 -->|"someone else's id"| C17["not-found"]
```

### Flow: staff

```mermaid
flowchart TD
  S0["Staff opens schedule for their one dealership, today"] --> S1{"Screen width"}
  S1 -->|"desktop"| S2["Timeline: a row per technician, or per bay"]
  S1 -->|"phone or tablet"| S3["List, or one technician at a time"]
  S2 -->|"no appointments that day"| S7["Empty day: invitation to book for a customer"]
  S2 -->|"tap a block"| S5["Detail panel under the timeline"] --> S6["appointment"]
  S3 -->|"tap a row"| S6
  S2 -->|"tap a free gap"| S8["book-customer with the start time and technician filled in"]
  S3 -->|"tap a free-gap row"| S8
  S0 -->|"Book for a customer"| S8
  S8 --> S9{"Who is the customer?"}
  S9 -->|"search by name, phone or plate"| S10["Pick the customer and the car"]
  S9 -->|"no match: add a new customer"| S11["New customer and car form"]
  S11 -->|"a required field is missing or wrong"| S13["Field named, nothing saved"] --> S11
  S11 -->|"phone or plate matches a record"| S12["Possible duplicate shown: use the existing customer, or go on"]
  S10 --> S14["book, staff version: customer shown at the top"]
  S12 --> S14
  S11 --> S14
  S14 --> S15{"Confirm"}
  S15 -->|"201"| S16["book-confirmed, then back to schedule"]
  S15 -->|"409 just taken"| S17["Just taken: what was entered is kept, closest times shown"] --> S14
  S6 -->|"staff looks for Adjust or Cancel"| S18["Not offered to staff (REQ-BOOK-005.AC-3, D-0001-19)"]
  S0 -->|"typed address under manage, or another dealership"| S19["no-permission"]
```

### Flow: manager

```mermaid
flowchart TD
  M0["Manager opens schedule"] --> M1["appointment"] --> M2["adjust: move, reassign technician or bay, or cancel"]
  M2 -->|"Save, the new time is free"| M3["adjust: saved. Says who was picked if the system chose someone else. Back to schedule"]
  M2 -->|"409 clash, or the time is taken before Save"| M4["adjust: change refused, nothing changed, times that fit suggested"] --> M2
  M0 -->|"Book for a customer button (D-0001-54 B)"| MB["book-customer, the staff screens reused"]
  M0 --> M5["flagged: bookings left outside the hours or a shift, with the reason"]
  M5 -->|"Move"| M2
  M5 -->|"Cancel"| M6["Cancel dialog"] --> M7["flagged: the row leaves the list"]
  M5 -->|"nothing flagged"| M5e["Empty state: nothing needs your attention"]
  M0 --> M8["dealership-settings: weekly hours, date overrides, lead time, horizon, break"]
  M8 -->|"Save: first checks which bookings it would touch (D-0001-36)"| M8c["checking"]
  M8c -->|"none touched"| M9["Saved"]
  M8c -->|"N touched"| M8w["Warning dialog: Saving will flag N bookings. Go back and edit, or Save and flag N"]
  M8w -->|"Save and flag N"| M10["Saved, with a notice: N bookings now flagged, link to flagged"] --> M5
  M0 --> M11["shifts: weekly pattern, leave, extra shift"]
  M11 -->|"Save: same check, same warning"| M8c
  M0 --> M12["outbox: confirmations and reminders"]
  M0 --> M13["dev-panel: logs, numbers, reset demo data"]
  M1 -.->|"customer or staff opens adjust"| NP["no-permission"]
```

### Phone and desktop rules (NFR-7)

Phone is below 640 px (designed from 360, nothing breaks at 320), tablet is 640 to 1023 px, desktop is from 1024 px.

| Rule            | Phone                                                                      | Desktop                                                             |
| --------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Sideways scroll | Never, from 320 px and at 200% zoom; only the day strip scrolls in its row | Never; only a timeline wider than the screen scrolls inside its box |
| Touch targets   | At least 44 × 44 px, 8 px apart                                            | The same                                                            |
| Tables          | Become lists that keep the key facts in each row                           | Tables, the staff timeline                                          |
| Main action     | A sticky action bar at the bottom of task screens; the tab bar is hidden   | In the page or a side panel                                         |
| Dialogs         | Bottom sheets, full width, close button 44 px                              | Centred dialogs                                                     |
| Staff schedule  | List (default) or one technician's day                                     | Timeline (default), list or bays                                    |
| Forms           | One column                                                                 | Two columns where fields pair                                       |
| Text            | Body 16 px, so a phone does not zoom a focused field; never below 12 px    | The same                                                            |

### How the screens stay one product

- **One token file.** `src/styles/tokens.css` is the only place for colours, fonts and sizes (D-0000-12, AD-16). A lint rule fails the build on a raw colour anywhere else.
- **One set of shared parts.** The buttons, fields, day strip, time chips, booking summary, badges, dialogs and sheets, toasts, alerts and empty, loading and error blocks live once in `src/ui/components/`. The screens use them and do not restyle them.
- **One set of words.** The words of design.md section 9: errors say what happened, why, and what to do next; the same names for roles ("Customer", "Staff", "Manager"); the same "Something went wrong on our side." with a reference to quote; every time in the dealership's own time, with "Times are in London time." when the viewer's zone differs (D-0001-108).
- **WCAG 2.1 AA** (NFR-4): text contrast at least 4.5:1 and meaningful edges and icons at least 3:1; targets at least 44 px; every action by keyboard with a visible focus ring; colour never alone (a status is an icon and a word). The axe-core sweep of every route, for every role, at 390 and 1440 px, found **0 violations** in the run for this pass (see [Results](#results)).
- **Approved on a prototype.** The AI drew two design directions; the human chose one (D-0001-13). The AI then built a clickable prototype of every flow, and the human reviewed and approved it before any screen was built (D-0001-44). The screens were built to that prototype; where a screen pull request differs from it, its body says so.

## Technology choices

Every row is a choice the human made or confirmed. The decision id is in the second column.

| Technology                                                                                                      | Decision             | Why it was chosen                                                                                                                                                                                                               | What was rejected                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| React and TypeScript                                                                                            | D-0000-5, D-0000-3   | The human asked for React to move faster. TypeScript lets the rules be a typed, pure module with no React.                                                                                                                      | None recorded.                                                                                                                                     |
| Vite (a React single-page app)                                                                                  | D-0000-16            | The scheduler is a booking and back-office app, not a marketing site, so there is nothing for a search engine to index. The mock backend runs in the browser. A build is static files, so reviewers open a link with no server. | Next.js: server rendering would need a real server for the data, which is the layer we mock. SEO belongs to the dealer's own site.                 |
| Tailwind CSS v4                                                                                                 | D-0000-5, D-0000-12  | The human asked for it to move faster. One token file, `src/styles/tokens.css`, is the only place for colours, fonts and sizes. A lint rule fails the build on raw colours.                                                     | None recorded.                                                                                                                                     |
| MSW (Mock Service Worker)                                                                                       | D-0000-3             | It catches the app's own network calls, so the screens use real `fetch` against a real contract. The same handlers run in Node tests.                                                                                           | json-server: an extra server, and the rules would not be in it (D-0000-8).                                                                         |
| OpenAPI 3.1, written first in YAML, with openapi-typescript, openapi-fetch, an Ajv-based validator and Spectral | D-0000-3, D-0000-24  | A reviewer or a future backend team reads one designed contract. The types and the tests both come from it, so drift fails a test instead of reaching a screen.                                                                 | Code-first with Zod (the contract would be generated, not designed). Hand-written types with no generation (nothing stops drift).                  |
| Dexie over IndexedDB, with seed data in JSON                                                                    | D-0000-8             | Data survives a reload. A read-write transaction lets "check again, then write" be all or nothing, so two tabs give one winner.                                                                                                 | localStorage (no transactions across tabs). PGlite (heavier, riskier).                                                                             |
| Temporal, through the `@js-temporal/polyfill` package                                                           | D-0000-18, D-0000-31 | Correct DST handling is a driving scenario. Temporal states the rules for skipped and repeated hours in its API. Only `src/domain/time/` imports it.                                                                            | Luxon (less explicit about skipped and repeated times; the fallback). date-fns with its time-zone add-on (the zone must be passed around by hand). |
| React Router                                                                                                    | D-0000-19            | The familiar choice. It covers deep links such as `/book?dealership=…&service=…` and query parameters.                                                                                                                          | TanStack Router (type safety we do not need for about ten pages). No router (back button and query parameters would be ours to build).             |
| TanStack Query                                                                                                  | D-0000-20            | "Refresh the schedule after a booking" and "never retry a write by itself" are one setting each.                                                                                                                                | SWR (fewer options for writes). Hand-written hooks (caching and loading states are ours to write and test).                                        |
| React Hook Form with Zod                                                                                        | D-0000-21            | Zod describes the fields once. The form keeps the typed values after a 409 with no extra code.                                                                                                                                  | TanStack Form (newer, fewer people know it). Hand-written forms (more code for five forms).                                                        |
| Vitest, Testing Library, axe-core                                                                               | D-0000-22            | Vitest is the runner made for Vite projects. The domain suite runs in Node with no browser. Testing Library tests screens the way a user uses them. axe-core scans pages for accessibility problems.                            | Jest (extra setup to understand Vite and TypeScript). Vitest only (storage race tested only in the browser).                                       |
| fake-indexeddb                                                                                                  | D-0000-22            | An in-memory IndexedDB for Node, so the Dexie store and its two-writer race run in the normal test run.                                                                                                                         | Testing the Dexie code only in Playwright.                                                                                                         |
| fast-check                                                                                                      | D-0000-22            | Property tests: for many random schedules, no two blocking appointments overlap, and every suggested time passes the check.                                                                                                     | Table tests only.                                                                                                                                  |
| Playwright                                                                                                      | D-0000-13            | End-to-end tests, including the two-tab race, and the videos in each pull request.                                                                                                                                              | None recorded.                                                                                                                                     |
| ESLint with typescript-eslint, `eslint-plugin-boundaries` and Prettier                                          | D-0000-23            | One command, `npm run lint`, checks every architecture rule, including folder import rules and the no-raw-colour rule.                                                                                                          | ESLint plus dependency-cruiser (a second tool to run). Biome (no folder-boundary rule of the kind we need).                                        |
| PostgreSQL, for the described backend only                                                                      | D-0000-8             | Exclusion constraints let the database refuse overlapping bookings itself.                                                                                                                                                      | Nothing else was weighed for the real backend.                                                                                                     |

Browser features used with no library: `Intl.DateTimeFormat` with a `timeZone` (display), `crypto.randomUUID` (ids and idempotency keys), IndexedDB, Service Worker.

Other decided choices. Hosting is a free static host linked to the private repo, but only after everything else is finished (D-0000-25). Library checks in CI are the light set (D-0000-30, see [Security and privacy](#security-and-privacy)). The code is in English, in plain words (D-0000-10).

The new-technology budget is 0.5 of 1. It is spent on two unusual uses that the constraints force: the browser's IndexedDB transaction as the booking order, and MSW shipped as the backend of a hosted demo. Version numbers appear only where a test or a decision fixed them. Other versions come from the lockfile.

## Observability

NFR-6 asks for logs, metrics and traces even though the backend is a mock. All of this is built in the demo and described for the real backend.

### Trace rules (AD-12)

- The client makes a W3C `traceparent` header for every call.
- The mock keeps that trace id for the whole request, puts `traceId` in every log line and every error body, and returns it in the `X-Trace-Id` response header.
- Only well-formed trace ids are accepted. Anything else gets a new id (SEC-9).
- Inside a command, each step (load, check, write, suggest) is timed and logged as a child step of the same trace.

### Log fields

Logs are JSON lines, written to the console and to an in-memory ring buffer of the last 500 lines for the dev panel. Only these fields are allowed:

`ts`, `level`, `msg`, `traceId`, `route`, `method`, `status`, `durationMs`, `dealershipId`, `actorRole`, `outcome`, `code`, `reasons`, `appointmentId`, `technicianId`, `serviceBayId`, `candidates`.

The logger keeps only these keys. It drops everything else, so a new field cannot leak by accident. A customer's name, phone, email, registration and any free text are never logged. `route` is the path template (`/appointments/{id}`) and the query string is never recorded. Only the telemetry folder may call `console`.

Example (a 409 on a booking):

```json
{
  "ts": "2026-11-03T09:14:02.120Z",
  "level": "info",
  "msg": "appointment.book",
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
  "route": "POST /appointments",
  "status": 409,
  "durationMs": 9,
  "dealershipId": "dlr-london",
  "actorRole": "customer",
  "outcome": "slot_unavailable",
  "reasons": ["TECHNICIAN_BUSY"]
}
```

### Metrics

Metrics are kept in memory and shown in the dev panel. **They are per browser tab in the demo**, because each tab has its own page and its own counters. The metric names are the team's own proposals, not a published standard.

| Metric                            | Type                      | Labels                                                                           | Golden signal     |
| --------------------------------- | ------------------------- | -------------------------------------------------------------------------------- | ----------------- |
| `http_requests_total`             | counter                   | route, method, status                                                            | traffic, errors   |
| `http_request_duration_ms`        | histogram                 | route, method, outcome (ok or failed, kept apart as the Google SRE book advises) | latency           |
| `availability_search_duration_ms` | histogram                 | dealershipId, kind (day, check, suggest)                                         | latency           |
| `availability_search_empty_total` | counter                   | dealershipId                                                                     | domain            |
| `appointments_confirmed_total`    | counter                   | dealershipId, actorRole                                                          | traffic           |
| `appointment_conflicts_total`     | counter                   | dealershipId, reason                                                             | errors (expected) |
| `appointments_cancelled_total`    | counter                   | dealershipId, actorRole                                                          | traffic           |
| `idempotent_replays_total`        | counter                   | route                                                                            | none              |
| `bay_utilisation_ratio`           | gauge, worked out on read | dealershipId, date                                                               | saturation        |

### The dev panel

The dev panel (`/dev`, demo only) shows these numbers and the last 500 log lines. A log line opens to its JSON, and "Show only this trace" keeps the lines of one request. **The numbers are per tab in the demo**: they count only what this browser tab did since it was opened, and a reload clears them.

![The dev panel at 1440 px: the numbers on the left, and a log line opened to its JSON on the right](https://github.com/thienba/keyloop-service-scheduler/blob/vtc/evidence/2026-10-28-dev-panel-logs-metrics-and-reset/dev-panel-logs-1440.png?raw=true)

### For the real backend

The same signals map to OpenTelemetry:

| OpenTelemetry signal                                      | In the demo                                                                            | In the real backend                                                                                                                |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Traces ("the path of a request through your application") | The `traceparent` header, the trace id in every log line, timed steps inside a command | The same `traceparent` continues from the browser into the API. The OpenTelemetry SDK records HTTP and database spans              |
| Logs ("a recording of an event")                          | JSON lines with the allowed fields                                                     | The same lines and fields, sent through a collector to a log store                                                                 |
| Metrics ("a measurement captured at runtime")             | The counters, histograms and gauge above                                               | The same metrics, sent to the collector. Names will follow the OpenTelemetry semantic conventions, which we have not looked up yet |

The four golden signals of the Google SRE book map like this:

| Golden signal | What we measure                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| Latency       | `http_request_duration_ms` and `availability_search_duration_ms`, with failed requests kept apart from good ones |
| Traffic       | `http_requests_total`, `appointments_confirmed_total`, `appointments_cancelled_total`                            |
| Errors        | 5xx in `http_requests_total`, and `appointment_conflicts_total` (409s are expected, not faults)                  |
| Saturation    | `bay_utilisation_ratio`. In the real backend, also the database connection pool                                  |

**Proposed targets. These are our own and are not sourced.** No fetched source gave a published target for a booking system (research Q5).

- Availability search p95 under 300 ms.
- Failed (5xx) requests under 0.1% a month.
- Raise an alert when the 409 share of confirms jumps well above its weekly normal.

## Scalability and reliability

Each point is tied to the architecture decision that holds it.

**One winner per race (AD-4, AD-8, AD-18; S1).** Two confirms for the last free technician and bay must give exactly one appointment.

- In the demo, each booking write is one IndexedDB read-write transaction: check again, then write. The browser runs two such transactions on the same stores one after the other. The first to commit wins. The second re-checks, finds the time gone and gets a 409 with suggestions. The target is zero double bookings in 100 repeated in-memory races and in the Playwright two-tab test.
- In the real system, the PostgreSQL exclusion constraints refuse the overlap, even if two requests pass the code check at the same time (see [Real backend design (PostgreSQL)](#real-backend-design-postgresql)).
- The demo's guarantee holds inside one browser profile. Two different browsers never share a diary.
- For this pass the two-tab race was run 5 times in Chromium with one winner each time, and once more in Firefox and in WebKit (see [Results](#results)).

**Idempotency keys (AD-5).** The client makes one UUID per Confirm press and reuses it on a retry. The store keeps the saved answer, written in the same write unit, only for a successful write. Same key and same body: the saved answer, and one appointment. Same key with a different body: 422. No key: 400. Keys are kept at least 24 hours, as Stripe's guide does. A double-click or a network retry cannot make two bookings.

**Stateless API instances (AD-2, AD-6; real backend).** The real API holds no state in memory. The rules are in the shared `domain` and `application` code, and all state is in PostgreSQL. So instances can be added behind a load balancer. The client already works only through the contract.

**Per-dealership day queries (AD-4; real backend).** A search or a confirm reads one dealership and one local day, a small read. The schema has only an index on the customer today. An index on `(dealership_id, during)` is a proposed addition for the real backend, not in `schema.sql` yet. Partitioning the appointment table by dealership or by month is a later step, only when volume needs it.

**The search budget (AD-19; S7).** For 10 technicians, 6 bays and 60 appointments a day: one day's search under 50 ms and 14-day suggestions under 200 ms, measured in Node. Work segments and busy lists are built once per day, so each start costs a few comparisons. A timed test reports it as a warning, not a blocker. The times measured for this pass are in [Results](#results).

**Other reliability points.**

- A failed write unit writes nothing. A reschedule keeps the old time until the new time is written, so a customer never loses both (AD-4).
- Outbox messages are written in the same write unit as the appointment, once. A failed booking leaves no message (AD-13).
- One availability function serves search, check, confirm, adjust and suggestions, so the grid never shows a time that the confirm then refuses (AD-10).
- Changing hours or shifts flags affected appointments. It never deletes or moves them (AD-14).
- The seed is validated and versioned (AD-17).
- Maintainability: layers with lint-enforced import rules (AD-6), one repository port with a shared test suite (AD-8), a swappable backend (AD-2, AD-15).

### Concurrency: no hold, and an early warning

**No time is held while the form is filled in (D-0001-107).** Choosing a time on `book`, `reschedule`, the staff booking or `adjust` reserves nothing. The first confirm the server accepts still wins (REQ-BOOK-009), and the other person gets the apology with the closest times.

**The page warns early.** When a time is chosen, the page checks it again at once with the normal availability check, and then every 30 seconds while it stays chosen. If someone else has just taken it, the page shows the apology and the closest times before the person presses Confirm or Save. Nothing is booked or changed by this check, and a failed check shows nothing new and does not block Confirm, which runs its own check. On `adjust` an early clash has the title "That time is no longer free." (D-0001-111 C).

**A soft hold is a considered extension, not built.** It would hold the chosen time on the server for about 5 minutes, with a countdown on the page, one hold per person; others would see the time as busy until the hold ends or the person leaves.

- **When it would be worth it:** a long form, or a payment or deposit step, where losing the time at the end costs the person real effort.
- **What it costs:**
  - The race does not go away. It moves to the hold step, which needs the same "check again, then write" and the same one winner.
  - Abandoned holds block other customers until they expire, so a busy day looks fuller than it is.
  - It needs new API calls (take, renew and release a hold), an expiry job on the server, one hold per person enforced, a countdown on every booking page, and new tests.
- **Why not now:** the booking form here is short (car, service, time, how the car is handled), so the early warning covers most of the surprise at a fraction of the cost.

## Real backend design (PostgreSQL)

The schema is in [docs/postgres/schema.sql](postgres/schema.sql). It is a design for a real backend. The demo does not use it (D-0000-8). Its SQL test is in [docs/postgres/check.sql](postgres/check.sql).

**The idea (AD-18, REQ-BOOK-009).** The database itself refuses double booking, so a future backend does not rely only on checks in code.

- **Three exclusion constraints on the `appointment` table**, one for each resource:
  - `appointment_bay_no_overlap`: the same service bay cannot have two overlapping time ranges.
  - `appointment_technician_no_overlap`: the same technician cannot have two overlapping ranges. This one uses a second range, `technician_busy`, which is the job plus the break after it. Two jobs closer together than the break are refused on both sides.
  - `appointment_courtesy_car_no_overlap`: the same courtesy car cannot have two overlapping ranges. Its predicate is `status <> 'cancelled' AND courtesy_car_id IS NOT NULL`, so it applies only when a car is chosen.
- **A partial predicate on each: `WHERE (status <> 'cancelled')`.** Cancelled rows stop blocking a bay, technician or car. The predicate says "not cancelled" and not "confirmed", so later statuses such as checked in or in progress would still block.
- **Half-open ranges.** `during` is a `tstzrange` stored as `[start, end)`. A check constraint insists on an inclusive start and an exclusive end. So a job ending at 10:00 and a job starting at 10:00 do not clash (REQ-BOOK-002.AC-5).
- **`btree_gist`.** This extension lets the GiST index compare ids with `=`, so "same bay and overlapping time" is one constraint.

**Confirming a booking in PostgreSQL.**

1. Begin a transaction (Read Committed).
2. Insert the idempotency row, or return the saved answer.
3. Load the dealership's day and run the same `checkStart` code.
4. Insert the appointment.
5. If the database raises an exclusion error, roll back to a savepoint, reload and try the next free technician and bay pair. Try at most three times, then answer 409.
6. Insert the outbox rows.
7. Commit.

The code check runs first so that most clashes are caught cheaply. The constraints are the safety net for the race. Serializable isolation is not needed because the constraints catch the race. If it is ever used, the code must retry on SQLSTATE 40001.

If the manager later changes the break, old rows keep the break they were booked with. The code check uses the new value. The constraint stays a safety net.

**Tested.** Ticket A8 (pull request #1) wrote `check.sql` and ran it against `schema.sql` in PostgreSQL 17.11. For this pass it was run again in the `postgres:17` Docker image (PostgreSQL 17.11): the schema loaded with no error and all **20 of 20** checks printed PASS. Those runs settled two claims that were marked unverified: `btree_gist` accepts the `uuid` type, and an exclusion clash raises SQLSTATE 23P01. The checks cover an overlapping insert failing, a cancelled row not blocking, and touching ranges passing.

**Other tables.** Dealership settings and opening hours with date overrides; skills, service types, bays, courtesy cars and technicians with their shift pattern and exceptions; customers and vehicles (personal data); the idempotency table, keyed by actor and key; and the outbox, with a unique dedupe key and ids only (contact details are looked up at send time).

## Time zones

Times are where scheduling goes wrong, so the rules are strict (D-0001-10, AD-9).

- **Every dealership has an IANA time zone**, for example `Europe/London` or `Asia/Ho_Chi_Minh`. The manager picks it from the dealership's location.
- **Opening hours, shifts and reminder times are local** to the dealership. They are stored as local dates and local `HH:mm` times.
- **An appointment is a UTC instant** (start and end) plus the dealership's zone. The instant never moves.
- **The browser's zone is never used**, and neither is a fixed offset such as "+7". The screens format every time with the dealership's zone through one helper.
- **The time zone note is on every customer screen (D-0001-108).** When the viewer's browser is in another zone, the page says once "Times are in London time." under its title. My appointments can hold bookings in two zones; then there is no page note, and each card whose zone differs adds "(London time)" after its time, so no time ever sits next to a wrong zone. The staff booking pages and `adjust` show the same note.
- **Only one folder, `src/domain/time/`, imports the date library.** The rest of the code uses it and plain numbers. Lint rules ban the local `Date` methods elsewhere.
- **DST rules.**
  - A local time that does not exist (the spring-forward gap) **moves later**, to the first real instant.
  - A local time that happens twice (fall back) **uses the earlier one**.
  - Durations are real minutes. A job that spans a clock change is counted right. "48 hours before" is 48 real hours. "The morning of" is 08:00 local on that date.
- **Tests.** The domain, application and contract suites run under `TZ=UTC` and under `TZ=Pacific/Kiritimati`, and must give the same results. Dedicated tests cover a spring-forward day and a fall-back day in `Europe/London`. The run for this pass is in [Results](#results). The end-to-end tests also open the screens with the browser set to `Asia/Ho_Chi_Minh` and to `Europe/London` (`tests/e2e/time-zone-note.spec.ts`).

**The `Europe/London` example dates (2026).**

| Date              | What happens                                                                       | Effect                                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Sunday 2026-03-29 | At 01:00 UTC the clocks jump from 01:00 GMT to 02:00 BST. The day has 23 hours.    | Local 01:30 does not exist. It moves to the first real time after the gap, as the time module defines and tests it. |
| Sunday 2026-10-25 | At 01:00 UTC the clocks go back from 02:00 BST to 01:00 GMT. The day has 25 hours. | Local 01:30 happens twice. We use the earlier one, 01:30 BST, which is 00:30 UTC.                                   |

The seed has at least one zone with DST (`Europe/London`) and one without (`Asia/Ho_Chi_Minh`). The start-time grid is walked in real time from the opening instant, so a DST day keeps the right slots.

## Security and privacy

The full threat model is in `context/security.md` of the work repo. This is the short version.

### Read this first

**The demo has no real security boundary.** The "server" runs inside the user's own browser (D-0000-2). Whoever opens the app can open the developer tools, change the `X-Demo-User` header, edit IndexedDB, change the clock or skip any check. So in the demo, the role and dealership checks **show the rules and make them testable**. They protect nothing against the person at the keyboard.

What we can still do honestly:

- Write the checks once, in the application layer, so a real backend gets them unchanged (AD-3, NFR-2).
- Test every allowed and every denied case. The same tests become the acceptance tests of a real API.
- Keep real mistakes out of the code: personal data in logs, unescaped text, a mock that ships in a real build, a bad library.

Seed data is made up. No real customer data goes in. The new-customer form shows a visible notice in the demo (SEC-13). This document holds no secret, no real person's data and no Keyloop logo (D-0000-4).

Compliance: none is in the requirements, so none is claimed.

### Assets

| Id  | Asset                                                                  | Why it matters                                                      |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------- |
| A1  | Customer personal data: name, phone, email, vehicle registration       | Can identify and contact a person. High sensitivity                 |
| A2  | The appointment diary                                                  | Shows where a person will be, and links a customer to a vehicle     |
| A3  | Manager powers: hours, shifts, policies, moving any appointment        | One wrong change flags or moves many bookings                       |
| A4  | Booking capacity: bays, technicians, courtesy cars                     | Fake or duplicate bookings block real customers                     |
| A5  | The signed-in identity (the Actor: role, customer id, dealership list) | Every other check depends on it                                     |
| A6  | Logs, metrics, traces and the dev panel                                | Must stay free of A1                                                |
| A7  | Outbox messages and the links inside them                              | A link that cancels a booking is a power                            |
| A8  | Idempotency records                                                    | They replay a saved answer, so they must not cross users or hold A1 |
| A9  | The shipped app: bundle, service worker, libraries                     | If it is tampered with, everything above is                         |

### Trust boundaries

| Id   | Boundary                                                           | In the demo                                             | Real backend                                            |
| ---- | ------------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------- |
| TB1  | User and browser (developer tools, storage, clock)                 | None. The user controls everything                      | Still untrusted. The server must not believe the client |
| TB2  | UI and API contract                                                | A code boundary in one browser                          | HTTPS to the API. The client is untrusted               |
| TB3  | Mock handlers and application (the Actor built from `X-Demo-User`) | The one place where identity becomes an Actor           | The Actor is built from a verified token                |
| TB4  | Application and store                                              | The user's own IndexedDB, readable and editable by them | PostgreSQL behind the API                               |
| TB5  | Static host and browser                                            | Files over HTTPS; a service worker is installed         | The same, plus CORS and headers                         |
| TB6  | npm registry and CI, and our build                                 | Libraries enter the bundle                              | The same                                                |
| TB7  | Dealer website to `/book?dealership=…&service=…`                   | Query values are untrusted input                        | The same                                                |
| TB8  | API to SMS and email provider                                      | Not built; the outbox stands in                         | Contact details leave the system                        |
| TB9  | API to telemetry backend                                           | Console and in-memory buffer                            | Collector and log store                                 |
| TB10 | Identity provider and dealer management system                     | Not built; the role switcher stands in                  | External systems whose data we must not trust blindly   |

### Threats by group, and the SEC-n that answers each

| Group                         | Threats                                                                                                                                                                                                                                                                                        | Answered by                                                                                                                                                                                                                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity and roles            | A call with no user or an unknown user is served. A customer sends `role: manager` and is believed. A new endpoint ships with no role check. A customer or staff member calls a manager-only operation                                                                                         | SEC-1: unknown user gets 401. SEC-2: the role comes only from the seeded user record. SEC-3: refuse before reading any data. A matrix test covers every operation, allowed and denied                                                                                             |
| Dealership and customer scope | Staff of one dealership read or change another. One customer reads, cancels or reschedules another's appointment. A customer books for someone else's customer id or vehicle                                                                                                                   | SEC-4: staff and managers act only on their own dealerships. SEC-5: a customer sees only their own records, and a foreign record looks the same as a missing one (404). SEC-6: a customer books only for themselves and their own vehicles                                        |
| Input and errors              | Extra fields change things the caller may not change. Huge strings, long lists, 10-year ranges, one-letter customer searches. A double-click makes two bookings. One user replays another's idempotency key. An error shows a stack or an internal name. A forged `traceparent` fills the logs | SEC-7: every request is checked against the contract, unknown fields are rejected, every size is bounded. SEC-8: the idempotency key is a UUID per user, tied to one method, path and body. SEC-9: fixed error shape, a generic 500, well-formed trace ids only                   |
| Personal data and stored text | A name, phone, email or registration written to a log, metric, trace, error or URL. Stored text such as `<img onerror=…>` runs script in a staff screen. A crafted `/book` link injects text. Staff data stays in memory after a role switch. A reminder link is guessable                     | SEC-10: an allow-list logger and a canary test. SEC-11: all text shown as plain text, never HTML. SEC-12: URL values are looked up, never shown or followed. SEC-13: least browser storage; the cache is cleared on a role switch. SEC-17: outbox messages and links use ids only |
| Build and delivery            | The mock, role switcher, `/_demo/*` or seed ship in a real build. A third-party script runs in the page. A hijacked npm package or a stale worker file                                                                                                                                         | SEC-14: a remote-mode build contains none of the demo parts. SEC-15: load nothing from another origin and ship a Content Security Policy. SEC-16: locked, audited and approved libraries                                                                                          |

Threats that cannot be stopped in a browser-only app are accepted in the demo and listed in the table below: the user changes the clock; the user edits IndexedDB; no audit trail of who made a change; a customer books every free slot; the demo-only endpoints and reset are open to every role.

### Decisions the human made on the security questions

| Decision  | What was decided                                                                                                                                                            | Effect                                                                                                                                                                                                           |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-0000-26 | Staff and managers may search every customer, with a 3-character minimum and at most 10 results, written into the contract                                                  | A real dealer group should decide between this and "only customers with an appointment at my dealerships" with its data owner. The second needs a customer-to-dealership link that the model does not have today |
| D-0000-27 | A request that names one record by id (an appointment, a technician) outside the user's dealerships gets 404. A request that names a dealership directly gets 403           | Records stay hidden. A plain "you may not look at this dealership" hides nothing, because every role can list the dealerships                                                                                    |
| D-0000-28 | The customer search moves to `POST /customers/search`, with the text in the JSON body                                                                                       | No personal data goes into a URL, browser history or an access log                                                                                                                                               |
| D-0000-29 | Fonts are served from the app itself, and the app ships a Content Security Policy (SEC-15)                                                                                  | No outside origin is called. The demo works offline. Playwright can prove it                                                                                                                                     |
| D-0000-30 | The light library checks (SEC-16): a committed lockfile, `npm ci`, `npm audit` for runtime libraries, an approved-list script, pinned CI actions with read-only permissions | Catches the common supply-chain problems for about half an hour of work                                                                                                                                          |

### Known browser messages under the Content Security Policy

The app ships a strict policy with no `'unsafe-inline'` and no `'unsafe-eval'` (SEC-15). The end-to-end tests fail on any policy message, with two exact exceptions the human accepted (D-0001-109, D-0001-110; work repo `context/security.md` section 7 item 6):

- **WebKit and native `<select>`.** WebKit prints "Refused to apply a stylesheet…" once for every native `<select>`. It comes from WebKit itself: a page with only a bare `<select>` and this policy does the same. Nothing the page needs is blocked; a long option is cut at the edge instead of ending in "…". The tests set aside exactly that message, in WebKit only. It was checked in Playwright's WebKit, not in real Safari.
- **Firefox and the mock worker.** Firefox sometimes logs an `InvalidStateError` from the mock service worker while a page moves to the next address. It is set aside by its exact text, in Firefox only, until the bug ticket `2026-10-29-trace-the-firefox-mock-worker-invalidstateerror` traces it and removes the allowance.

Zod's eval probe is turned off (`jitless`), so Firefox no longer reports a blocked `eval` (pull request #30).

### What the mock cannot protect, and what a real backend must do

| In the demo                                                                  | Why it is not protected                                    | A real backend must                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Anyone can pick any role in the switcher or set `X-Demo-User` by hand        | The "server" and the header are both in the user's browser | Sign users in through an identity provider. Check a signed, short-lived token on every call (signature, issuer, audience, expiry). Build the Actor from the token. Ignore `X-Demo-User`. Send the token as `Authorization: Bearer`. Allow CORS for the app's origin only |
| Role and dealership checks run in code the user can edit                     | The user owns the process                                  | Run the same application-layer checks on the server. Also filter every database query by `dealership_id` or `customer_id`, so one missing check does not expose other data. Run the SEC-1 to SEC-6 matrix against the real API unchanged                                 |
| Personal data sits in IndexedDB, readable and editable by the user           | The store is the browser's                                 | Keep customer data only in PostgreSQL on the server: encrypted at rest and in transit, access limited to the API's account, protected backups and a retention rule. Keep no personal data in browser storage                                                             |
| Anyone can change the browser clock                                          | `Clock.now()` runs in the browser                          | Use the server's clock for lead time, horizon, cancel cutoff and reminders                                                                                                                                                                                               |
| Two browsers never share a diary                                             | A local database per browser profile                       | Use the PostgreSQL exclusion constraints and a unique `(actor_id, key)` idempotency row                                                                                                                                                                                  |
| No rate limits: one user could book every free slot or crawl customer search | No server in front                                         | Rate limit by user and address on booking and customer search. Cap future confirmed bookings per customer. Bound page sizes                                                                                                                                              |
| `/_demo/*` is open to every role and can reset the data                      | It exists for the dev panel and Playwright                 | Not exist at all                                                                                                                                                                                                                                                         |
| No audit trail: a change leaves a log line with a role, not a person         | Logs hold the role only                                    | Write an append-only audit record for settings, shift, adjust and cancel actions: who (a user id), what, when, the trace id, and the old and new `version`                                                                                                               |
| Logs go to the user's console                                                | The user can read or clear them                            | Send logs through the collector with the same allowed fields. Make sure servers and proxies do not log query strings. Limit who reads telemetry and set a retention time                                                                                                 |
| The outbox is a table on screen                                              | No message leaves the browser                              | Keep provider keys in a secret store. Send the least data: first name, time, dealership, a link. Make cancel and reschedule links need sign-in, or carry a signed, expiring, single-purpose token                                                                        |
| Seed and test data are made up                                               | Nothing real is ever loaded                                | Never copy production data into a demo or test                                                                                                                                                                                                                           |
| Libraries are checked in CI only                                             | The user's browser runs whatever shipped                   | Add update pull requests, a software bill of materials and signed builds. Use parameterised queries only against PostgreSQL                                                                                                                                              |
| The mock accepts any request that matches the contract                       | The browser is both caller and handler                     | Check every inbound payload from the identity provider, the dealer management system and the dealer website with the same rules as client input                                                                                                                          |

No penetration test or compliance review is planned. The threat model is the whole security work for this assessment.

## Results

Every number here was re-run for this pass on `main` at commit `a4f4c24` (all 30 pull requests merged), on 2026-10-29, on the author's Mac (Apple M3 Pro, Node 22.17.1), after `npm ci`. A number that was not re-run is not quoted. The logs of these runs are kept with the ticket in the work repo.

| What                                              | Result                                                                                                                                                                                                         | Command                                                                                                                                                                     | Target                      |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Unit, component and contract tests (Vitest)       | **1323 passed**, 0 failed, in 61 files                                                                                                                                                                         | `npx vitest run --coverage`                                                                                                                                                 | all pass                    |
| of which contract tests                           | **536 passed**, 0 failed, in 7 files                                                                                                                                                                           | `npx vitest run tests/contract`                                                                                                                                             | all pass                    |
| of which unit and component tests                 | **787 passed** (1323 minus 536)                                                                                                                                                                                | the two commands above                                                                                                                                                      | all pass                    |
| End-to-end tests (Playwright, Chromium)           | **380 passed**, 0 failed, 4 skipped (the 4 video recordings, which run only when `VIDEO_DIR` is set)                                                                                                           | `E2E_PORT=4391 npx playwright test --project=chromium`                                                                                                                      | all pass                    |
| Coverage of `src/domain`                          | lines **99.78%** (449 of 450), branches **99.70%** (330 of 331)                                                                                                                                                | `npx vitest run --coverage`, summed per folder from `coverage/coverage-summary.json`                                                                                        | at least 90% (scorecard S3) |
| Coverage of `src/application`                     | lines **99.83%** (602 of 603), branches **97.73%** (431 of 441)                                                                                                                                                | the same                                                                                                                                                                    | at least 90% (S3)           |
| The same tests in two time zones                  | `TZ=UTC`: **1112 passed** in 40 files. `TZ=Pacific/Kiritimati`: **1112 passed** in 40 files. Same results                                                                                                      | `npm run test:tz` (the Node project: domain, application, infrastructure, API, contract and tooling tests)                                                                  | same results (S4)           |
| One day's search, 10 technicians, 6 bays, 60 jobs | **6.5 ms** (`TZ=UTC`), **11.6 ms** (`TZ=Pacific/Kiritimati`), **18.4 ms** (with coverage turned on)                                                                                                            | `src/domain/availability/availability.timed.test.ts`, inside the three runs above                                                                                           | under 50 ms (S7)            |
| 14-day suggestions, the same day                  | **7.5 ms** (`TZ=UTC`), **5.5 ms** (`TZ=Pacific/Kiritimati`), **20.1 ms** (with coverage turned on)                                                                                                             | the same test                                                                                                                                                               | under 200 ms (S7)           |
| Two-tab race, repeated 5 times                    | **5 of 5 passed**: each time one page booked, the other got the apology, and one appointment was stored                                                                                                        | `npx playwright test tests/e2e/race.spec.ts --project=chromium -g "S1: both press Confirm together" --repeat-each=5`                                                        | one winner every time (S1)  |
| Two-tab race in Firefox and WebKit                | **4 of 4 passed**: the race test, and the test that resets the data and races 5 times, in each browser                                                                                                         | `npx playwright test tests/e2e/race.spec.ts --project=firefox --project=webkit -g "S1: both press Confirm together\|five times"`                                            | one winner every time (S1)  |
| Contact details in logs                           | **0**. A booking with canary name, phone, email and plate leaves no trace in any log line, the log buffer, a metric, an error body or an idempotency row; and none on the dev panel page, opened JSON included | `npx vitest run tests/contract/telemetry.test.ts -t canary`; the Playwright test "no name, phone, email or registration of the canary booking appears anywhere on the page" | 0 (S6)                      |
| Accessibility                                     | **0 axe-core violations** on every route each role can open, at 390 and 1440 px, with no sideways scroll from 320 to 1440 px                                                                                   | the three Playwright tests "NFR-4, NFR-7: every route a … can open has 0 axe violations" in `tests/e2e/whole-app.spec.ts`                                                   | 0 (NFR-4)                   |
| PostgreSQL schema check                           | **20 of 20 PASS** on PostgreSQL 17.11; the schema loads with no error                                                                                                                                          | `psql -v ON_ERROR_STOP=1 -f schema.sql`, then `-f check.sql`, in the `postgres:17` Docker image                                                                             | all pass (AD-18)            |

The search times were measured on this Mac, not on the CI machine, so they show the size of the margin rather than a server figure. Each was a single timed run. Whether to add the times from a CI run is asked in Q-0001-257.

## Pull requests

All in `thienba/keyloop-service-scheduler`. Every one is merged into `main` with a merge commit.

| #   | Ticket                                                                  | Link                                                                | State  |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------- | ------ |
| 1   | PostgreSQL schema for the real backend                                  | [#1](https://github.com/thienba/keyloop-service-scheduler/pull/1)   | Merged |
| 2   | System Design Document (draft)                                          | [#2](https://github.com/thienba/keyloop-service-scheduler/pull/2)   | Merged |
| 3   | Scaffold the app with tokens, lint rules, tests and CI                  | [#3](https://github.com/thienba/keyloop-service-scheduler/pull/3)   | Merged |
| 4   | Domain model and time rules                                             | [#4](https://github.com/thienba/keyloop-service-scheduler/pull/4)   | Merged |
| 5   | Availability check and suggested times                                  | [#5](https://github.com/thienba/keyloop-service-scheduler/pull/5)   | Merged |
| 6   | Repository with in-memory and IndexedDB stores and seed data            | [#6](https://github.com/thienba/keyloop-service-scheduler/pull/6)   | Merged |
| 7   | Book, cancel and reschedule commands                                    | [#7](https://github.com/thienba/keyloop-service-scheduler/pull/7)   | Merged |
| 8   | Manager adjust, hours and shifts commands with flagging                 | [#8](https://github.com/thienba/keyloop-service-scheduler/pull/8)   | Merged |
| 9   | Reminder outbox                                                         | [#9](https://github.com/thienba/keyloop-service-scheduler/pull/9)   | Merged |
| 10  | OpenAPI contract, mock API and typed client                             | [#10](https://github.com/thienba/keyloop-service-scheduler/pull/10) | Merged |
| 11  | README with build, run, test and the AI Collaboration Narrative (draft) | [#11](https://github.com/thienba/keyloop-service-scheduler/pull/11) | Merged |
| 12  | Trace ids, structured logs and metrics                                  | [#12](https://github.com/thienba/keyloop-service-scheduler/pull/12) | Merged |
| 13  | Apply the human's answers to the logic                                  | [#13](https://github.com/thienba/keyloop-service-scheduler/pull/13) | Merged |
| 14  | Demo users list for the role switcher                                   | [#14](https://github.com/thienba/keyloop-service-scheduler/pull/14) | Merged |
| 15  | App shell, role switcher, dealership picker and shared components       | [#15](https://github.com/thienba/keyloop-service-scheduler/pull/15) | Merged |
| 16  | Customer booking screens                                                | [#16](https://github.com/thienba/keyloop-service-scheduler/pull/16) | Merged |
| 17  | Staff schedule: timeline, list and appointment view                     | [#17](https://github.com/thienba/keyloop-service-scheduler/pull/17) | Merged |
| 18  | Manager: dealership settings and technician shifts                      | [#18](https://github.com/thienba/keyloop-service-scheduler/pull/18) | Merged |
| 19  | Manager outbox screen                                                   | [#19](https://github.com/thienba/keyloop-service-scheduler/pull/19) | Merged |
| 20  | Dev panel: logs, metrics and reset                                      | [#20](https://github.com/thienba/keyloop-service-scheduler/pull/20) | Merged |
| 21  | Merge wave 1 screens and apply their answers                            | [#21](https://github.com/thienba/keyloop-service-scheduler/pull/21) | Merged |
| 22  | Staff booking for an existing or new customer                           | [#22](https://github.com/thienba/keyloop-service-scheduler/pull/22) | Merged |
| 23  | Customer appointments: list, cancel and reschedule                      | [#23](https://github.com/thienba/keyloop-service-scheduler/pull/23) | Merged |
| 24  | Manager: adjust an appointment and the flagged list                     | [#24](https://github.com/thienba/keyloop-service-scheduler/pull/24) | Merged |
| 25  | Merge wave 2 screens and apply their answers                            | [#25](https://github.com/thienba/keyloop-service-scheduler/pull/25) | Merged |
| 26  | Courtesy car choice in booking                                          | [#26](https://github.com/thienba/keyloop-service-scheduler/pull/26) | Merged |
| 27  | End-to-end demo scenarios and the two-tab race video                    | [#27](https://github.com/thienba/keyloop-service-scheduler/pull/27) | Merged |
| 28  | Time zone note on every customer screen                                 | [#28](https://github.com/thienba/keyloop-service-scheduler/pull/28) | Merged |
| 29  | Warn early when the chosen time is taken                                | [#29](https://github.com/thienba/keyloop-service-scheduler/pull/29) | Merged |
| 30  | Content Security Policy messages in Firefox and WebKit                  | [#30](https://github.com/thienba/keyloop-service-scheduler/pull/30) | Merged |

## How GenAI was used in design

AI helped design this system. The point of this section is **how I directed it, how I checked it and where I corrected it.** The raw log is `context/ai-collaboration-log.md` in the work repo. Only steps that show directing, checking or correcting the AI are here.

### How the work is run

- Every message I send is saved word for word. The AI turns it into requirements with acceptance criteria and decisions with reasons, and commits them.
- The AI does not decide alone (D-0000-17). When something needs confirming, such as a product rule, a library or a trade-off, it writes a question file with options and a recommendation, and waits. I answer. The libraries in [Technology choices](#technology-choices) were chosen this way.
- When it has to take a reasonable option to keep going, it writes the guess down as a `Q-` file. Those are listed in [Assumptions](#assumptions).
- Claims it could not check are marked `UNVERIFIED`. Several were later settled by a test (see [Claims marked unverified](#claims-marked-unverified)).

### Steps

| Date       | I asked the AI to                                                                                                                                | It gave me                                                                                                                                                          | How I checked it                                                                                                                                                             | Kept, changed or dropped                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-10-28 | Tell me if building the frontend (not the backend) is OK for Scenario A                                                                          | Yes, as long as the scheduling rules stay real: a plain TypeScript module behind a fake API (MSW) and an API contract (OpenAPI)                                     | My own judgement on the trade-off                                                                                                                                            | **Kept** (D-0000-2, D-0000-3)                                                                                                              |
| 2026-10-28 | Write down how I see the problem: customers book, staff check the schedule, the manager adjusts it, and the app suggests another time on a clash | Requirements REQ-BOOK-004 and REQ-BOOK-005, decisions D-0001-1 and D-0001-2                                                                                         | I read them against the brief. The AI had assumed only a service advisor uses the app                                                                                        | **Changed** by me: three kinds of user, not one                                                                                            |
| 2026-10-28 | Add technician shifts, opening hours that each dealership can set (and change for a single day), and let the manager edit shifts                 | REQ-BOOK-006 to 008, decisions D-0001-3 to D-0001-5                                                                                                                 | The AI had assumed one garage with fixed hours. I told it that was wrong                                                                                                     | **Changed** by me: several dealerships, flexible hours                                                                                     |
| 2026-10-28 | Look at how the big scheduling systems work and tell me what we are missing                                                                      | `research.md`: every claim links to a page it read, anything unchecked is marked `UNVERIFIED`, and a list of 17 gaps                                                | I looked at the sources. The AI dropped one page because it did not say what the search result claimed. It also said most vendor pages are marketing                         | **Kept**. The 5 must-have gaps went into the requirements. One source was **dropped**                                                      |
| 2026-10-28 | Work out what happens when two people book the same slot at the same time                                                                        | D-0001-6 and REQ-BOOK-009: the first the server gets wins; the other gets a polite "sorry, just taken" and other times; a double-click books once                   | The rule was mine ("first one wins, tell the second one nicely"). I checked the AI's database advice against the PostgreSQL docs it cited                                    | **Kept**                                                                                                                                   |
| 2026-10-28 | Add "wait, drop off or courtesy car", rest breaks, lead time and horizon, customer cancel and reschedule, and reminders                          | REQ-BOOK-010 to 013, decisions D-0001-7 to D-0001-9                                                                                                                 | The AI first suggested reminders 24 hours and 2 hours before. After checking Keyloop's own advice, it changed them to 48 hours before and the morning of                     | **Changed**: reminder times. The rest breaks were my idea, for staff wellbeing                                                             |
| 2026-10-28 | Help me pick where to store data in a frontend-only app                                                                                          | D-0000-8: sample data in JSON, real data in IndexedDB, all behind one interface                                                                                     | We compared four options on two things: does data survive a reload, and does it stop two tabs booking the same slot                                                          | **Kept**                                                                                                                                   |
| 2026-10-28 | Let staff book for a customer, either someone we already have or a new person                                                                    | REQ-BOOK-014, decision D-0001-12                                                                                                                                    | The AI first suggested existing customers only. I asked for new customers too                                                                                                | **Changed** by me: new customers allowed                                                                                                   |
| 2026-10-28 | Design the architecture, and mark every claim it could not check                                                                                 | `architecture.md` with three candidates scored, 19 decisions, and nine claims marked `UNVERIFIED`                                                                   | I chose the libraries and the design direction from its options (D-0000-18 to D-0000-25, D-0001-13). The two PostgreSQL claims were tested by running the schema (ticket A8) | **Kept**. The two PostgreSQL claims are now **settled** by that test                                                                       |
| 2026-10-28 | Draw design directions for the screens                                                                                                           | Two directions as clickable pages: A, "Front desk" (light, a day strip, time chips, a booking summary), and B (dark, a month grid, free gaps on the staff timeline) | I looked at both direction pages side by side                                                                                                                                | **Changed** by me: A, plus B's free gaps on the staff timeline; the rest of B dropped (D-0001-13)                                          |
| 2026-10-28 | Build a clickable prototype of every flow before any screen is coded                                                                             | One prototype page stitching the customer, staff and manager flows, with the shared parts, the words and the phone and desktop rules (design.md)                    | I reviewed the prototype (its second version) and approved all of it                                                                                                         | **Kept**: approved (D-0001-44). The screens were built to it                                                                               |
| 2026-10-28 | (The approved design gave "Book for a customer" to staff only)                                                                                   | The AI had written the manager without a way to book for a customer                                                                                                 | I said the manager must be able to book too, for example when a customer phones in. The AI then asked where the button goes, and I took its recommendation                   | **Changed** by me: the manager books from a "Book for a customer" button on Schedule (D-0001-53, D-0001-54 B)                              |
| 2026-10-29 | Fix a staff member linked to two dealerships, whose free-gap link booked at the wrong one                                                        | Three options, each keeping the two-site staff user and changing links or look-ups                                                                                  | I read the options and chose none of them: each staff member works at one dealership only                                                                                    | **Changed** by me: the two-site staff user removed; the cross-dealership tests use a staff member of one site trying the other (D-0001-89) |
| 2026-10-29 | Make the flag reasons say whose shift it is ("Ends after Demo's shift" named no one)                                                             | Three options: keep the rule, rename the sample technicians, or use the full name                                                                                   | I asked for real-sounding names                                                                                                                                              | **Changed** by me: technicians renamed, such as Oliver Hughes and Minh Tran (D-0001-87)                                                    |
| 2026-10-29 | Can a time be held while the customer fills in the form? (my question)                                                                           | Three options: no hold; a soft hold of about 5 minutes; no hold but an early warning. Costs of each written out                                                     | I weighed the costs and took the early warning; the hold is written here as a considered extension                                                                           | **Kept** the recommendation: early warning built and tested in `tests/e2e/early-warning.spec.ts` (D-0001-107)                              |

Corrections by me: three kinds of user, several dealerships with flexible hours, new customers for staff bookings, the mix of design directions, the manager booking for a customer, one dealership per staff member and real-sounding technician names. Corrections the AI made after checking a source: the reminder times, and the dropped research page.

## Assumptions

Where a requirement was unclear, we took a reasonable option and wrote it down. Nothing here contradicts the brief.

### Assumptions of the architecture

1. **"Real-time" means checked live at request and at confirm.** A booking is checked when a user asks and again inside the confirm. Other people's bookings are not pushed to open screens; the booking pages re-check the chosen time every 30 seconds instead (D-0001-107). Telling other tabs to refresh with `BroadcastChannel` is a possible later step.
2. **Persistence is per browser profile in this mock.** Data and the "server" live in one browser profile. Tabs of that browser share it. Two different browsers or devices do not. The PostgreSQL design is how a real deployment shares one diary.
3. A job fits in one local day, one technician, one bay and one continuous work segment. The shift break follows Q-0001-10.
4. Duration comes from the service type and is real minutes (Q-0001-2).
5. Role checks in the demo show the rules. They are not security, because everything runs in the user's browser.
6. Seed data is made up. No real personal data is stored.
7. A reschedule keeps the same appointment id and raises its `version`.
8. Only successful booking writes save an idempotency record. A failed attempt can be retried with the same key.
9. Metric names and the proposed targets are our own proposals, not sourced.
10. Each staff member works at one dealership. A manager's dealerships are a list on their user record (D-0001-14, D-0001-89).

### Known gaps

- **One car can have two appointments at the same time** (D-0001-27 A). Nothing checks the vehicle, only the bay, the technician and the courtesy car. It was left out for the deadline; a check on the vehicle is a small later addition.
- **The manager's entry point for booking is no longer open.** The manager books from the "Book for a customer" button on Schedule (D-0001-54 B), with the staff screens reused.
- **No time is held** while a person fills in the form; the page warns early instead (D-0001-107, see [Concurrency](#concurrency-no-hold-and-an-early-warning)).
- **Two browser messages are set aside** in the policy tests, one in WebKit and one in Firefox (see [Known browser messages](#known-browser-messages-under-the-content-security-policy)). The Firefox one has a bug ticket still to do.

### Questions where we took an option

Each of these 13 `Q-` files is still open in the work repo when this pass is written: the option was taken on 2026-10-28 as provisional, and no decision file resolves it. The option taken is the one the design and the code use, and the tests cover it. The last column names later decisions that build on the option without answering the question itself. Whether to confirm them all is asked in Q-0001-256.

| Id        | Question                                                                             | Option taken                                                                                                                                                                                                                          | Reason                                                                                                                                                              | Later decisions that build on it                                      |
| --------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Q-0001-1  | What makes a technician "qualified"?                                                 | A: each technician has a set of skills, each service type requires one skill                                                                                                                                                          | The simplest model that makes "qualified" testable. Levels or brand certificates can be added on top                                                                | None                                                                  |
| Q-0001-2  | Where does a service's duration come from?                                           | A: a fixed duration per service type                                                                                                                                                                                                  | The brief names only the service type as an input                                                                                                                   | None                                                                  |
| Q-0001-7  | What can the manager adjust?                                                         | A: change the time, reassign the technician or bay, and cancel. Each change re-runs the check. Hours and shifts were added later (Q-0001-12, D-0001-5)                                                                                | These are the day-to-day changes and all of them reuse the availability engine. Editing bays and skills stays out                                                   | D-0001-19 (staff cannot cancel)                                       |
| Q-0001-9  | How does a user become customer, staff or manager?                                   | A: a role switcher picks a seeded user. The mock checks the role on each call                                                                                                                                                         | Real login is out of scope for a mock backend, but the role rules must be testable. See [Security and privacy](#security-and-privacy) for how real auth replaces it | D-0001-89 (one dealership per staff member)                           |
| Q-0001-10 | How are technician shifts modelled?                                                  | A: a weekly pattern plus date exceptions (leave, extra shift), edited by the manager                                                                                                                                                  | How garages plan shifts, and it gives the tests real edge cases (a break, a day off)                                                                                | D-0001-5 settles who edits shifts (the manager), not the model        |
| Q-0001-11 | On what grid can an appointment start?                                               | A: 15 minutes, the same for every dealership                                                                                                                                                                                          | Keeps the search finite and suggestions readable. A per-dealership grid is easy to add later                                                                        | None                                                                  |
| Q-0001-12 | What happens to appointments when a day's hours are cut?                             | A: the change is saved and affected appointments are flagged for the manager, never deleted                                                                                                                                           | Keeps the manager in control without losing bookings (AD-14)                                                                                                        | D-0001-36 (warn before saving)                                        |
| Q-0001-13 | Does "design system" research mean system design or UI design?                       | A: system design first, with a short UI part                                                                                                                                                                                          | It is what the brief's Part 1 asks for, and the brand tokens already exist                                                                                          | None                                                                  |
| Q-0001-18 | Is a courtesy car a limited resource?                                                | A: yes, each dealership has a fleet and a car must be free for the whole job. With none free, the customer can still wait or drop off                                                                                                 | It reuses the "free for the whole duration" rule                                                                                                                    | D-0001-7 (wait, drop-off or courtesy car)                             |
| Q-0001-19 | What are the default policy values, who sets them, and does the break apply to bays? | A: per dealership, set by the manager. Lead time 2 hours, horizon 30 days, a 15-minute break after each technician job. Bays need no break                                                                                            | The break is staff rest, and settings match the per-dealership design                                                                                               | D-0001-8 (policies exist)                                             |
| Q-0001-20 | Until when can a customer cancel or reschedule alone?                                | A: until the dealership's minimum lead time before the start, boundary included (D-0001-22)                                                                                                                                           | It reuses a setting the dealership already has                                                                                                                      | D-0001-22 a (the boundary is included)                                |
| Q-0001-21 | When are reminders sent?                                                             | A: a confirmation at booking, a reminder 48 hours before, and a final one the morning of (08:00 local, or 2 hours before if the job starts at or before 08:00, D-0001-22)                                                             | It follows Keyloop's own published advice. The first idea, 24 hours and 2 hours, came before this source was checked                                                | D-0001-22 d, e (early jobs, cancelled reminders)                      |
| Q-0001-23 | What does a new customer need, and what if they already exist?                       | A: full name, phone, and the vehicle's registration, make and model are required; email and year are optional. A matching phone or registration is shown to staff to reuse. The customer is stored only when the booking is confirmed | The booking needs a vehicle, duplicates break "find them next time", and storing on confirm avoids orphan records                                                   | D-0001-18 (field checks), D-0001-22 g (duplicates shown, not refused) |

### Decisions the human made after the questions

These were open at first and are now decided. They are decisions, not assumptions.

- D-0001-13: design direction A (Front desk) plus B's free gaps on the staff timeline.
- D-0001-14: staff and managers work for the dealerships on their user record (a list, so "all" is a one-line change). Later narrowed by D-0001-89: a staff member has one dealership.
- D-0001-15: the least busy qualified technician is picked, then the first free bay by name (D-0001-22).
- D-0001-16: up to five suggestions, up to 14 days ahead, nearest first.
- D-0001-17: the outbox adds a "moved" message when the manager moves an appointment.
- D-0001-18: new customer fields get simple checks that reject obvious typing mistakes.
- D-0001-19: staff cannot cancel or reschedule a customer's appointment; the manager can.
- D-0001-20: a free gap on the timeline starts a booking with that technician.
- D-0001-21: free gaps are worked out in one place in the domain, with a 30-minute minimum.
- D-0000-26 to D-0000-30: see [Security and privacy](#security-and-privacy).
- D-0000-31: the Temporal polyfill is `@js-temporal/polyfill`.

Decided later, while the screens were designed and built (the latest decisions are D-0001-64 to D-0001-111; they win over older text):

- D-0001-27 A: one car can have two appointments at the same time, written down as a known gap.
- D-0001-44: the human approved the whole design prototype.
- D-0001-53 and D-0001-54 B: the manager books for a customer, from the "Book for a customer" button on Schedule.
- D-0001-63 B: the decision and question files are copied into the product repo so a reviewer can follow an id (done in the README pass).
- D-0001-87: the sample technicians have real-sounding names.
- D-0001-89: each staff member works at one dealership; there is no two-site staff user.
- D-0001-94: customers see their past appointments.
- D-0001-101 and D-0001-102: both availability calls take an optional `appointmentId`.
- D-0001-107: no time is held; the page warns early. The soft hold is a considered extension.
- D-0001-108: the time zone note is on every customer screen; a list in two zones notes each card instead.
- D-0001-109 and D-0001-110: the two known browser messages under the Content Security Policy.
- D-0001-111 C: on `adjust`, an early clash is titled "That time is no longer free."

### Claims marked unverified

Claims 1 to 9 were marked `UNVERIFIED` in the architecture; claims 10 to 13 came up while the screens were built. This table says whether a test has since settled each one, and names the test or the run.

| #   | Claim                                                                                                          | Status                                                                                                                                                                                                                                                                                                   |
| --- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | IndexedDB runs read-write transactions whose stores overlap one at a time, also across tabs of the same origin | **Settled in practice** in Chromium, Firefox and WebKit (Playwright's engines): the two-tab race gave one winner 5 times out of 5 in Chromium, and passed in Firefox and WebKit, in the runs for this pass (`tests/e2e/race.spec.ts`, see [Results](#results)). Not checked in real Safari or on a phone |
| 2   | MSW in the browser runs request handlers in the page, not inside the service worker                            | **Open.** No test checks where the handlers run. Nothing in the design depends on it any more: the race test above passes either way                                                                                                                                                                     |
| 3   | Dexie commits a transaction when code inside it awaits a promise that is not Dexie's                           | **Open.** AD-7 and the store's guarantee 4 (a write unit awaits only store calls) rule the case out either way                                                                                                                                                                                           |
| 4   | Pages in one Playwright browser context share IndexedDB, and separate contexts do not                          | **Settled** for the first half by the same race test: its two pages of one context see one diary, so only one booking is stored. The second half is not tested directly                                                                                                                                  |
| 5   | PostgreSQL reports an exclusion-constraint violation as SQLSTATE 23P01                                         | **Settled** by `docs/postgres/check.sql` on PostgreSQL 17.11, re-run for this pass: 20 of 20 checks passed                                                                                                                                                                                               |
| 6   | `btree_gist` supports the `uuid` type                                                                          | **Settled** by the same run: the schema loads with `uuid` columns in the constraints                                                                                                                                                                                                                     |
| 7   | SharedWorker support on mobile Chrome and Safari                                                               | **Open, and not needed.** It matters only for candidate C, which was not chosen                                                                                                                                                                                                                          |
| 8   | Which browsers ship Temporal natively, and the polyfill's size                                                 | **Open.** The app uses `@js-temporal/polyfill` everywhere (D-0000-31), so native support does not change behaviour. Its size was not measured                                                                                                                                                            |
| 9   | Free plans of static hosts; GitHub Pages on a private repo needs a paid plan                                   | **Open.** The host is chosen last (D-0000-25)                                                                                                                                                                                                                                                            |
| 10  | Playwright's `page.route` can stand in for the mock to fake a failure (D-0001-58)                              | **Settled: it cannot.** The test "remote proof: page.route does not see calls the service worker answers" in `tests/e2e/shell.spec.ts` passed in the run for this pass. The tests use their own switch in the mock to cause failures and slow answers instead                                            |
| 11  | A `<meta>` Content Security Policy is honoured by the page in the target browsers                              | **Settled** for the page in Chromium, Firefox and WebKit against the built app (pull request #30). Whether a `<meta>` policy covers the service worker script is **open**; a real header is added at hosting time (SEC-15.AC-4)                                                                          |
| 12  | The WebKit "Refused to apply a stylesheet" message under the policy comes from WebKit itself                   | **Settled** in Playwright's WebKit: a page with only a bare `<select>` shows it (D-0001-109). **Open** in real Safari                                                                                                                                                                                    |
| 13  | Where the Firefox `InvalidStateError` from the mock worker comes from                                          | **Open.** Set aside by its exact text in Firefox only; ticket `2026-10-29-trace-the-firefox-mock-worker-invalidstateerror` is still to do (D-0001-110)                                                                                                                                                   |

Other points from the research that are not settled:

- Which business metrics booking systems track is based on marketing pages only. No source gave a published target or SLO for a booking system.
- Vendor evidence is mostly marketing, and some help centres could not be fetched.
- The 20 to 24 percent no-show figure is second-hand.
- Two further checks are noted in the library plan (D-0000-30): whether `npm ci --ignore-scripts` works with this tool set, and how the service worker file check is run.

## Out of scope

These were left out on purpose. Several are named as extensions of the design.

- Recalls and VIN lookup.
- Service menus and pricing.
- Deposits.
- Check-in and vehicle inspection.
- Parts availability.
- Two-way sync with a dealer management system (DMS).
- Jobs longer than one day, jobs with more than one technician or bay, and split jobs. A job is one day, one technician, one bay and one continuous work segment.
- Waitlists and deliberate overbooking.
- Real sign-in and real roles. The demo uses a role switcher. Real auth is described in [Security and privacy](#security-and-privacy).
- Real SMS and email. Reminders go to a mocked outbox.
- Slot holds with an expiry. Cal.com holds a slot for 5 minutes by default. A soft hold is a considered extension, with when it would be worth it and its costs, in [Concurrency](#concurrency-no-hold-and-an-early-warning).
- A real backend service and a real database. They are described, not built.
- Quiet-hours pricing, reporting dashboards and abandoned-booking export.
- Live push of other people's bookings to an open screen. `BroadcastChannel` is a possible later step.
- A Keyloop logo or wordmark (D-0000-4).
