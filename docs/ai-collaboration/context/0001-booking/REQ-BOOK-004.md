---
type: requirement
title: Garage staff check the schedule
priority: P1
---
When garage staff open the schedule, the system shall show the appointments booked for the garage, with the vehicle, service type, technician, bay and time of each (the human: "garage staff check the schedule", D-0001-1).

- REQ-BOOK-004.AC-1: Given confirmed appointments on a day, When staff open the schedule for that day, Then every appointment is shown with its time, vehicle, service type, technician and bay.
- REQ-BOOK-004.AC-2: Given a customer has just booked, When staff open or refresh the schedule, Then the new appointment is shown.
- REQ-BOOK-004.AC-3: Given no appointments on a day, When staff open that day, Then the schedule says it is empty.
- REQ-BOOK-004.AC-4: Given a branch and a day, When staff open the timeline, Then there is one row per technician of that branch, each appointment is a block from its start to its end on its technician's row, and time outside the technician's shift and their breaks is shaded (D-0001-11).
- REQ-BOOK-004.AC-5: Given the timeline, When staff switch to the bay view, Then there is one row per bay with the same appointments placed on their bays.
- REQ-BOOK-004.AC-6: Given a narrow screen or a screen reader, When the schedule opens, Then the list view shows the same appointments in time order, and every timeline block is reachable by keyboard with its time, vehicle, service and technician announced.
