# Design directions (step B0a)

Three directions for the human to choose from. All three stay inside the company's look (D-0000-4): Plus Jakarta Sans for headings, IBM Plex Sans for body text, navy and carbon with signal-blue, radii of 12 px, 8 px and pill. They differ in layout, density, hierarchy and character, not in brand. No company logo or wordmark is used.

Each direction has one page that shows the same two key views with the same sample data, so they can be compared fairly:

| Direction | Name | File |
|---|---|---|
| A | Front desk | [direction-a.html](direction-a.html) |
| B | Workshop board | [direction-b.html](direction-b.html) |
| C | Timetable | [direction-c.html](direction-c.html) |

Each page shows, top to bottom: (1) the customer picking a time, (2) the customer after "that time was just taken, sorry, here are other times", (3) the staff day timeline with one row per technician, with blocks, off-shift shading, breaks, a flagged booking and a "now" line. Open a page in a browser and resize it. Below 720 px wide the staff timeline turns into the list view (REQ-BOOK-004.AC-6), and the customer views become a single column.

All names, plates, dealership and times on the pages are made-up sample data. The service durations, shifts and the Saturday hours are only there to make the views believable.

**What was not checked.** I could not open the pages in a browser in this step (no browser or shell was available to me). I checked the code by reading it: contrast numbers were worked out by hand, touch targets are set to at least 44 px, focus rings are set on every control. A real look at 1280 px and 390 px wide is the first thing to do when you open them. Tell me what looks off and I will fix it before step B0b.

## How I got to three directions

**The rut.** What the category always ships: a booking wizard with a month calendar, a grid of identical rounded blue buttons for the times, white cards with soft shadows, and for staff a rainbow calendar of coloured blocks. Its predictable opposite is a neon "mission control" screen: near-black with glowing edges. Neither is a candidate.

**What the first screen must prove.** For the customer: a time is free only when a bay and a qualified technician are free for the whole job, and if someone beats you to it, you lose nothing. For staff: one glance at the day shows who is working on what, who is off shift, and where there is room.

**Seven worlds I listed** (from the audience's own culture, with my guess at how likely another designer is to land on each):

| # | World | How likely | Kept? |
|---|---|---|---|
| 1 | The reception desk and its appointment card | high | yes, as A |
| 2 | The generic booking wizard with a month calendar | very high | dropped (it is the rut) |
| 3 | The workshop job board on the wall | medium | yes, as B |
| 4 | The printed bus or rail timetable | low | yes, as C |
| 5 | The airline seat map (slots as seats) | low | dropped: a seat map suggests you pick one of many seats; here the system picks the technician and bay |
| 6 | The paper service book with stamps | low | dropped: it would pull the look away from the company |
| 7 | The vehicle inspection sheet (tick boxes) | medium | dropped: good for a checklist, not for a schedule |

Both screens are **Operate** mode (the visitor completes a task). So each world lends only type, palette, density and one signature move. Controls and navigation stay standard.

**Shared by all three, taken from the requirements:** a 15-minute start grid (Q-0001-11); wait, drop-off or courtesy car shown as an icon and a word, never by colour alone (REQ-BOOK-010); the "just taken" answer says what happened, keeps what the customer entered, and offers other times (REQ-BOOK-009.AC-2); every timeline block can be reached by keyboard and has the time, vehicle, service, technician and bay in its label (REQ-BOOK-004.AC-6); a long technician name ("Bartholomew Wojciechowski") is cut with an ellipsis and shown in full on hover and to screen readers.

**Colour findings that apply to every direction** (for B0b):
- Signal-blue on white is about 2.5:1, so it is never used for text. The primary button is a signal-blue fill with carbon text (about 6.8:1).
- The `muted` token (#718096) on white is about 4:1, below 4.5:1. I used `foreground-secondary` (#4a5568) for quiet text instead. Suggest B0b drops `muted` for text on white.
- The error red on white is about 3.3:1, so it is not used for text. "Just taken" and "flagged" use the warning yellow as a tint with dark text, plus an icon and words.
- The focus ring is navy on light surfaces and signal-blue on dark ones, both above 3:1.
- Tints are made from the brand colours with `color-mix`, so no new raw colour is added (D-0000-12).
- `tokens.css` is a Tailwind v4 `@theme`, which a plain HTML page cannot read, so each page copies the token values into `:root` and says so in a comment. Nothing else is defined.

---

## Direction A: Front desk

### Direction contract

- THESIS: Booking is one calm decision at a time, and the page shows how full each day is before the customer opens it. It refuses the category's month calendar followed by a wall of identical time buttons.
- OWN-WORLD: The service reception: white and pale blue-grey counters, navy type, signal-blue used for the one action and for appointments, warm yellow only when something needs attention. Roomy 12 px panels, pill chips and buttons, one soft brand shadow on the page frame. Headings in Plus Jakarta Sans, body in IBM Plex Sans.
- STORY: The customer sees which day suits them, picks a start time, says what they will do with the car, and confirms. If the time was just taken, they read a plain apology, see the closest times and press one. Staff read the day by technician row and open any block for its details. They never have to hunt for a field.
- FIRST VIEWPORT: Customer: heading "Choose a time for your full service" top left; below it a seven-day strip (weekday, date, "18 times", a thin fill bar; closed days greyed and labelled); then "Morning" and "Afternoon" groups of time chips; a booking summary panel on the right with the wait / drop-off / courtesy-car choice and the Confirm button. On a phone the panel moves below and a sticky bar carries the chosen time and the Confirm button. Staff: "Schedule" heading, day and view switches, "Book for a customer" at top right, then the timeline with 64 px rows, then a detail panel for the selected block.
- FORM: Reception desk, first on my list. Dealt: Restrained colour (white and pale blue-grey, navy for selection, signal-blue for appointments and the action); Plus Jakarta Sans and IBM Plex Sans as pinned by D-0000-4 (both are on the font blocklist, and no other face could replace them, because the human asked for the company fonts); roomy density with a 12-column feel; 12 px panels, 8 px inputs, pill chips; one soft shadow; quick 150 ms ease-out; signature move: the day strip that shows how full each day is.
- FINISH: unreviewed is unfinished; this screen is done when every state renders in both themes and Visual QA has judged the build against this contract

### Good and bad, by role

| Role | Good | Bad |
|---|---|---|
| Customer | The friendliest of the three. The day strip answers "which day?" before any time is shown. One column on a phone, with the action always in reach. | A busy day gives 18 chips in a wrapping list, which gets long. The strip shows only seven days, so a customer who wants next month must page. It is the most familiar look, so it is the least memorable. |
| Staff | Easiest to learn. Three-line blocks show service, plate and bay without opening anything. The detail panel gives every field the requirement asks for. | The lowest density: about five technicians fit on screen at 64 px rows, so a big garage scrolls. Free gaps are not marked; staff have to spot them. |
| Manager | Forms (hours, shifts, policies) fit the panel-and-pill pattern with no extra design. The detail panel is the natural home for Move and Reassign. | Nothing here helps the manager see where an appointment could move to. |

Honest risk: it is the one you could guess from "dealership booking app". The staff timeline and the day strip carry its identity.

---

## Direction B: Workshop board

### Direction contract

- THESIS: The day is a board you read in one look and book from: free time is as visible as booked time. It refuses the category's pale calendar where only the busy parts are drawn.
- OWN-WORLD: The workshop wall screen: carbon ground, graphite panels, tech-slate lines, signal-blue as the single bright colour (selection, appointments, free gaps), warning yellow for flags. Hatching for time that does not exist (off shift, not available). 8 px corners, no shadows, hairline borders. White text on dark, quiet text in the border grey.
- STORY: The customer sees the whole day as a grid of hours and quarter hours, picks one, and confirms; if it was taken, the nearest free quarter hours light up in the same grid. Staff see each technician's row, how much of their day is booked, and where a free gap is. They tap the gap to book it.
- FIRST VIEWPORT: Customer: three columns separated by lines: the booking summary (left), a four-week calendar with closed days crossed out (middle), and the time grid with one row per hour and one column per quarter hour (right). The "just taken" notice is a banner across the top with the closest times as buttons. Staff: a one-line toolbar, a yellow strip naming the flagged booking, then the board: technician names on the left, 52 px rows, dashed "1h 30m free" gaps, and on the right a column that says how much of the shift is booked. A status bar below shows the selected appointment.
- FORM: Workshop board, second on my list. Dealt: Committed colour (carbon carries well over half the surface, signal-blue is the one saturated colour); the pinned company faces (blocklisted, kept because of D-0000-4); dense, 14 px body, a three-column grid; 8 px radius, no shadow; 120 ms ease-out; signature move: free gaps on the timeline are dashed buttons that start a booking.
- FINISH: unreviewed is unfinished; this screen is done when every state renders in both themes and Visual QA has judged the build against this contract

**Why dark.** The scene: a service advisor's monitor and a wall screen in a workshop office, on all day, next to glass and showroom lights, and a customer booking on a phone in the evening. Dark carbon is part of the company's own palette (its marketing site has dark carbon sections). It is not the neon version: no glow, no gradient, one blue.

### Good and bad, by role

| Role | Good | Bad |
|---|---|---|
| Customer | The whole day is readable at once, and the hour-by-quarter grid makes the 15-minute step obvious. In the "just taken" state the nearest times appear exactly where the customer was looking. The calendar shows closed days. | It feels like a tool, not a welcome. Three columns become a long scroll on a phone, with the summary and Confirm at the bottom (a sticky bar helps). Dark is an unusual choice for a customer in daylight. |
| Staff | The densest and most useful: free gaps start a booking, the right-hand column shows who is full or over their shift, and flagged bookings get their own strip. Best for a garage with many technicians. | Blocks are small, so they show less text. Details live in a status bar and the list, not in the blocks. In a very bright office, dark screens can wash out. |
| Manager | The free gaps and the booked-versus-shift numbers show where an appointment can be moved to. Over-booked technicians are obvious. | Long forms (opening hours, shifts, policies) need a dark form style that is more work to get right. |

Honest risk: it needs the most care to stay readable and to get a light version too (the contract asks for both themes), so it costs the most to build.

---

## Direction C: Timetable

### Direction contract

- THESIS: The week and the day are printed timetables: columns and rows, read by position. It refuses cards and shadows; ruled lines and one navy band do the structuring.
- OWN-WORLD: A navy band across the top, then white pages divided by hairline rules, in the way a printed timetable is. Navy for selection and the shell, signal-blue only for the primary action, warning yellow for flags and notices, energy-coral for the "now" line. Large headings in Plus Jakarta Sans, tabular numbers everywhere. 8 px corners, no shadow.
- STORY: The customer scans the week for a start time, reads the end time beside it, picks one, sets the car choice in the action bar and confirms. If a time was taken, the notice and the closest times come first, and the week below shows them marked. Staff see the timeline, and directly under it the same appointments as a full list with every field in its own column.
- FIRST VIEWPORT: Customer: the navy band, a large "Choose a time" heading, a four-cell strip (dealership, vehicle, service, how long), then a five-column week: each column is a day with its count of times, each row a start time with its end time. A bar fixed at the bottom holds the chosen time, the wait / drop-off / courtesy-car choice and the Confirm button. On a phone the days swipe sideways. Staff: a large date heading, a one-line summary of the day, the timeline with 72 px rows and three-line blocks, then the ruled list of every appointment.
- FORM: Printed timetable, third on my list. Dealt: Full colour (navy shell and selection, signal for the action, yellow for attention, coral for now); the pinned company faces (blocklisted, kept because of D-0000-4); a ruled table grid, larger headings up to 36 px; 8 px radius, no elevation at all; 150 ms ease-out; signature move: the week as one timetable with the action bar pinned under it.
- FINISH: unreviewed is unfinished; this screen is done when every state renders in both themes and Visual QA has judged the build against this contract

### Good and bad, by role

| Role | Good | Bad |
|---|---|---|
| Customer | Best at the "just taken" case: other days sit next to the taken one, so there is always somewhere to go. The end time is always visible. The pinned action bar keeps Confirm in reach. | A busy Friday column is very tall next to quiet days. On a phone only one day is visible at a time. Reading a timetable takes slightly more effort than tapping chips. |
| Staff | The timeline and the full list share one page: every field the requirement asks for is visible without opening anything. Prints well. The list doubles as the narrow-screen view. | The longest page. The two views repeat information. Taller rows mean fewer technicians on screen than B. |
| Manager | The ruled grid suits weekly hours and shift patterns (a week laid out as a timetable is exactly what they edit). Adjusting from the list row is simple. | Free time is not marked on the timeline, so finding a place to move an appointment takes longer than in B. |

Honest risk: with no cards or shadows it can look plain next to the other two. It depends on good type and spacing to feel finished.

---

## At a glance

| | A: Front desk | B: Workshop board | C: Timetable |
|---|---|---|---|
| Theme | light | dark | light |
| Density | roomy | dense | medium, ruled |
| Customer time picker | day strip + chips by morning and afternoon | hour by quarter-hour grid | five-day week timetable |
| Staff timeline row height | 64 px | 52 px | 72 px |
| Staff signature | detail panel under the timeline | free gaps to tap, shift usage column | timeline plus full list on one page |
| "Just taken" shape | alert, closest chips, all times | banner, buttons, grid marks the closest | notice, closest row, week marks them |
| Phone | one column, sticky confirm bar | calendar, grid, then summary, sticky bar | days swipe sideways, bar under the week |
| Build cost | lowest | highest (two themes, dense detail) | medium |
| Most at risk of | looking familiar | being hard to read in bright rooms | looking plain |

## Recommendation: Direction A

Reasons, in order:
1. **The customer flow is the first thing any reviewer sees, and the brief is about booking.** A is the clearest and friendliest for that flow, and it matches the company's own light, white-and-navy marketing look best, so it looks at home next to the company's products (NFR-4).
2. **Deadline.** The date is 2026-11-01. A uses standard patterns, so it is the cheapest to build and to test, and the build order in D-0000-9 (customer first, then staff) fits it. B costs the most because it needs two themes and a careful dense style.
3. **The staff timeline is still distinctive.** The hatched off-shift time, break markers, flagged blocks, the "now" line and the detail panel do the work. A's roomy rows suit a demo and a video.
4. **Cheap to improve later.** If you like B's free gaps, they can be added to A's timeline as an extra later without changing the rest.

Second choice: C, if you want the "just taken" state to be the star, since other days sit right beside the taken one. Choose B only if the staff screen matters more to you than the customer screen, and you accept the extra build time.

This is my recommendation, not a decision (D-0000-17). Nothing in step B0b starts until you choose. See [D-0001-13](../0001-booking/D-0001-13.md).
