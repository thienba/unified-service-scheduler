---
type: requirement
title: The manager manages technician shifts
priority: P2
---
When the garage manager edits a technician's shifts (weekly pattern or a date exception), the system shall save them and use them in every later availability check (the human: "the admin also manages the staff work schedules", D-0001-5, REQ-BOOK-006).

- REQ-BOOK-008.AC-1: Given a technician with no shift on a date, When the manager adds a shift that covers a requested interval, Then the check can choose that technician for it.
- REQ-BOOK-008.AC-2: Given a technician on shift, When the manager marks them on leave for a date, Then the check never chooses them on that date.
- REQ-BOOK-008.AC-3: Given the user is a customer or garage staff, When they open the shift screen or call the shift API, Then they cannot edit shifts.
- REQ-BOOK-008.AC-4: Given booked appointments that fall outside a technician's shifts after an edit, When the edit is saved, Then those appointments are handled as Q-0001-12 takes for branch hours (flagged for the manager, never deleted silently).
