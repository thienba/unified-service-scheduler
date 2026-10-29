---
type: requirement
title: Configurable opening hours per branch
priority: P1
---
The system shall hold opening hours per branch as a weekly pattern plus date-specific overrides that extend, shorten or close a day, and an appointment shall fit wholly inside the opening hours of its branch on its date (the human: "hours could be configured per branch; some branches may have different hours, and on some days a shop may open longer or shorter", D-0001-3, D-0001-4). A technician is free only where branch hours and their own shift (REQ-BOOK-006) both cover the interval.

- REQ-BOOK-007.AC-1: Given two branches with different weekly hours, When the same desired time is checked at each, Then each branch's own hours decide whether it fits.
- REQ-BOOK-007.AC-2: Given a date override that extends a branch's closing time, When a job ends inside the extended hours, Then it can be booked (if a bay and a qualified technician on shift are free).
- REQ-BOOK-007.AC-3: Given a date override that shortens a branch's hours, When a job would end after the new closing time, Then it is refused and other times are suggested.
- REQ-BOOK-007.AC-4: Given a date override that closes a branch for the day, When any time on that date is requested there, Then it is refused and no time on that date is suggested.
- REQ-BOOK-007.AC-5: Given a date with no override, When the check runs, Then the weekly hours for that weekday apply.
