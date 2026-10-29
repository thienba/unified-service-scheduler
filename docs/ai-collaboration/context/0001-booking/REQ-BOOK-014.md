---
type: requirement
title: Staff book for an existing or a new customer
priority: P1
---
When garage staff create a booking, the system shall let them pick an existing customer and vehicle or enter a new customer and vehicle, and shall then run the same booking flow as a customer's own booking (REQ-BOOK-001, 002, 009) (the human: "when staff create a booking, they can pick an existing customer or a new one", D-0001-12).

- REQ-BOOK-014.AC-1: Given existing customers, When staff search by name, phone or registration, Then matching customers are listed with their vehicles, and picking one fills the booking.
- REQ-BOOK-014.AC-2: Given a customer not in the system, When staff enter a new customer and vehicle and confirm a free time, Then the customer, the vehicle and the appointment are all stored, and the customer can be found next time.
- REQ-BOOK-014.AC-3: Given a new-customer form with a required field missing or invalid (Q-0001-23), When staff submit, Then nothing is stored and the field is named.
- REQ-BOOK-014.AC-4: Given the chosen time is taken while staff fill the form, When they confirm, Then they get the conflict answer of REQ-BOOK-009, and a new customer they entered is not lost.
- REQ-BOOK-014.AC-5: Given the user is a customer, When they book, Then they can book only for themselves and their own vehicles.
