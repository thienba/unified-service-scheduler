---
type: requirement
title: Persist a confirmed appointment
priority: P1
---
When the availability check succeeds and the user confirms, the system shall create a persistent Appointment record that associates the customer, the vehicle, the technician and the service bay (brief, Scenario A, requirement 3: Confirmed Appointment Record).

- REQ-BOOK-003.AC-1: Given a successful check, When the user confirms, Then an Appointment is stored with customer, vehicle, technician, bay, dealership, service type, start and end, and the user sees its confirmation.
- REQ-BOOK-003.AC-2: Given a stored Appointment, When the page is reloaded, Then the appointment is still there (the mock store persists across reloads).
- REQ-BOOK-003.AC-3: Given a stored Appointment, When the same technician or bay is checked for an overlapping interval, Then the check reports them as busy.
