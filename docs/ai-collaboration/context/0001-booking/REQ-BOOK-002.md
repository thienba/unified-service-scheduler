---
type: requirement
title: Real-time availability of a bay and a qualified technician
priority: P1
---
Before it confirms an appointment, the system shall check that both a ServiceBay and a Technician qualified for the service type are free for the entire service duration at the chosen dealership (brief, Scenario A, requirement 2: Real-Time Availability Check). A technician is free only inside their shift (REQ-BOOK-006) and inside the branch's opening hours (REQ-BOOK-007).

- REQ-BOOK-002.AC-1: Given a bay and a qualified technician both free from the start to start + duration, When the check runs, Then it reports available and names one bay and one technician.
- REQ-BOOK-002.AC-2: Given every qualified technician has an appointment overlapping any part of the interval, When the check runs, Then it reports unavailable, even if a bay is free.
- REQ-BOOK-002.AC-3: Given every bay is occupied for any part of the interval, When the check runs, Then it reports unavailable, even if a qualified technician is free.
- REQ-BOOK-002.AC-4: Given a free technician who is not qualified for the service type, When the check runs, Then that technician is never chosen.
- REQ-BOOK-002.AC-5: Given an existing appointment that ends exactly when the requested one starts, When the check runs, Then the two do not count as overlapping (half-open intervals).
- REQ-BOOK-002.AC-6: Given a bay or technician at a different dealership, When the check runs, Then it is never chosen.
