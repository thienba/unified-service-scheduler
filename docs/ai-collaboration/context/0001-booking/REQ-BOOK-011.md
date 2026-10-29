---
type: requirement
title: Branch scheduling policies (lead time, horizon, break between jobs)
priority: P1
---
The system shall apply each branch's minimum lead time, maximum booking horizon and break between a technician's jobs to every availability check and suggestion, so that technicians get rest between jobs (the human: "a minimum lead time, a furthest booking date, and a break between jobs ... to balance staff rest and productivity", D-0001-8).

- REQ-BOOK-011.AC-1: Given a branch with a 2-hour minimum lead time, When a time 1 hour from now is requested, Then it is refused and suggestions start no earlier than 2 hours from now.
- REQ-BOOK-011.AC-2: Given a branch with a 30-day horizon, When a time 31 days ahead is requested, Then it is refused and no suggestion lies beyond 30 days.
- REQ-BOOK-011.AC-3: Given a branch with a 15-minute break and a technician whose job ends at 10:00, When a job starting at 10:00 or 10:10 is checked, Then that technician is not chosen; from 10:15 they can be.
- REQ-BOOK-011.AC-4: Given the break, When a job ends exactly at the end of the technician's shift, Then no break is needed after it.
- REQ-BOOK-011.AC-5: Given the manager changes a branch's policies, When later checks run, Then the new values apply; booked appointments are not changed.
