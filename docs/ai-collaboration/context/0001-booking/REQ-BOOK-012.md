---
type: requirement
title: The customer cancels or reschedules their own appointment
priority: P1
---
When a customer cancels or reschedules one of their own appointments before the cutoff (Q-0001-20), the system shall apply it, re-checking availability for a reschedule, and a cancelled appointment shall no longer block its technician, bay or courtesy car (D-0001-9).

- REQ-BOOK-012.AC-1: Given a customer's confirmed appointment before the cutoff, When they cancel it, Then its status becomes cancelled, it disappears from their upcoming list, and its technician, bay and courtesy car are free for other bookings.
- REQ-BOOK-012.AC-2: Given a customer's confirmed appointment, When they reschedule to a free time, Then the new time is confirmed and only then the old time is released.
- REQ-BOOK-012.AC-3: Given a customer reschedules to a time someone else takes first, When their confirm arrives, Then it gets the conflict answer of REQ-BOOK-009 and their original appointment is unchanged.
- REQ-BOOK-012.AC-4: Given an appointment after the cutoff, When the customer tries to cancel or reschedule, Then the action is refused with a message to contact the branch.
- REQ-BOOK-012.AC-5: Given another customer's appointment, When a customer tries to see, cancel or reschedule it, Then the system refuses.
