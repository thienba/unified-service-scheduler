// Made-up data and helpers for the command tests, which run over every store (AD-8).
import type { Actor } from "../../../application/actor";
import type { CommandDeps } from "../../../application/deps";
import type { BookRequest } from "../../../application/commands";
import {
  createFakeClock,
  createFakeIds,
  createFakeLogger,
  createFakeMetrics,
} from "../../../application/ports/fakes";
import type { Repository, UnitOfWork } from "../../../application/ports";
import type { SeedData, Shift } from "../../../domain/model";

export const MIN = 60_000;
export const HOUR = 60 * MIN;
/** 2026-11-02 is a Monday. */
export const MONDAY = "2026-11-02";
export const at = (hhmm: string, date = MONDAY) =>
  Date.parse(`${date}T${hhmm}:00Z`);
/** Midnight: with the 2-hour lead time, 02:00 is the earliest start. */
export const NOW = at("00:00");

export const KEY = "11111111-1111-4111-8111-111111111111";
export const OTHER_KEY = "22222222-2222-4222-8222-222222222222";

export const customerActor = (customerId = "c1"): Actor => ({
  userId: `user-${customerId}`,
  role: "customer",
  customerId,
  dealershipIds: [],
});
export const staffActor = (dealershipIds = ["d1"]): Actor => ({
  userId: "user-staff",
  role: "staff",
  dealershipIds,
});
export const managerActor = (dealershipIds = ["d1"]): Actor => ({
  userId: "user-manager",
  role: "manager",
  dealershipIds,
});

/** Two dealerships (UTC, Monday to Friday 08:00 to 18:00), two technicians and two bays at the first. */
export function seed(techCount = 2, bayCount = 2): SeedData {
  const shift: Shift = { start: "08:00", end: "17:00" };
  const hours = { open: "08:00", close: "18:00" };
  const days = { 1: hours, 2: hours, 3: hours, 4: hours, 5: hours };
  const dealership = (id: string) => ({
    id,
    name: `Dealer ${id}`,
    timeZone: "UTC",
    weeklyHours: days,
    dateOverrides: {},
    policies: {
      leadTimeMinutes: 120,
      horizonDays: 30,
      breakMinutes: 15,
      gridMinutes: 15,
    },
  });
  const technician = (id: string, dealershipId: string) => ({
    id,
    dealershipId,
    name: `Tech ${id}`,
    active: true,
    skills: ["mechanic"],
    shiftPattern: { 1: shift, 2: shift, 3: shift, 4: shift, 5: shift },
    shiftExceptions: {},
  });
  const ids = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
  return {
    dealerships: [dealership("d1"), dealership("d2")],
    technicians: [
      ...ids(techCount).map((i) => technician(`t${i}`, "d1")),
      technician("t9", "d2"),
    ],
    serviceBays: [
      ...ids(bayCount).map((i) => ({
        id: `bay${i}`,
        dealershipId: "d1",
        name: `Bay ${i}`,
        active: true,
      })),
      { id: "bay9", dealershipId: "d2", name: "Bay 9", active: true },
    ],
    courtesyCars: [
      { id: "car1", dealershipId: "d1", name: "Car 1", active: true },
    ],
    serviceTypes: [
      {
        id: "st1",
        name: "Oil change",
        durationMinutes: 60,
        requiredSkill: "mechanic",
      },
    ],
    customers: [
      {
        id: "c1",
        name: "Alex Demo",
        phone: "+44 7700 900111",
        email: "a@x.example",
      },
      {
        id: "c2",
        name: "Bo Demo",
        phone: "+44 7700 900222",
        email: "b@x.example",
      },
    ],
    vehicles: [
      {
        id: "v1",
        customerId: "c1",
        registration: "AB00DEM",
        make: "Demo",
        model: "One",
      },
      {
        id: "v2",
        customerId: "c2",
        registration: "CD11DEM",
        make: "Demo",
        model: "Two",
      },
    ],
    demoUsers: [],
    appointments: [],
  };
}

export async function seededRepo(
  open: () => Promise<Repository>,
  data: SeedData = seed(),
): Promise<Repository> {
  const repo = await open();
  await repo.replaceAll(data, 1);
  return repo;
}

export function makeDeps(uow: UnitOfWork, start = NOW) {
  const clock = createFakeClock(start);
  const logger = createFakeLogger();
  const metrics = createFakeMetrics();
  const deps: CommandDeps = {
    uow,
    clock,
    ids: createFakeIds(),
    logger,
    metrics,
  };
  return { deps, clock, logger, metrics };
}

export const bookRequest = (overrides: BookRequest = {}): BookRequest => ({
  dealershipId: "d1",
  serviceTypeId: "st1",
  vehicleId: "v1",
  start: at("10:00"),
  transport: "wait",
  ...overrides,
});

export const newCustomerRequest = (
  overrides: BookRequest = {},
): BookRequest => ({
  dealershipId: "d1",
  serviceTypeId: "st1",
  start: at("10:00"),
  transport: "wait",
  newCustomer: {
    name: "Test Person",
    phone: "+44 7700 900123",
    email: "t@example.com",
  },
  newVehicle: {
    registration: "ZZ99 TST",
    make: "Make",
    model: "Model",
    year: 2020,
  },
  ...overrides,
});

/** Everything the stores hold that a command could change, for "nothing was stored" checks. */
export async function dump(repo: UnitOfWork, idempotencyOf: Actor[] = []) {
  return repo.read(async (s) => ({
    appointments: [
      ...(await s.appointments.listByDealershipDay("d1", 0, 2 ** 52)),
      ...(await s.appointments.listByDealershipDay("d2", 0, 2 ** 52)),
    ],
    customers: await Promise.all(
      ["c1", "c2", "id-1", "id-2", "id-3"].map((id) => s.customers.get(id)),
    ),
    keys: await Promise.all(
      idempotencyOf.flatMap((a) =>
        [KEY, OTHER_KEY].map((k) => s.idempotency.get(a.userId, k)),
      ),
    ),
    outbox: await s.outbox.list(),
  }));
}

export const appointmentsOf = (repo: UnitOfWork) =>
  repo.read((s) => s.appointments.listByDealershipDay("d1", 0, 2 ** 52));
