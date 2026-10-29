---
type: requirement
title: Request a service appointment
priority: P1
---
When a user requests a service appointment, the system shall take a specific vehicle, a service type, a dealership and a desired start time (brief, Scenario A, requirement 1: Resource Constrained Booking).

- REQ-BOOK-001.AC-1: Given a known customer with a vehicle, When the user picks a dealership, a service type and a desired time and submits, Then the system runs the availability check (REQ-BOOK-002) for exactly that vehicle, service type, dealership and time.
- REQ-BOOK-001.AC-2: Given a request with any of vehicle, service type, dealership or time missing, When the user submits, Then the system does not run the check and shows which field is missing.
