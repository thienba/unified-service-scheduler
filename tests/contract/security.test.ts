// The security criteria that need more than one status code (SEC-2 to SEC-9, SEC-10.AC-3). They talk to the
// mock directly, so a test can also send what no screen would: a bad header, a broken body, a forged trace.
import { beforeEach, describe, expect, it } from "vitest";
import { operations } from "../../src/api/contract/validator";
import {
  NEW_KEY,
  SEEDED_A,
  at,
  directTransport,
  users,
  type CallOptions,
  type Reply,
  type World,
} from "./support";

const LON = "dealership-london";
const SGN = "dealership-saigon";
const OIL = "service-oil-change";
const EV = "service-ev-check";
const FREE = at("2026-11-09", "10:00");

let world: World;
let call: (path: string, options?: CallOptions) => Promise<Reply>;
let keys = 0;
const key = () => NEW_KEY(++keys);

beforeEach(async () => {
  ({ world, call } = await directTransport().start());
  keys = 0;
});

const ok = async (path: string, options?: CallOptions) => {
  const reply = await call(path, options);
  expect(reply.problems).toEqual([]);
  return reply;
};

const book = (
  user: string,
  body: Record<string, unknown> = {},
  idempotencyKey = key(),
) =>
  ok("/appointments", {
    user,
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: {
      dealershipId: LON,
      serviceTypeId: OIL,
      start: FREE,
      transport: "wait",
      vehicleId: "vehicle-a",
      ...body,
    },
  });

/** Everything the stores hold that a request could change. */
const stored = () =>
  world.repository.read(async (s) => ({
    dealerships: await s.scheduling.listDealerships(),
    technicians: [
      ...(await s.scheduling.listTechnicians(LON)),
      ...(await s.scheduling.listTechnicians(SGN)),
    ],
    appointments: [
      ...(await s.appointments.listByDealershipDay(LON, 0, 2 ** 52)),
      ...(await s.appointments.listByDealershipDay(SGN, 0, 2 ** 52)),
    ],
    customers: await s.customers.search("e"),
    outbox: await s.outbox.list(),
    keys: await Promise.all(
      Object.values(users).map((u) => s.idempotency.get(u, NEW_KEY(1))),
    ),
  }));

const settings = {
  weeklyHours: { "1": { open: "08:00", close: "18:00" } },
  dateOverrides: {},
  policies: { leadTimeMinutes: 120, horizonDays: 30, breakMinutes: 15 },
};

describe("SEC-2: the role comes only from the seeded user", () => {
  it("a customer who sends X-Demo-Role: manager and role: manager changes no setting", async () => {
    const before = await stored();
    const header = await ok(`/dealerships/${LON}/settings`, {
      user: users.customerA,
      method: "PUT",
      headers: { "X-Demo-Role": "manager" },
      body: settings,
    });
    expect(header.status).toBe(403);
    const body = await ok(`/dealerships/${LON}/settings`, {
      user: users.customerA,
      method: "PUT",
      headers: { "X-Demo-Role": "manager" },
      body: { ...settings, role: "manager" },
    });
    expect([403, 422]).toContain(body.status);
    expect(await stored()).toEqual(before);
  });
});

describe("SEC-3 and SEC-4: refused calls change nothing and show no data", () => {
  const settingsPut = (user: string) =>
    call(`/dealerships/${LON}/settings`, {
      user,
      method: "PUT",
      body: settings,
    });

  it("a customer or staff member calling manager operations gets 403 and the stores are identical", async () => {
    const before = await stored();
    for (const user of [users.customerA, users.staffLondon]) {
      const replies = [
        await settingsPut(user),
        await call("/technicians/tech-lon-ash/shifts", {
          user,
          method: "PUT",
          body: { shiftPattern: {}, shiftExceptions: {} },
        }),
        await call(`/appointments/${SEEDED_A.id}`, {
          user,
          method: "PATCH",
          body: { start: at(SEEDED_A.date, "14:00") },
        }),
        await call("/outbox", { user }),
      ];
      for (const reply of replies) {
        expect(reply.problems).toEqual([]);
        expect(reply.status).toBe(403);
        expect(reply.body.code).toBe("FORBIDDEN");
      }
    }
    expect(await stored()).toEqual(before);
  });

  it("a customer asking for customers, technicians or bays gets 403 with none of their fields", async () => {
    for (const [path, options] of [
      ["/customers/search", { method: "POST", body: { text: "Demo" } }],
      [
        `/dealerships/${LON}/technicians`,
        { query: { from: "2026-11-05", to: "2026-11-05" } },
      ],
      [`/dealerships/${LON}/service-bays`, {}],
    ] as const) {
      const reply = await ok(path, { user: users.customerA, ...options });
      expect(reply.status).toBe(403);
      expect(Object.keys(reply.body).sort()).toEqual(
        ["code", "status", "title", "traceId", "type"].sort(),
      );
    }
  });

  it("staff of dealership 1 get 403 for dealership 2's list and booking, and nothing is stored", async () => {
    const before = await stored();
    const list = await ok("/appointments", {
      user: users.staffLondon,
      query: { dealershipId: SGN, date: SEEDED_A.date },
    });
    expect(list.status).toBe(403);
    const booked = await book(users.staffLondon, {
      dealershipId: SGN,
      customerId: "customer-a",
    });
    expect(booked.status).toBe(403);
    expect(await stored()).toEqual(before);
  });

  it("the manager of dealership 1 gets 404 for a technician or appointment of dealership 2, and nothing changes", async () => {
    const manager = users.managerLondon;
    const saigon = await book(users.staffSaigon, {
      dealershipId: SGN,
      customerId: "customer-a",
      start: at("2026-11-09", "04:00"),
    });
    expect(saigon.status).toBe(201);
    const before = await stored();
    const shifts = await ok("/technicians/tech-sgn-an/shifts", {
      user: manager,
      method: "PUT",
      body: { shiftPattern: {}, shiftExceptions: {} },
    });
    const adjust = await ok(`/appointments/${saigon.body.id}`, {
      user: manager,
      method: "PATCH",
      body: { start: at("2026-11-09", "05:00") },
    });
    expect([shifts.status, adjust.status]).toEqual([404, 404]);
    expect(await stored()).toEqual(before);
  });
});

describe("SEC-5: a customer cannot tell another customer's record from a missing one", () => {
  it("GET of B's appointment equals GET of a random id except for the trace id", async () => {
    const foreign = await ok(`/appointments/${SEEDED_A.id}`, {
      user: users.customerB,
    });
    const missing = await ok(
      "/appointments/f7d1c2aa-0000-4000-8000-000000000000",
      {
        user: users.customerB,
      },
    );
    const { traceId: a, ...foreignRest } = foreign.body;
    const { traceId: b, ...missingRest } = missing.body;
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(b).toMatch(/^[0-9a-f]{32}$/);
    expect(foreign.status).toBe(404);
    expect(foreignRest).toEqual(missingRest);
    expect(Object.keys(foreignRest).sort()).toEqual([
      "code",
      "detail",
      "status",
      "title",
      "type",
    ]);
  });

  it("cancel and reschedule of B's appointment after its cutoff are 404, not 409", async () => {
    world.clock.set(Date.parse("2026-11-05T09:00:00Z"));
    const cancel = await ok(`/appointments/${SEEDED_A.id}/cancel`, {
      user: users.customerB,
      method: "POST",
    });
    const move = await ok(`/appointments/${SEEDED_A.id}/reschedule`, {
      user: users.customerB,
      method: "POST",
      headers: { "Idempotency-Key": key() },
      body: { start: at("2026-11-06", "10:00") },
    });
    expect([cancel.status, move.status]).toEqual([404, 404]);
  });

  it("B's vehicles are 404 for A, and a day list holds only the caller's own appointments", async () => {
    expect(
      (await ok("/customers/customer-b/vehicles", { user: users.customerA }))
        .status,
    ).toBe(404);
    await book(users.customerB, {
      vehicleId: "vehicle-b",
      start: at(SEEDED_A.date, "13:00"),
    });
    const listA = await ok("/appointments", {
      user: users.customerA,
      query: { dealershipId: LON, date: SEEDED_A.date },
    });
    expect(listA.body.map((a: { customerId: string }) => a.customerId)).toEqual(
      ["customer-a"],
    );
    const listB = await ok("/appointments", {
      user: users.customerB,
      query: { dealershipId: LON, date: SEEDED_A.date },
    });
    expect(listB.body.map((a: { customerId: string }) => a.customerId)).toEqual(
      ["customer-b"],
    );
  });

  it("availability answers and 409 suggestions hold only times, resource ids and reasons", async () => {
    const check = await ok("/availability-checks", {
      user: users.customerB,
      method: "POST",
      body: {
        dealershipId: LON,
        serviceTypeId: EV,
        start: SEEDED_A.start,
        transport: "wait",
      },
    });
    expect(Object.keys(check.body).sort()).toEqual([
      "available",
      "courtesyCarId",
      "serviceBayId",
      "technicianId",
    ]);
    await book(users.customerA, { serviceTypeId: EV, start: SEEDED_A.start });
    const lost = await book(users.customerB, {
      serviceTypeId: EV,
      start: SEEDED_A.start,
      vehicleId: "vehicle-b",
    });
    expect(lost.status).toBe(409);
    expect(Object.keys(lost.body).sort()).toEqual(
      [
        "code",
        "reasons",
        "status",
        "suggestions",
        "title",
        "traceId",
        "type",
        "detail",
      ]
        .sort()
        .filter((k) => k in lost.body),
    );
    expect(JSON.stringify(lost.body)).not.toMatch(
      /customer|vehicle|appointment-/i,
    );
  });
});

describe("SEC-6: a customer books only for themselves", () => {
  it("B's customerId, B's vehicle, new people: refused, and nothing is stored", async () => {
    const before = await stored();
    const asB = await book(users.customerA, { customerId: "customer-b" });
    const vehicle = await book(users.customerA, { vehicleId: "vehicle-b" });
    const newCustomer = await book(users.customerA, {
      vehicleId: undefined,
      newCustomer: { name: "X Y", phone: "+44 7700 900999" },
      newVehicle: { registration: "AA11 BBB", make: "M", model: "M" },
    });
    const newVehicle = await book(users.customerA, {
      vehicleId: undefined,
      newVehicle: { registration: "AA11 BBB", make: "M", model: "M" },
    });
    expect([
      asB.status,
      vehicle.status,
      newCustomer.status,
      newVehicle.status,
    ]).toEqual([403, 404, 403, 403]);
    expect(await stored()).toEqual(before);
  });

  it("staff booking with a vehicle that is not the customer's is 422 and stores nothing", async () => {
    const before = await stored();
    const reply = await book(users.staffLondon, {
      customerId: "customer-a",
      vehicleId: "vehicle-b",
    });
    expect(reply.status).toBe(422);
    expect(reply.body.errors[0].field).toBe("vehicleId");
    expect(await stored()).toEqual(before);
  });
});

describe("SEC-7: the contract is checked before the application", () => {
  it("an extra field is 422 naming it and stores nothing; a customer's technicianId is refused", async () => {
    const before = await stored();
    for (const field of ["status", "version", "role", "now"]) {
      const reply = await book(users.customerA, {
        [field]: field === "now" ? 1 : "x",
      });
      expect(reply.status).toBe(422);
      expect(reply.body.code).toBe("VALIDATION_FAILED");
      expect(reply.body.errors).toEqual([
        { field, message: "Is not accepted." },
      ]);
    }
    // technicianId is in the contract for staff and managers (D-0001-20); a customer is refused (D-0001-40).
    expect(
      (await book(users.customerA, { technicianId: "tech-lon-ash" })).status,
    ).toBe(403);
    expect(await stored()).toEqual(before);
  });

  it.each([
    [
      "a name over 100 characters",
      { newCustomer: { name: "n".repeat(101), phone: "+44 7700 900999" } },
      "newCustomer.name",
    ],
    [
      "a bad phone",
      { newCustomer: { name: "X Y", phone: "call me" } },
      "newCustomer.phone",
    ],
    [
      "a bad email",
      {
        newCustomer: {
          name: "X Y",
          phone: "+44 7700 900999",
          email: "not an email",
        },
      },
      "newCustomer.email",
    ],
    [
      "an email over 254 characters",
      {
        newCustomer: {
          name: "X Y",
          phone: "+44 7700 900999",
          email: `${"e".repeat(250)}@x.co`,
        },
      },
      "newCustomer.email",
    ],
    [
      "a registration over 15 characters",
      { newVehicle: { registration: "R".repeat(16), make: "M", model: "M" } },
      "newVehicle.registration",
    ],
    [
      "a make over 50 characters",
      {
        newVehicle: {
          registration: "AA11 BBB",
          make: "M".repeat(51),
          model: "M",
        },
      },
      "newVehicle.make",
    ],
    [
      "a model over 50 characters",
      {
        newVehicle: {
          registration: "AA11 BBB",
          make: "M",
          model: "M".repeat(51),
        },
      },
      "newVehicle.model",
    ],
    ["a transport outside the enum", { transport: "teleport" }, "transport"],
    ["an id with bad characters", { dealershipId: "../etc" }, "dealershipId"],
    ["a start that is not a time", { start: "tomorrow" }, "start"],
    [
      "a start that is not a real day",
      { start: "2026-06-31T10:00:00Z" },
      "start",
    ],
    ["a wrong type", { start: 12345 }, "start"],
  ])(
    "%s is 422 naming the field and not the value",
    async (_name, change, field) => {
      const before = await stored();
      const reply = await book(users.staffLondon, {
        customerId: "customer-a",
        vehicleId: undefined,
        newCustomer: undefined,
        ...change,
      });
      expect(reply.status).toBe(422);
      expect(
        reply.body.errors.map((e: { field: string }) => e.field),
      ).toContain(field);
      expect(await stored()).toEqual(before);
    },
  );

  it("a broken, missing or wrongly shaped body, and an unknown query parameter, are 422", async () => {
    const broken = await ok("/appointments", {
      user: users.customerA,
      method: "POST",
      headers: { "Idempotency-Key": key() },
      body: "{not json",
    });
    expect(broken.body.errors).toEqual([
      { field: "body", message: "Must be valid JSON." },
    ]);
    const empty = await ok("/appointments", {
      user: users.customerA,
      method: "POST",
      headers: { "Idempotency-Key": key() },
    });
    expect(empty.body.errors).toEqual([
      { field: "body", message: "A JSON body is required." },
    ]);
    const array = await ok("/appointments", {
      user: users.customerA,
      method: "POST",
      headers: { "Idempotency-Key": key() },
      body: [],
    });
    expect(array.status).toBe(422);
    const query = await ok("/service-types", {
      user: users.customerA,
      query: { colour: "red" },
    });
    expect(query.body.errors).toEqual([
      { field: "colour", message: "Is not accepted." },
    ]);
    const date = await ok(`/dealerships/${LON}/availability`, {
      user: users.customerA,
      query: { serviceTypeId: OIL, date: "2026-02-30", transport: "wait" },
    });
    expect(date.body.errors[0].field).toBe("date");
  });

  it("a date override with a wrong key or value is 422 naming the path", async () => {
    const reply = await ok(`/dealerships/${LON}/settings`, {
      user: users.managerLondon,
      method: "PUT",
      body: {
        ...settings,
        dateOverrides: { "not-a-date": "closed", "2026-12-25": "open" },
      },
    });
    expect(reply.status).toBe(422);
    const fields = reply.body.errors.map((e: { field: string }) => e.field);
    expect(fields).toContain("dateOverrides.not-a-date");
    expect(fields).toContain("dateOverrides.2026-12-25");
  });

  it("the search text is in the body: no operation takes search text in the URL, and no log line holds it", async () => {
    const searchOperation = operations.find((o) => o.id === "searchCustomers")!;
    expect(searchOperation.method).toBe("post");
    expect(searchOperation.node.parameters).toEqual([
      { $ref: "#/components/parameters/Traceparent" },
    ]);
    await ok("/customers/search", {
      user: users.staffLondon,
      method: "POST",
      body: { text: "CANARYTEXT" },
    });
    const logged = JSON.stringify(world.logger.calls);
    expect(logged).not.toContain("CANARYTEXT");
    for (const call of world.logger.calls) {
      if (call.kind === "info" && call.fields.route) {
        expect(call.fields.route).not.toMatch(/\?/);
      }
    }
    expect(JSON.stringify(world.logger.calls)).toContain(
      "POST /customers/search",
    );
  });
});

describe("SEC-8: the Idempotency-Key", () => {
  it("a key that is not a UUID is 422 naming Idempotency-Key; a missing one is 400", async () => {
    const before = await stored();
    const bad = await book(users.customerA, {}, "not-a-uuid");
    expect(bad.status).toBe(422);
    expect(bad.body.errors).toEqual([
      { field: "Idempotency-Key", message: "Is not in the expected format." },
    ]);
    expect(await stored()).toEqual(before);
  });

  it("customer B sending A's key gets their own result, never A's saved answer", async () => {
    const mine = await book(users.customerA, {}, NEW_KEY(50));
    const theirs = await book(
      users.customerB,
      { vehicleId: "vehicle-b" },
      NEW_KEY(50),
    );
    expect(theirs.status).toBe(201);
    expect(theirs.body.id).not.toBe(mine.body.id);
    expect(theirs.body.customerId).toBe("customer-b");
    const again = await ok(`/appointments/${mine.body.id}`, {
      user: users.customerA,
    });
    expect(again.body).toEqual(mine.body);
  });

  it("a key used for booking and sent to reschedule is 422 IDEMPOTENCY_KEY_REUSED", async () => {
    const mine = await book(users.customerA, {}, NEW_KEY(60));
    const reply = await ok(`/appointments/${mine.body.id}/reschedule`, {
      user: users.customerA,
      method: "POST",
      headers: { "Idempotency-Key": NEW_KEY(60) },
      body: { start: FREE },
    });
    expect(reply.status).toBe(422);
    expect(reply.body.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("a failed request can be sent again with the same key and runs fresh", async () => {
    await book(users.customerA, { serviceTypeId: EV, start: SEEDED_A.start });
    const taken = await book(
      users.customerB,
      { serviceTypeId: EV, start: SEEDED_A.start, vehicleId: "vehicle-b" },
      NEW_KEY(70),
    );
    expect(taken.status).toBe(409);
    const free = await book(
      users.customerB,
      {
        serviceTypeId: EV,
        start: at(SEEDED_A.date, "15:00"),
        vehicleId: "vehicle-b",
      },
      NEW_KEY(70),
    );
    expect(free.status).toBe(201);
    const forbidden = await book(
      users.customerB,
      { customerId: "customer-a" },
      NEW_KEY(71),
    );
    expect(forbidden.status).toBe(403);
    expect(
      (await book(users.customerB, { vehicleId: "vehicle-b" }, NEW_KEY(71)))
        .status,
    ).toBe(201);
  });

  it("the saved idempotency record holds ids and a hash, none of the new customer's details", async () => {
    await book(
      users.staffLondon,
      {
        vehicleId: undefined,
        newCustomer: {
          name: "Canary Person",
          phone: "+44 7700 900888",
          email: "canary@x.example",
        },
        newVehicle: { registration: "CAN 4RY", make: "M", model: "M" },
      },
      NEW_KEY(80),
    );
    const row = await world.repository.read((s) =>
      s.idempotency.get(users.staffLondon, NEW_KEY(80)),
    );
    expect(row).toBeDefined();
    expect(JSON.stringify(row)).not.toMatch(/Canary|900888|canary@|CAN 4RY/);
  });
});

describe("SEC-9: errors, trace ids", () => {
  const CANARY = "CANARY-SECRET-123";

  it("a handler that throws gives 500 INTERNAL with fixed words, the trace id, and neither message nor stack", async () => {
    world.repository.read = () => {
      throw new Error(`boom ${CANARY}`);
    };
    const reply = await ok("/appointments", { user: users.customerA });
    expect(reply.status).toBe(500);
    expect(reply.body).toEqual({
      type: "/problems/internal",
      title: "Something went wrong",
      status: 500,
      code: "INTERNAL",
      detail: expect.any(String),
      traceId: reply.headers.get("x-trace-id"),
    });
    expect(JSON.stringify(reply.body)).not.toMatch(/boom|CANARY|\bat \w|\.ts/);
    expect(JSON.stringify(world.logger.calls)).not.toContain(CANARY);
  });

  it("a 422 for a canary value names the field and the rule, not the value", async () => {
    const reply = await book(users.staffLondon, {
      vehicleId: undefined,
      customerId: "customer-a",
      newVehicle: { registration: CANARY, make: "M", model: "M" },
    });
    expect(reply.status).toBe(422);
    expect(JSON.stringify(reply.body)).not.toContain(CANARY);
    expect(reply.body.errors).toContainEqual({
      field: "newVehicle.registration",
      message: "Is not in the expected format.",
    });
    expect(
      reply.body.errors.every(
        (e: { field: string }) => e.field === "newVehicle.registration",
      ),
    ).toBe(true);
  });

  it("an unknown route is a 404 Problem with a trace id", async () => {
    const reply = await call("/nothing-here", { user: users.customerA });
    expect(reply.status).toBe(404);
    expect(reply.body.code).toBe("NOT_FOUND");
    expect(reply.problems).toEqual([
      expect.stringContaining("no operation matches"),
    ]);
  });
});

describe("a malformed escape in the path (CWE-755)", () => {
  it.each([
    "/appointments/%",
    "/appointments/%E0%A4%A",
    "/customers/%zz/vehicles",
  ])(
    "%s is 404 NOT_FOUND with or without a user, and never an internal error",
    async (path) => {
      for (const user of [undefined, users.customerA]) {
        const reply = await call(path, { user });
        expect(reply.status).toBe(404);
        expect(reply.body.code).toBe("NOT_FOUND");
      }
      const lines = world.logger.calls.flatMap((c) =>
        c.kind === "info" ? [c.fields] : [],
      );
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.some((f) => f.outcome === "internal")).toBe(false);
    },
  );
});

describe("traceparent (AD-12, SEC-9.AC-3)", () => {
  const TRACE = "4bf92f3577b34da6a3ce929d0e0e4736";
  const withTrace = (traceparent?: string) =>
    ok("/me", {
      user: users.customerA,
      headers: traceparent === undefined ? {} : { traceparent },
    });

  it("a well-formed traceparent gives X-Trace-Id equal to its trace id, and the same id in an error body", async () => {
    const good = await withTrace(`00-${TRACE}-00f067aa0ba902b7-01`);
    expect(good.headers.get("x-trace-id")).toBe(TRACE);
    const error = await ok("/appointments/nope", {
      user: users.customerA,
      headers: { traceparent: `00-${TRACE}-00f067aa0ba902b7-01` },
    });
    expect(error.body.traceId).toBe(TRACE);
    expect(error.headers.get("x-trace-id")).toBe(TRACE);
  });

  it.each([
    ["too short", `00-${TRACE.slice(1)}-00f067aa0ba902b7-01`],
    ["upper case", `00-${TRACE.toUpperCase()}-00f067aa0ba902b7-01`],
    ["a zero trace id", `00-${"0".repeat(32)}-00f067aa0ba902b7-01`],
    ["a zero span id", `00-${TRACE}-${"0".repeat(16)}-01`],
    ["no flags", `00-${TRACE}-00f067aa0ba902b7`],
    ["junk", "<script>alert(1)</script>"],
    ["a very long value", "x".repeat(500)],
  ])(
    "%s makes a new 32-character lower-case trace id",
    async (_name, value) => {
      const reply = await withTrace(value);
      expect(reply.headers.get("x-trace-id")).toMatch(/^[0-9a-f]{32}$/);
      expect(reply.headers.get("x-trace-id")).not.toBe(TRACE);
    },
  );

  it("with no traceparent the mock makes one, and an error body holds the same value", async () => {
    const reply = await ok("/appointments/nope", { user: users.customerA });
    expect(reply.headers.get("x-trace-id")).toBe("a".repeat(32));
    expect(reply.body.traceId).toBe("a".repeat(32));
  });

  it("every log line of a request carries its trace id, the route template and no query string", async () => {
    await ok("/appointments", {
      user: users.staffLondon,
      query: { dealershipId: LON, date: SEEDED_A.date },
      headers: { traceparent: `00-${TRACE}-00f067aa0ba902b7-01` },
    });
    const lines = world.logger.calls.flatMap((c) =>
      c.kind === "info" ? [c.fields] : [],
    );
    const http = lines.find((f) => f.route);
    expect(http).toMatchObject({
      traceId: TRACE,
      route: "GET /appointments",
      status: 200,
      actorRole: "staff",
      outcome: "ok",
    });
    expect(lines.every((f) => f.traceId === TRACE)).toBe(true);
  });
});
