// The queries called directly. Most answers are reached through HTTP in the other files; these are the
// refusals and checks that the contract's own validation stops before a query is called (a real backend
// calls the same queries, so each must refuse on its own).
import { beforeEach, describe, expect, it } from "vitest";
import { actorOf } from "../../src/api/mock/actor";
import { newTraceId, traceIdOf } from "../../src/api/mock/trace";
import type { Actor } from "../../src/application/actor";
import {
  checkAvailability,
  getSchedule,
  getScheduleDay,
  listMyAppointments,
  listOutbox,
  listTechnicians,
  listVehicles,
  searchAvailability,
  searchCustomers,
  type QueryDeps,
} from "../../src/application/queries";
import { at, makeWorld, users, type World } from "./support";

let world: World;
let deps: QueryDeps;
const actors: Record<string, Actor> = {};
const LON = "dealership-london";

beforeEach(async () => {
  world = await makeWorld();
  deps = {
    uow: world.repository,
    clock: world.clock,
    logger: world.logger,
    metrics: world.metrics,
  };
  for (const user of await world.repository.listDemoUsers()) {
    actors[user.id] = actorOf(user);
  }
});

const as = (user: string) => actors[user]!;
const fails = (kind: string, field?: string) =>
  expect.objectContaining({
    kind,
    ...(field ? { errors: [expect.objectContaining({ field })] } : {}),
  });

describe("getScheduleDay (D-0001-21 A)", () => {
  const t = (hhmm: string) => Date.parse(`2026-11-05T${hhmm}:00Z`);

  it("gives each technician's shift, break and free windows, the bays and the day's appointments", async () => {
    const day = await getScheduleDay(as(users.staffLondon), deps, {
      dealershipId: LON,
      date: "2026-11-05",
    });
    if (day.kind !== "ok") throw new Error(day.kind);
    expect(day.opening).toEqual({ start: t("08:00"), end: t("18:00") });
    expect(day.nextOpenDate).toBe("2026-11-06");
    expect(day.bays.map((b) => b.name)).toEqual(["Bay 1", "Bay 2"]);
    expect(day.appointments.map((v) => v.appointment.id)).toEqual([
      "appointment-customer-a",
    ]);
    const ash = day.technicians.find(
      (x) => x.technician.id === "tech-lon-ash",
    )!;
    expect(ash.shift).toEqual({ start: t("08:00"), end: t("16:30") });
    expect(ash.break).toEqual({ start: t("12:00"), end: t("13:00") });
    // The job is 10:00 to 11:00; 15 minutes of rest stay empty on each side.
    expect(ash.free).toEqual([
      { start: t("08:00"), end: t("09:45") },
      { start: t("11:15"), end: t("12:00") },
      { start: t("13:00"), end: t("16:30") },
    ]);
  });

  it("refuses other dealerships and customers, checks the date, and does not know a missing dealership", async () => {
    const q = { dealershipId: LON, date: "2026-11-05" };
    expect(await getScheduleDay(as(users.staffSaigon), deps, q)).toEqual({
      kind: "forbidden",
    });
    expect(await getScheduleDay(as(users.customerA), deps, q)).toEqual({
      kind: "forbidden",
    });
    expect(
      await getScheduleDay(as(users.staffLondon), deps, {
        dealershipId: LON,
        date: "2026-02-30",
      }),
    ).toEqual(fails("validation_failed", "date"));
    const ghost = { ...as(users.staffLondon), dealershipIds: ["nowhere"] };
    expect(
      await getScheduleDay(ghost, deps, {
        dealershipId: "nowhere",
        date: q.date,
      }),
    ).toEqual({ kind: "not_found" });
  });
});

describe("getSchedule", () => {
  it("refuses a customer's flagged list, and asks for the dealership and the date", async () => {
    expect(
      await getSchedule(as(users.customerA), deps, {
        dealershipId: LON,
        flagged: true,
      }),
    ).toEqual({ kind: "forbidden" });
    expect(await getSchedule(as(users.staffLondon), deps, {})).toEqual(
      fails("validation_failed", "dealershipId"),
    );
    expect(
      await getSchedule(as(users.staffLondon), deps, { dealershipId: LON }),
    ).toEqual(fails("validation_failed", "date"));
    expect(
      await getSchedule(as(users.staffLondon), deps, {
        dealershipId: LON,
        date: "2026-02-30",
      }),
    ).toEqual(fails("validation_failed", "date"));
  });

  it("does not know a dealership that does not exist, and refuses other staff before it looks", async () => {
    expect(
      await getSchedule(as(users.customerA), deps, {
        dealershipId: "nowhere",
        date: "2026-11-05",
      }),
    ).toEqual({ kind: "not_found" });
    expect(
      await getSchedule(as(users.staffSaigon), deps, {
        dealershipId: LON,
        date: "2026-11-05",
      }),
    ).toEqual({ kind: "forbidden" });
  });

  it("lists cancelled appointments only when asked", async () => {
    const day = (includeCancelled: boolean) =>
      getSchedule(as(users.staffLondon), deps, {
        dealershipId: LON,
        date: "2026-11-05",
        includeCancelled,
      });
    expect(await day(false)).toMatchObject({
      appointments: [expect.anything()],
    });
    await world.repository.write(async (s) => {
      const a = (await s.appointments.get("appointment-customer-a"))!;
      await s.appointments.update({
        ...a,
        status: "cancelled",
        cancelledAt: a.start,
      });
      return { ok: true, value: undefined };
    });
    expect(await day(false)).toMatchObject({ appointments: [] });
    expect(await day(true)).toMatchObject({
      appointments: [expect.anything()],
    });
  });
});

describe("listMyAppointments, listVehicles and listOutbox", () => {
  it("is for customers only", async () => {
    expect(await listMyAppointments(as(users.staffLondon), deps)).toEqual({
      kind: "forbidden",
    });
    expect(await listMyAppointments(as(users.customerA), deps)).toMatchObject({
      kind: "ok",
    });
  });

  it("gives the vehicles of a customer, and not found for a customer that does not exist", async () => {
    expect(
      await listVehicles(as(users.staffLondon), deps, "customer-a"),
    ).toMatchObject({ kind: "ok", vehicles: [expect.anything()] });
    expect(await listVehicles(as(users.staffLondon), deps, "nobody")).toEqual({
      kind: "not_found",
    });
  });

  it("leaves out messages of appointments the manager does not serve", async () => {
    await world.repository.write(async (s) => {
      await s.outbox.add([
        {
          id: "m1",
          appointmentId: "appointment-customer-a",
          kind: "confirmation",
          dedupeKey: "a:c:1",
          dueAt: 1,
          status: "pending",
        },
        {
          id: "m2",
          appointmentId: "gone",
          kind: "confirmation",
          dedupeKey: "g:c:1",
          dueAt: 1,
          status: "pending",
        },
      ]);
      return { ok: true, value: undefined };
    });
    expect(await listOutbox(as(users.managerLondon), deps)).toMatchObject({
      messages: [expect.objectContaining({ id: "m1" })],
    });
    expect(await listOutbox(as(users.managerSaigon), deps)).toMatchObject({
      messages: [],
    });
  });
});

describe("searchAvailability and checkAvailability", () => {
  const day = {
    dealershipId: LON,
    serviceTypeId: "service-oil-change",
    date: "2026-11-09",
    transport: "wait",
  } as const;

  it("refuses a customer's technician, an unreal date, and answers not found for unknown ids", async () => {
    expect(
      await searchAvailability(as(users.customerA), deps, {
        ...day,
        technicianId: "tech-lon-ash",
      }),
    ).toEqual({ kind: "forbidden" });
    expect(
      await searchAvailability(as(users.customerA), deps, {
        ...day,
        date: "2026-02-30",
      }),
    ).toEqual(fails("validation_failed", "date"));
    expect(
      await searchAvailability(as(users.customerA), deps, {
        ...day,
        dealershipId: "nowhere",
      }),
    ).toEqual({ kind: "not_found" });
    expect(
      await searchAvailability(as(users.customerA), deps, {
        ...day,
        serviceTypeId: "nothing",
      }),
    ).toEqual({ kind: "not_found" });
  });

  it("counts an empty day, and a check with no suggestions", async () => {
    const closed = await searchAvailability(as(users.customerA), deps, {
      ...day,
      date: "2026-11-08",
    });
    expect(closed).toMatchObject({ kind: "ok", slots: [] });
    const far = await checkAvailability(as(users.customerA), deps, {
      dealershipId: LON,
      serviceTypeId: "service-oil-change",
      start: Date.parse(at("2027-06-01", "10:00")),
      transport: "wait",
    });
    expect(far).toMatchObject({
      kind: "ok",
      answer: {
        available: false,
        reasons: ["BEYOND_HORIZON"],
        suggestions: [],
      },
    });
    expect(world.metrics.count("availability_search_empty_total")).toBe(2);
    expect(
      await checkAvailability(as(users.customerA), deps, {
        dealershipId: LON,
        serviceTypeId: "nothing",
        start: Date.parse(at("2026-11-09", "10:00")),
        transport: "wait",
      }),
    ).toEqual({ kind: "not_found" });
  });
});

describe("searchCustomers and listTechnicians", () => {
  it("trims the text before counting it, and wants exactly one kind of search", async () => {
    expect(
      await searchCustomers(as(users.staffLondon), deps, { text: "  ab  " }),
    ).toEqual(fails("validation_failed", "text"));
    expect(
      await searchCustomers(as(users.staffLondon), deps, { text: "  Demo  " }),
    ).toMatchObject({ kind: "ok" });
    expect(
      await searchCustomers(as(users.customerA), deps, { text: "Demo" }),
    ).toEqual({ kind: "forbidden" });
    expect(
      await searchCustomers(as(users.staffLondon), deps, {
        registration: "ef22 dmc",
      }),
    ).toMatchObject({ kind: "ok" });
  });

  it("checks both dates and their order, and the dealership", async () => {
    const list = (from: string, to: string, dealershipId = LON) =>
      listTechnicians(as(users.staffLondon), deps, { dealershipId, from, to });
    expect(await list("2026-02-30", "2026-03-01")).toEqual(
      fails("validation_failed", "from"),
    );
    expect(await list("2026-03-01", "2026-13-01")).toEqual(
      fails("validation_failed", "to"),
    );
    expect(await list("2026-03-02", "2026-03-01")).toEqual(
      fails("validation_failed", "to"),
    );
    expect(await list("2026-03-01", "2026-04-01")).toEqual({
      kind: "search_range_too_large",
    });
    expect(await list("2026-03-01", "2026-03-31")).toMatchObject({
      kind: "ok",
    });
    expect(
      await listTechnicians(as(users.staffBoth), deps, {
        dealershipId: "nowhere",
        from: "2026-03-01",
        to: "2026-03-01",
      }),
    ).toEqual({ kind: "forbidden" });
  });
});

describe("trace ids", () => {
  it("makes a 32-character lower-case hex id and uses a valid traceparent's own", () => {
    expect(newTraceId()).toMatch(/^[0-9a-f]{32}$/);
    expect(traceIdOf(null)).toMatch(/^[0-9a-f]{32}$/);
    const id = "4bf92f3577b34da6a3ce929d0e0e4736";
    expect(traceIdOf(`00-${id}-00f067aa0ba902b7-01`)).toBe(id);
  });
});
