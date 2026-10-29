---
type: requirement
title: Technician shifts and booked time
priority: P1
---
The system shall hold each technician's work shifts and the times each technician is already booked, and a technician shall count as free only for an interval that lies wholly inside one of their shifts and overlaps none of their appointments (the human: "we need data on staff work shifts and on when staff are already booked"). The shift model is Q-0001-10.

- REQ-BOOK-006.AC-1: Given a qualified technician whose shift covers the whole interval and who has no overlapping appointment, When the check runs, Then that technician can be chosen.
- REQ-BOOK-006.AC-2: Given a qualified technician whose shift ends before the job would end, When the check runs, Then that technician is not chosen, even if the garage is still open.
- REQ-BOOK-006.AC-3: Given a qualified technician who is not on shift that day, When the check runs, Then that technician is not chosen.
- REQ-BOOK-006.AC-4: Given a technician with appointments, When the system lists that technician's booked time for a day, Then it returns exactly those appointments' intervals.
- REQ-BOOK-006.AC-5: Given every qualified technician is off shift or booked at the desired time, When the user requests it, Then other times are suggested (D-0001-2), and only times inside a qualified technician's shift.
