// The schedule's words and parts (C3, staff.md 5.1): the model that places the day on the time axis, and the
// timeline, list and detail panel drawn from one `ScheduleDay`.
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { DetailPanel } from "./DetailPanel";
import { ScheduleList } from "./ScheduleList";
import {
  blockName,
  carChoiceText,
  dayAxis,
  factsText,
  gapHref,
  gapName,
  hoursFrom,
  listItems,
  railText,
  type Appointment,
  type ScheduleDay,
  type ScheduleTechnician,
} from "./schedule-model";
import { Timeline } from "./Timeline";

afterEach(cleanup);

const ZONE = "Europe/London";

function technician(
  id: string,
  name: string,
  extra: Partial<ScheduleTechnician> = {},
): ScheduleTechnician {
  return {
    id,
    name,
    skills: ["service", "brakes"],
    onLeave: false,
    shift: { start: "2026-10-28T08:00:00Z", end: "2026-10-28T16:30:00Z" },
    break: { start: "2026-10-28T12:30:00Z", end: "2026-10-28T13:00:00Z" },
    free: [],
    ...extra,
  };
}

function appointment(
  id: string,
  start: string,
  end: string,
  extra: Partial<Appointment> = {},
  display: Partial<Appointment["display"]> = {},
): Appointment {
  return {
    id,
    dealershipId: "dealership-london",
    timeZone: ZONE,
    customerId: "customer-1",
    vehicleId: "vehicle-1",
    serviceTypeId: "service-full",
    technicianId: "t1",
    serviceBayId: "bay-1",
    courtesyCarId: null,
    transport: "drop_off",
    start,
    end,
    status: "confirmed",
    flags: [],
    version: 1,
    createdAt: "2026-10-27T15:00:00Z",
    updatedAt: "2026-10-27T15:00:00Z",
    cancelledAt: null,
    display: {
      serviceTypeName: "Full service",
      vehicle: { make: "Vauxhall", model: "Corsa", registration: "CD34 FGH" },
      technicianName: "Test Tech One",
      serviceBayName: "Bay 1",
      customerName: "Jan Testperson",
      ...display,
    },
    ...extra,
  };
}

function sampleDay(extra: Partial<ScheduleDay> = {}): ScheduleDay {
  return {
    date: "2026-10-28",
    timeZone: ZONE,
    opening: { start: "2026-10-28T08:00:00Z", end: "2026-10-28T18:00:00Z" },
    nextOpenDate: "2026-10-29",
    technicians: [
      technician("t1", "Test Tech One", {
        free: [{ start: "2026-10-28T16:30:00Z", end: "2026-10-28T18:00:00Z" }],
        shift: { start: "2026-10-28T08:00:00Z", end: "2026-10-28T18:00:00Z" },
      }),
      technician("t2", "Bartholomew Wojciechowski", {
        free: [{ start: "2026-10-28T14:00:00Z", end: "2026-10-28T15:00:00Z" }],
      }),
      technician("t3", "Test Tech Three", {
        onLeave: true,
        shift: null,
        break: null,
      }),
    ],
    serviceBays: [
      {
        id: "bay-1",
        dealershipId: "dealership-london",
        name: "Bay 1",
        active: true,
      },
      {
        id: "bay-2",
        dealershipId: "dealership-london",
        name: "Bay 2",
        active: true,
      },
    ],
    appointments: [
      appointment("a1", "2026-10-28T09:15:00Z", "2026-10-28T12:15:00Z"),
      appointment(
        "a2",
        "2026-10-28T12:15:00Z",
        "2026-10-28T13:45:00Z",
        {
          technicianId: "t2",
          transport: "courtesy_car",
          courtesyCarId: "car-1",
          flags: [
            {
              kind: "outside_shift",
              since: "2026-10-28T07:00:00Z",
              reason: "Ends after Bartholomew's shift, 13:00",
            },
          ],
        },
        {
          technicianName: "Bartholomew Wojciechowski",
          courtesyCarName: "Car 2",
          serviceTypeName: "Brake fluid change",
          vehicle: { make: "Peugeot", model: "208", registration: "PG28 GHI" },
        },
      ),
    ],
    ...extra,
  };
}

describe("the schedule's words (staff.md 5.1, Copy)", () => {
  it("names a block with its time, service, vehicle and plate, technician, bay and car choice, and the flag", () => {
    const day = sampleDay();
    expect(blockName(day, day.appointments[0]!)).toBe(
      "09:15 to 12:15, Full service, Vauxhall Corsa CD34 FGH, Test Tech One, Bay 1, Drop-off",
    );
    expect(blockName(day, day.appointments[1]!)).toBe(
      "12:15 to 13:45, Brake fluid change, Peugeot 208 PG28 GHI, Bartholomew Wojciechowski, Bay 1, Courtesy car, flagged: Ends after Bartholomew's shift, 13:00",
    );
  });

  it("names a free gap and links it to the booking with only the time and the technician", () => {
    const gap = { start: "2026-10-28T16:30:00Z", end: "2026-10-28T18:00:00Z" };
    expect(gapName(ZONE, gap, "Sofia Test")).toBe(
      "Free, 16:30 to 18:00, 1 hour 30 minutes, Sofia Test. Book this time.",
    );
    const href = gapHref(gap, "t1");
    expect(href).toBe(
      "/book/for-customer?start=2026-10-28T16%3A30%3A00Z&technicianId=t1",
    );
    expect(href).not.toMatch(/customer(Id|Name)|phone|email/i);
  });

  it("writes the car choice, with the courtesy car's name when it has one", () => {
    const day = sampleDay();
    expect(carChoiceText(day.appointments[0]!)).toBe("Drop-off");
    expect(carChoiceText(day.appointments[1]!)).toBe("Courtesy car, Car 2");
    expect(
      carChoiceText(
        appointment("w", "2026-10-28T09:00:00Z", "2026-10-28T10:00:00Z", {
          transport: "wait",
        }),
      ),
    ).toBe("Waiting");
  });

  it("writes the facts line for a normal, an empty, a past and a bay day", () => {
    const day = sampleDay();
    expect(factsText(day, "technicians", false)).toBe(
      "2 appointments, 1 flagged, 2 free gaps. 2 technicians working, 1 on leave.",
    );
    expect(factsText({ ...day, appointments: [] }, "technicians", false)).toBe(
      "No appointments. 2 technicians working, 1 on leave.",
    );
    expect(factsText(day, "technicians", true)).toBe(
      "2 appointments, 1 flagged. This day has passed, so no free gaps are shown.",
    );
    expect(factsText(day, "bays", false)).toBe(
      "2 appointments across 1 of 2 bays. Free time is shown by technician.",
    );
  });

  it("writes the rail as skills and shift, or on leave", () => {
    const day = sampleDay();
    expect(railText(day, day.technicians[1]!)).toBe(
      "Service, brakes · shift 08:00 to 16:30",
    );
    expect(railText(day, day.technicians[2]!)).toBe(
      "Service, brakes · on leave",
    );
  });

  it("lists appointments and free gaps in time order, and no gaps when asked for none", () => {
    const day = sampleDay();
    const starts = listItems(day, true).map((i) => `${i.kind} ${i.start}`);
    expect(starts).toEqual([
      "appointment 2026-10-28T09:15:00Z",
      "appointment 2026-10-28T12:15:00Z",
      "gap 2026-10-28T14:00:00Z",
      "gap 2026-10-28T16:30:00Z",
    ]);
    expect(listItems(day, false).every((i) => i.kind === "appointment")).toBe(
      true,
    );
  });
});

describe("the time axis on a clock-change day (AD-9, S4)", () => {
  // Sun 29 Mar 2026: 01:00 GMT jumps to 02:00 BST. Sun 25 Oct 2026: 02:00 BST goes back to 01:00 GMT.
  const changeDay = (
    date: string,
    start: string,
    end: string,
    a: [string, string],
  ) =>
    sampleDay({
      date,
      opening: { start, end },
      technicians: [
        technician("t1", "Test Tech One", {
          shift: { start, end },
          break: null,
        }),
      ],
      appointments: [appointment("a1", a[0], a[1])],
    });

  it("skips the missing hour in spring and places a block by real minutes", () => {
    // 00:00 GMT (= 00:00 UTC) to 04:00 BST (= 03:00 UTC): three real hours.
    const day = changeDay(
      "2026-03-29",
      "2026-03-29T00:00:00Z",
      "2026-03-29T03:00:00Z",
      [
        "2026-03-29T02:00:00Z", // 03:00 BST
        "2026-03-29T03:00:00Z",
      ],
    );
    const axis = dayAxis(day)!;
    expect(axis.labels.map((l) => l.text)).toEqual(["00:00", "02:00", "03:00"]);
    expect(hoursFrom(axis, day.appointments[0]!.start)).toBe(2);
  });

  it("repeats the hour in autumn and places a block by real minutes", () => {
    // 00:00 BST (= 23:00 UTC the day before) to 03:00 GMT (= 03:00 UTC): four real hours.
    const day = changeDay(
      "2026-10-25",
      "2026-10-24T23:00:00Z",
      "2026-10-25T03:00:00Z",
      [
        "2026-10-25T01:00:00Z", // the second 01:00, in GMT
        "2026-10-25T02:00:00Z",
      ],
    );
    const axis = dayAxis(day)!;
    expect(axis.labels.map((l) => l.text)).toEqual([
      "00:00",
      "01:00",
      "01:00",
      "02:00",
    ]);
    expect(hoursFrom(axis, day.appointments[0]!.start)).toBe(2);
  });

  it("has no axis on a closed day with nothing booked", () => {
    expect(
      dayAxis(sampleDay({ opening: null, appointments: [], technicians: [] })),
    ).toBeNull();
  });
});

function renderTimeline(
  day: ScheduleDay,
  rows: "technicians" | "bays" = "technicians",
) {
  let selected: string | null = null;
  const view = render(
    <MemoryRouter>
      <Timeline
        day={day}
        axis={dayAxis(day)!}
        rows={rows}
        now={null}
        selectedId={selected}
        onSelect={(id) => (selected = id)}
        canBook
      />
    </MemoryRouter>,
  );
  return { view, selected: () => selected };
}

describe("Timeline (design.md 8.12)", () => {
  it("draws one group per technician, blocks as buttons and gaps as links, in time order, in a labelled scroll box", () => {
    renderTimeline(sampleDay());
    const box = screen.getByRole("region", {
      name: "Day timeline, scrolls sideways",
    });
    expect(box).toHaveProperty("tabIndex", 0);
    const one = screen.getByRole("group", { name: "Test Tech One" });
    const stops = [...one.querySelectorAll("button, a")].map((e) =>
      e.getAttribute("aria-label"),
    );
    expect(stops).toEqual([
      "09:15 to 12:15, Full service, Vauxhall Corsa CD34 FGH, Test Tech One, Bay 1, Drop-off",
      "Free, 16:30 to 18:00, 1 hour 30 minutes, Test Tech One. Book this time.",
    ]);
    expect(within(one).getByRole("link")).toHaveProperty(
      "href",
      expect.stringContaining(
        "/book/for-customer?start=2026-10-28T16%3A30%3A00Z&technicianId=t1",
      ),
    );
    expect(
      screen.getByRole("group", { name: "Test Tech Three, on leave" })
        .textContent,
    ).toContain("On leave today. No bookings.");
    expect(screen.getAllByText("Break 12:30 to 13:00").length).toBeGreaterThan(
      0,
    );
  });

  it("truncates a long name in the rail and keeps it whole in the title and the group name", () => {
    renderTimeline(sampleDay());
    const group = screen.getByRole("group", {
      name: "Bartholomew Wojciechowski",
    });
    const name = within(group).getByText("Bartholomew Wojciechowski");
    expect(name.className).toContain("truncate");
    expect(name.closest("[title]")?.getAttribute("title")).toBe(
      "Bartholomew Wojciechowski",
    );
  });

  it("places a block through the style object at 88 px per hour from the axis start", () => {
    renderTimeline(sampleDay());
    const block = screen.getByRole("button", { name: /^09:15 to 12:15/ });
    expect(block.style.left).toBe("calc(var(--size-hour) * 1.2500)");
    expect(block.style.width).toBe("calc(var(--size-hour) * 3.0000)");
  });

  it("tells the parent which block was picked", () => {
    const { selected } = renderTimeline(sampleDay());
    fireEvent.click(screen.getByRole("button", { name: /^12:15 to 13:45/ }));
    expect(selected()).toBe("a2");
  });

  it("in the bay view draws one row per bay, an empty bay as an empty row, and no free gaps", () => {
    renderTimeline(sampleDay(), "bays");
    expect(screen.queryByRole("link")).toBeNull();
    expect(
      within(screen.getByRole("group", { name: "Bay 2" })).queryAllByRole(
        "button",
      ),
    ).toHaveLength(0);
    expect(
      within(screen.getByRole("group", { name: "Bay 1" })).getAllByRole(
        "button",
      ),
    ).toHaveLength(2);
  });
});

describe("DetailPanel (states selected and selected-flagged)", () => {
  it("says what to do when nothing is selected", () => {
    render(
      <MemoryRouter>
        <DetailPanel day={sampleDay()} appointment={null} />
      </MemoryRouter>,
    );
    expect(
      screen.getByText(
        "Select an appointment to see who it is for, or a dashed time to book it.",
      ),
    ).toBeTruthy();
  });

  it("shows time, customer, plate, technician, bay, car choice and the flag for a flagged block", () => {
    const day = sampleDay();
    render(
      <MemoryRouter>
        <DetailPanel day={day} appointment={day.appointments[1]!} />
      </MemoryRouter>,
    );
    for (const text of [
      "12:15 to 13:45",
      "Jan Testperson",
      "PG28 GHI",
      "Bartholomew Wojciechowski",
      "Bay 1",
      "Courtesy car, Car 2",
      "Flagged: Ends after Bartholomew's shift, 13:00",
      "The booking is still valid. The garage manager can move it.",
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    expect(
      screen
        .getByRole("link", { name: "Open appointment" })
        .getAttribute("href"),
    ).toBe("/appointments/a2");
  });
});

describe("stored text is shown as text (SEC-11.AC-2)", () => {
  const hostile = [
    '<img src=x onerror="window.__xss=1">',
    '"><script>window.__xss=1</script>',
  ];

  it.each(hostile)(
    "draws %s literally on the blocks, the list and the detail panel",
    (text) => {
      const day = sampleDay();
      const a = appointment(
        "x",
        "2026-10-28T09:00:00Z",
        "2026-10-28T10:00:00Z",
        {},
        {
          customerName: text,
          vehicle: { make: text, model: text, registration: text },
        },
      );
      const evil = { ...day, appointments: [a] };
      const { container } = render(
        <MemoryRouter>
          <Timeline
            day={evil}
            axis={dayAxis(evil)!}
            rows="technicians"
            now={null}
            selectedId="x"
            onSelect={() => {}}
            canBook
          />
          <ScheduleList
            day={evil}
            items={listItems(evil, true)}
            rows="technicians"
            canBook
          />
          <DetailPanel day={evil} appointment={a} />
        </MemoryRouter>,
      );
      expect(container.querySelectorAll("img, script")).toHaveLength(0);
      expect(container.textContent).toContain(text);
      expect((window as { __xss?: number }).__xss).toBeUndefined();
    },
  );
});

describe("ScheduleList (design.md 8.13)", () => {
  it("reads in time order, rows link to the appointment, gap rows to the booking", () => {
    const day = sampleDay();
    render(
      <MemoryRouter>
        <ScheduleList
          day={day}
          items={listItems(day, true)}
          rows="technicians"
          canBook
        />
      </MemoryRouter>,
    );
    const list = screen.getByRole("list", {
      name: "Appointments and free time in time order",
    });
    const links = within(list).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/appointments/a1",
      "/appointments/a2",
      "/book/for-customer?start=2026-10-28T14%3A00%3A00Z&technicianId=t2",
      "/book/for-customer?start=2026-10-28T16%3A30%3A00Z&technicianId=t1",
    ]);
    expect(links[0]!.textContent).toContain("Drop-off");
    expect(links[1]!.textContent).toContain(
      "Flagged: Ends after Bartholomew's shift, 13:00",
    );
  });
});
