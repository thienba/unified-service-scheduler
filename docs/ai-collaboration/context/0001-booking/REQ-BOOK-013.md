---
type: requirement
title: Confirmation and reminders in a mocked outbox
priority: P2
---
The system shall queue a confirmation when an appointment is booked and reminders before it, show them in a mocked outbox, and keep them in step with cancels and reschedules; no real SMS or email is sent (D-0001-9). The reminder times are Q-0001-21.

- REQ-BOOK-013.AC-1: Given an appointment is confirmed, When the outbox is opened, Then it holds a confirmation message and the scheduled reminders, each with links to cancel or reschedule.
- REQ-BOOK-013.AC-2: Given a branch time zone (Q-0001-16), When reminder times are computed, Then they are in the branch's local time, also across a DST change.
- REQ-BOOK-013.AC-3: Given an appointment is cancelled, When the outbox is opened, Then its pending reminders are cancelled and a cancellation message is queued.
- REQ-BOOK-013.AC-4: Given an appointment is rescheduled, When the outbox is opened, Then its reminders follow the new time and no reminder for the old time remains.
- REQ-BOOK-013.AC-5: Given the same message is queued twice (a retry), When the outbox is opened, Then it appears once.
