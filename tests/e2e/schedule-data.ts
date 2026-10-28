// Real use through the API for the schedule tests (C3): bookings by staff, a manager cutting a shift, leave,
// a closed date. The mock backend runs in the page, so every call is made from the page with `fetch`.
import type { Page } from "@playwright/test";

export const LONDON = "dealership-london";
export const STAFF = "user-staff-london";
export const MANAGER = "user-manager-london";

/** Wed 28 Oct 2026, 10:40 in London (GMT after the clocks went back on the 25th). */
export const TODAY = "2026-10-28";
export const NOW = "2026-10-28T10:40:00Z";

interface Answer {
  status: number;
  body: unknown;
}

export async function api(
  page: Page,
  user: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<Answer> {
  return page.evaluate(
    async ({ user, method, path, body }) => {
      const response = await fetch(`/api${path}`, {
        method,
        headers: {
          "X-Demo-User": user,
          "Content-Type": "application/json",
          ...(method === "POST"
            ? { "Idempotency-Key": crypto.randomUUID() }
            : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      return { status: response.status, body: text ? JSON.parse(text) : null };
    },
    { user, method, path, body },
  );
}

export interface Booking {
  date: string;
  time: string;
  technicianId: string;
  serviceTypeId?: string;
  transport?: "wait" | "drop_off" | "courtesy_car";
  name?: string;
  make?: string;
  model?: string;
  registration?: string;
}

/** Books for a new customer as London staff, with the technician fixed. Returns the appointment id. */
export async function book(page: Page, b: Booking): Promise<string> {
  const answer = await api(page, STAFF, "POST", "/appointments", {
    dealershipId: LONDON,
    serviceTypeId: b.serviceTypeId ?? "service-oil-change",
    start: `${b.date}T${b.time}:00Z`,
    transport: b.transport ?? "drop_off",
    technicianId: b.technicianId,
    newCustomer: {
      name: b.name ?? "Sample Customer",
      phone: `0161 496 ${String(Math.floor(Math.random() * 9000) + 1000)}`,
      email: "sample@example.com",
    },
    newVehicle: {
      registration: b.registration ?? "AB12 CDE",
      make: b.make ?? "Ford",
      model: b.model ?? "Focus",
    },
  });
  if (answer.status !== 201) {
    throw new Error(`Booking failed: ${JSON.stringify(answer)}`);
  }
  return (answer.body as { id: string }).id;
}

interface Technician {
  id: string;
  shiftPattern: Record<string, unknown>;
  shiftExceptions: Record<string, unknown>;
}

/** The manager changes one technician's shift on one date (or puts them on leave), through the API. */
export async function changeShift(
  page: Page,
  technicianId: string,
  date: string,
  exception:
    | { kind: "leave" }
    | {
        kind: "changed";
        shift: {
          start: string;
          end: string;
          breakStart?: string;
          breakEnd?: string;
        };
      },
) {
  const list = await api(
    page,
    MANAGER,
    "GET",
    `/dealerships/${LONDON}/technicians?from=${date}&to=${date}`,
  );
  const t = (list.body as Technician[]).find((x) => x.id === technicianId)!;
  const answer = await api(
    page,
    MANAGER,
    "PUT",
    `/technicians/${technicianId}/shifts`,
    {
      shiftPattern: t.shiftPattern,
      shiftExceptions: { ...t.shiftExceptions, [date]: exception },
    },
  );
  if (answer.status !== 200) throw new Error(JSON.stringify(answer));
}

/** The manager cancels an appointment, through the API. */
export async function cancelAsManager(page: Page, appointmentId: string) {
  const answer = await api(
    page,
    MANAGER,
    "POST",
    `/appointments/${appointmentId}/cancel`,
  );
  if (answer.status !== 200) throw new Error(JSON.stringify(answer));
}

/** The manager closes the dealership on one date with a date override. */
export async function closeDate(page: Page, date: string) {
  const d = (await api(page, MANAGER, "GET", `/dealerships/${LONDON}`))
    .body as {
    weeklyHours: unknown;
    dateOverrides: Record<string, unknown>;
    policies: {
      leadTimeMinutes: number;
      horizonDays: number;
      breakMinutes: number;
    };
  };
  const answer = await api(
    page,
    MANAGER,
    "PUT",
    `/dealerships/${LONDON}/settings`,
    {
      weeklyHours: d.weeklyHours,
      dateOverrides: { ...d.dateOverrides, [date]: "closed" },
      policies: {
        leadTimeMinutes: d.policies.leadTimeMinutes,
        horizonDays: d.policies.horizonDays,
        breakMinutes: d.policies.breakMinutes,
      },
    },
  );
  if (answer.status !== 200) throw new Error(JSON.stringify(answer));
}

/**
 * A full day on Wed 28 Oct (and a few on Tue 27 Oct), booked the day before so the lead time allows the
 * morning; one booking is flagged by cutting Ash's shift; Cedar is on leave. Then the clock moves to 10:40.
 */
export async function seedBusyDay(page: Page): Promise<SeededIds> {
  await page.clock.setFixedTime(new Date("2026-10-26T07:00:00Z"));
  await page.goto("/");
  await page.getByText("Service Scheduler", { exact: true }).waitFor();
  const ash = "tech-lon-ash";
  const birch = "tech-lon-birch";
  const cedar = "tech-lon-cedar";
  await book(page, {
    date: TODAY,
    time: "08:00",
    technicianId: ash,
    transport: "wait",
    name: "Marta Kowalska",
    make: "Ford",
    model: "Focus",
    registration: "AB12 CDE",
  });
  const jan = await book(page, {
    date: TODAY,
    time: "09:15",
    technicianId: birch,
    serviceTypeId: "service-full",
    name: "Jan Nowak",
    make: "Vauxhall",
    model: "Corsa",
    registration: "CD34 FGH",
  });
  const leila = await book(page, {
    date: TODAY,
    time: "13:15",
    technicianId: ash,
    transport: "courtesy_car",
    name: "Leila Haddad",
    make: "Kia",
    model: "Ceed",
    registration: "EF56 JKL",
  });
  await book(page, {
    date: TODAY,
    time: "15:00",
    technicianId: birch,
    name: "Ravi Menon",
    make: "Skoda",
    model: "Octavia",
    registration: "GH78 MNO",
  });
  await book(page, {
    date: "2026-10-27",
    time: "09:00",
    technicianId: ash,
    name: "Owen Pritchard",
    make: "Hyundai",
    model: "Kona",
    registration: "UV20 WXY",
  });
  await book(page, {
    date: "2026-10-27",
    time: "11:00",
    technicianId: birch,
    transport: "wait",
    name: "Chidi Eze",
    make: "Mazda",
    model: "CX-5",
    registration: "EF22 GHJ",
  });
  // Ash's shift on the day is cut to end at 14:00: the 13:15 to 14:15 booking is flagged.
  await changeShift(page, ash, TODAY, {
    kind: "changed",
    shift: {
      start: "08:00",
      end: "14:00",
      breakStart: "12:00",
      breakEnd: "12:30",
    },
  });
  await changeShift(page, cedar, TODAY, { kind: "leave" });
  await page.clock.setFixedTime(new Date(NOW));
  return { jan, leila };
}

export interface SeededIds {
  /** Jan Nowak, Wed 09:15 to 12:15 with Birch, a full service, drop-off. */
  jan: string;
  /** Leila Haddad, Wed 13:15 with Ash, courtesy car, flagged after Ash's shift is cut. */
  leila: string;
}
