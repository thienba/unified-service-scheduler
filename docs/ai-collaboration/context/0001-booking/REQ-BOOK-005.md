---
type: requirement
title: The garage manager views and adjusts appointments
priority: P1
---
When the garage manager adjusts an appointment, the system shall apply the change only if a bay and a qualified technician are still free for the whole duration (REQ-BOOK-002), and shall otherwise suggest other times (the human: "the garage manager can also view and adjust", D-0001-1, D-0001-2). What counts as an adjustment is Q-0001-7.

- REQ-BOOK-005.AC-1: Given a confirmed appointment, When the manager moves it to a time where a bay and a qualified technician are free, Then the appointment is updated and the schedule shows the new time.
- REQ-BOOK-005.AC-2: Given a confirmed appointment, When the manager moves it to a time that clashes, Then the change is refused and other available times are suggested.
- REQ-BOOK-005.AC-3: Given the user is a customer or garage staff, When they try to adjust an appointment, Then the manager's adjust actions (reassigning technician or bay, moving any customer's appointment) are not available to them; a customer's own cancel and reschedule is REQ-BOOK-012.
