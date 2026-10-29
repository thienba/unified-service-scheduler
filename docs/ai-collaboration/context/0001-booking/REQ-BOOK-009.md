---
type: requirement
title: Two confirms for the same slot
priority: P1
---
When two users confirm bookings that need the same bay or technician at overlapping times, the system shall confirm only the one it accepts first and shall tell the other user, politely, that the time was just taken and suggest other times (the human: "know who submitted first and who second, and tell the second person politely", D-0001-6).

- REQ-BOOK-009.AC-1: Given a time that has one free qualified technician and one free bay, When two confirms for it arrive one after the other, Then the first is confirmed and the second gets a conflict answer (HTTP 409) and no appointment.
- REQ-BOOK-009.AC-2: Given the second user gets the conflict, When the answer is shown, Then it apologises that the time was just taken, keeps everything they entered, and offers other available times (D-0001-2).
- REQ-BOOK-009.AC-3: Given a user saw a time as free earlier, When they confirm after someone else took it, Then the check re-runs at confirm and they get the same conflict answer.
- REQ-BOOK-009.AC-4: Given a user double-clicks Confirm or the request is retried, When the same confirm (same idempotency key) arrives twice, Then only one appointment exists and both answers return it.
- REQ-BOOK-009.AC-5: Given a time with two free qualified technicians and two free bays, When two confirms arrive, Then both are confirmed with different technicians and bays.
