# Overview: Unified Service Scheduler

A submission for the assessment, **Scenario A: The Unified Service Scheduler** (domain: Ownership). It is an appointment scheduler that replaces manual booking for dealership service departments. The full brief is in [brief.md](brief.md).

## What gets built
- **Frontend fully built, backend mocked** ([D-0000-2](decisions/D-0000-2.md)).
- A **customer** books a service appointment for a vehicle, a service type, a branch (the brief's dealership; there are several, each with configurable hours, [D-0001-3](0001-booking/D-0001-3.md), [D-0001-4](0001-booking/D-0001-4.md)) and a desired time; **garage staff** check the schedule; the **garage manager** views and adjusts appointments ([D-0001-1](0001-booking/D-0001-1.md)). A booking or adjustment is confirmed only when a ServiceBay **and** a qualified Technician are free for the whole duration; otherwise other times are suggested ([D-0001-2](0001-booking/D-0001-2.md)). A confirmed Appointment links the customer, vehicle, technician and bay. See [0001-booking](0001-booking/index.md).

## Deliverables (from the brief)
1. A System Design Document: an architecture diagram, each component's role, the data flow, technologies with justifications, observability, and a section on how GenAI was used in design. Unclear points are written down as assumptions.
2. The product repo: a README with build/run/test steps, an **AI Collaboration Narrative** section, and a test suite for the core business logic.
3. A 5–10 minute video: intro, design and implementation highlights, the AI story (1–2 min), a demo, and lessons learned.

## Evaluation (from the brief)
Problem solving and system design; technical execution (quality, correctness, tests); **AI engineering and verification (a primary criterion)**; communication and presentation.

## Non-functional requirements
- NFR-1: Scalability, performance, reliability, maintainability and observability are considered in both the design and the code (from the brief, "Build For the Future").
- NFR-2: The scheduling rules sit behind an API contract (OpenAPI), so a real backend can replace the mock with no UI changes ([D-0000-3](decisions/D-0000-3.md)).
- NFR-3: The core business logic has its own test suite (from the brief).
- NFR-4: The UI follows the visual language of a public dealer-software website ([D-0000-4](decisions/D-0000-4.md)) and meets WCAG 2.1 AA contrast.
- NFR-5: Every AI-assisted step is logged with how it was checked ([ai-collaboration-log.md](ai-collaboration-log.md)), as raw material for the narrative and the video.
- NFR-6: Observability: the scheduling module and the mock API write structured logs (JSON, with the request's `traceId`, the branch and the outcome, never customer contact details); every request carries a `traceId`; a few metrics are counted (slot-search latency, bookings confirmed, 409 conflicts, empty searches) and visible in a small dev panel; the System Design Document maps them to OpenTelemetry logs, metrics and traces and Google SRE's golden signals for the real backend (the human: "Ok", research.md Q5).
- NFR-7: Every screen is mobile responsive, for all three roles: it works from 360 px wide (phone) up to desktop with no sideways page scroll, touch targets of at least 44 px, and layouts designed for the phone, not only squeezed (for example the staff timeline becomes a list or a one-technician view on a phone). Each screen in the design has a phone and a desktop version, and every screen PR shows both (D-0000-13). (The human: "The design needs to be mobile responsive", (the human's original message is kept in the private work repo).)

## Deadline and build order
End of this week (2026-11-01), sooner is better; build order in [D-0000-9](decisions/D-0000-9.md).

## Out of scope
- A real backend service or a real database. The brief allows mocking the layer that isn't chosen.
- The company's logo or wordmark ([D-0000-4](decisions/D-0000-4.md)).
