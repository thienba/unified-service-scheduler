---
type: requirement
title: How the customer handles the car (wait, drop off, courtesy car)
priority: P2
---
When a customer books, the system shall record whether they wait on site, drop the car off, or borrow a courtesy car, and shall show it to garage staff and the manager (the human: "waiting on site, dropping the car off, or borrowing a courtesy car", D-0001-7).

- REQ-BOOK-010.AC-1: Given the booking form, When the customer confirms, Then exactly one of wait, drop-off or courtesy car is chosen and stored on the appointment.
- REQ-BOOK-010.AC-2: Given confirmed appointments, When staff open the schedule, Then each shows its choice.
- REQ-BOOK-010.AC-3: Given the customer chose courtesy car, When the check runs, Then a courtesy car is handled as Q-0001-18 takes (free for the whole duration at that branch).
