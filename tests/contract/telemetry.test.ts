// Trace ids, structured logs and metrics through the mock (NFR-6, AD-12, SEC-10, SEC-13.AC-4, SEC-14.AC-3).
// The API gets the real logger and metrics here; the console is a list of lines.
import { beforeEach, describe, expect, it } from "vitest";
import { operations } from "../../src/api/contract/validator";
import { checkResponse } from "./check-response";
import type { CounterName } from "../../src/application/ports/telemetry";
import customerFile from "../../src/infrastructure/seed/customers.json";
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
const OIL = "service-oil-change";
const EV = "service-ev-check";
const FREE = at("2026-11-09", "10:00");
const TRACE = "4bf92f3577b34da6a3ce929d0e0e4736";
const SPAN = "00f067aa0ba902b7";

let world: World;
let call: (path: string, options?: CallOptions) => Promise<Reply>;
let keys = 0;
const key = () => NEW_KEY(++keys);

beforeEach(async () => {
  ({ world, call } = await directTransport({ real: true }).start());
  keys = 0;
});

const lines = () => world.telemetry.reader.lines();
const counters = () => world.telemetry.reader.counters();
const counter = (name: CounterName, labels: Record<string, string>) =>
  counters().find(
    (c) =>
      c.name === name && JSON.stringify(c.labels) === JSON.stringify(labels),
  )?.value;

const book = (
  user: string,
  body: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) =>
  call("/appointments", {
    user,
    method: "POST",
    headers: { "Idempotency-Key": key(), ...headers },
    body: {
      dealershipId: LON,
      serviceTypeId: OIL,
      start: FREE,
      transport: "wait",
      vehicleId: "vehicle-a",
      ...body,
    },
  });

/** A 409: customer B takes the second EV technician, then staff want the same time for customer C. */
async function conflict(headers: Record<string, string> = {}) {
  const first = await book(users.customerB, {
    serviceTypeId: EV,
    start: SEEDED_A.start,
    vehicleId: "vehicle-b",
  });
  expect(first.status).toBe(201);
  const lost = await book(
    users.staffLondon,
    {
      serviceTypeId: EV,
      start: SEEDED_A.start,
      customerId: "customer-c",
      vehicleId: "vehicle-c",
    },
    headers,
  );
  expect(lost.status).toBe(409);
  return lost;
}

describe("trace ids (AD-12)", () => {
  it("the traceparent of the client is the trace id of every line and of X-Trace-Id", async () => {
    const reply = await call(`/appointments/${SEEDED_A.id}`, {
      user: users.customerA,
      headers: { traceparent: `00-${TRACE}-${SPAN}-01` },
    });
    expect(reply.headers.get("x-trace-id")).toBe(TRACE);
    expect(lines().length).toBeGreaterThan(1);
    expect(lines().every((l) => l.traceId === TRACE)).toBe(true);
    expect(world.output.every((l) => JSON.parse(l).traceId === TRACE)).toBe(
      true,
    );
  });

  it("a request with no traceparent gets a new trace id, used in the lines and the header", async () => {
    const reply = await call("/me", { user: users.customerA });
    expect(reply.headers.get("x-trace-id")).toBe("a".repeat(32));
    expect(lines().every((l) => l.traceId === "a".repeat(32))).toBe(true);
  });
});

describe("log lines", () => {
  it("every line is valid JSON; each request line has the trace id of its response, the dealership and the outcome", async () => {
    const traces: Record<string, string> = {};
    let n = 0;
    const send = async (path: string, options: CallOptions) => {
      const id = String(++n).padStart(32, "0").replace(/^0/, "1");
      const reply = await call(path, {
        ...options,
        headers: { ...options.headers, traceparent: `00-${id}-${SPAN}-01` },
      });
      expect(reply.headers.get("x-trace-id")).toBe(id);
      traces[id] = path;
      return id;
    };
    await send(`/dealerships/${LON}/availability`, {
      user: users.customerA,
      query: { serviceTypeId: OIL, date: "2026-11-09", transport: "wait" },
    });
    await send("/appointments", {
      user: users.staffLondon,
      query: { dealershipId: LON, date: SEEDED_A.date },
    });
    await send("/appointments", {
      user: users.customerA,
      method: "POST",
      headers: { "Idempotency-Key": key() },
      body: {
        dealershipId: LON,
        serviceTypeId: OIL,
        start: FREE,
        transport: "wait",
        vehicleId: "vehicle-a",
      },
    });
    await send(`/appointments/${SEEDED_A.id}/cancel`, {
      user: users.managerLondon,
      method: "POST",
    });

    for (const line of world.output)
      expect(() => JSON.parse(line)).not.toThrow();
    expect(world.output.map((l) => JSON.parse(l))).toEqual(lines());
    for (const id of Object.keys(traces)) {
      const mine = lines().filter((l) => l.traceId === id);
      const own = mine.filter((l) => !l.msg.startsWith("step."));
      expect(own.length).toBeGreaterThan(0);
      for (const line of own) {
        expect(line.dealershipId).toBe(LON);
        expect(line.outcome).toBeDefined();
      }
    }
  });

  it("the route is the path template and the query string is never recorded", async () => {
    await call(`/appointments/${SEEDED_A.id}`, {
      user: users.customerA,
      query: { secret: "CANARYQ" },
    });
    await call(`/dealerships/${LON}/availability`, {
      user: users.customerA,
      query: { serviceTypeId: OIL, date: "2026-11-09", transport: "wait" },
    });
    const routes = lines().flatMap((l) => (l.route ? [l.route] : []));
    expect(new Set(routes)).toEqual(
      new Set([
        "GET /appointments/{appointmentId}",
        "GET /dealerships/{dealershipId}/availability",
      ]),
    );
    const labels = [...counters(), ...world.telemetry.reader.histograms()]
      .map((m) => m.labels.route)
      .filter((route) => route !== undefined);
    expect(new Set(labels)).toEqual(new Set(routes));
    expect(JSON.stringify([lines(), counters()])).not.toMatch(/CANARYQ|\?/);
  });

  it("a 409 booking logs one appointment.book line with the status, the outcome, the reasons and the route", async () => {
    await conflict();
    const booked = lines().filter(
      (l) => l.msg === "appointment.book" && l.status === 409,
    );
    expect(booked).toEqual([
      expect.objectContaining({
        route: "POST /appointments",
        method: "POST",
        status: 409,
        outcome: "slot_unavailable",
        reasons: expect.arrayContaining([expect.any(String)]),
        dealershipId: LON,
        actorRole: "staff",
      }),
    ]);
  });

  it("a confirmed booking logs outcome confirmed with the appointment, technician and bay", async () => {
    const reply = await book(users.customerA);
    expect(reply.status).toBe(201);
    expect(lines().filter((l) => l.msg === "appointment.book")).toEqual([
      expect.objectContaining({
        status: 201,
        outcome: "confirmed",
        appointmentId: reply.body.id,
        technicianId: reply.body.technicianId,
        serviceBayId: reply.body.serviceBayId,
        route: "POST /appointments",
      }),
    ]);
  });

  it("the steps of a booking are child lines with the same trace id and their own duration", async () => {
    await book(users.customerA, {}, { traceparent: `00-${TRACE}-${SPAN}-01` });
    const steps = lines().filter((l) => l.msg.startsWith("step."));
    expect(steps.map((l) => l.msg)).toEqual(
      expect.arrayContaining(["step.load", "step.check", "step.write"]),
    );
    for (const step of steps) {
      expect(step.traceId).toBe(TRACE);
      expect(typeof step.durationMs).toBe("number");
    }
  });

  it("a 409 also logs the suggest step", async () => {
    await conflict();
    expect(lines().some((l) => l.msg === "step.suggest")).toBe(true);
  });

  it("a forced 500 is logged at level error with fixed words", async () => {
    world.repository.read = () => {
      throw new Error("boom Zz Canary Name");
    };
    const reply = await call("/appointments", { user: users.customerA });
    expect(reply.status).toBe(500);
    const failed = lines().find((l) => l.level === "error");
    expect(failed).toMatchObject({
      msg: "http.request",
      status: 500,
      outcome: "internal",
      traceId: reply.headers.get("x-trace-id"),
    });
  });
});

describe("metrics (NFR-6)", () => {
  it("a booking counts one confirmed appointment and a 201 request", async () => {
    await book(users.customerA);
    expect(
      counter("appointments_confirmed_total", {
        dealershipId: LON,
        actorRole: "customer",
      }),
    ).toBe(1);
    expect(
      counter("http_requests_total", {
        route: "POST /appointments",
        method: "POST",
        status: "201",
      }),
    ).toBe(1);
  });

  it("a 409 counts a conflict with the first reason, and its duration is under outcome ok", async () => {
    const lost = await conflict();
    expect(
      counter("appointment_conflicts_total", {
        dealershipId: LON,
        reason: lost.body.reasons[0],
      }),
    ).toBe(1);
    const durations = world.telemetry.reader.histograms();
    expect(
      durations.find(
        (h) =>
          h.name === "http_request_duration_ms" &&
          h.labels.route === "POST /appointments" &&
          h.labels.outcome === "ok",
      )?.count,
    ).toBe(2);
    expect(durations.some((h) => h.labels.outcome === "failed")).toBe(false);
  });

  it("a 500 is recorded under outcome failed", async () => {
    world.repository.read = () => {
      throw new Error("boom");
    };
    await call("/appointments", { user: users.customerA });
    expect(
      world.telemetry.reader
        .histograms()
        .find((h) => h.name === "http_request_duration_ms")?.labels,
    ).toEqual({ route: "GET /appointments", method: "GET", outcome: "failed" });
    expect(
      counter("http_requests_total", {
        route: "GET /appointments",
        method: "GET",
        status: "500",
      }),
    ).toBe(1);
  });

  it("a day with no free time counts an empty search, and every search records its duration", async () => {
    const search = (date: string) =>
      call(`/dealerships/${LON}/availability`, {
        user: users.customerA,
        query: { serviceTypeId: OIL, date, transport: "wait" },
      });
    expect((await search("2026-11-08")).body.slots).toEqual([]);
    expect(
      counter("availability_search_empty_total", { dealershipId: LON }),
    ).toBe(1);
    await search("2026-11-09");
    await call("/availability-checks", {
      user: users.customerA,
      method: "POST",
      body: {
        dealershipId: LON,
        serviceTypeId: EV,
        start: SEEDED_A.start,
        transport: "wait",
      },
    });
    await conflict();
    const kinds = world.telemetry.reader
      .histograms()
      .filter((h) => h.name === "availability_search_duration_ms")
      .map((h) => h.labels.kind);
    expect(new Set(kinds)).toEqual(new Set(["day", "check", "suggest"]));
    expect(
      counter("availability_search_empty_total", { dealershipId: LON }),
    ).toBe(1);
  });

  it("a replayed request counts one replay, and a cancel is counted once only", async () => {
    const same = key();
    const first = await book(users.customerA, {}, { "Idempotency-Key": same });
    const again = await book(users.customerA, {}, { "Idempotency-Key": same });
    expect(again.body.id).toBe(first.body.id);
    expect(
      counter("idempotent_replays_total", { route: "POST /appointments" }),
    ).toBe(1);

    for (let i = 0; i < 2; i++) {
      const cancelled = await call(`/appointments/${SEEDED_A.id}/cancel`, {
        user: users.managerLondon,
        method: "POST",
      });
      expect(cancelled.status).toBe(200);
    }
    expect(
      counter("appointments_cancelled_total", {
        dealershipId: LON,
        actorRole: "manager",
      }),
    ).toBe(1);
  });
});

describe("the demo endpoints (AD-2, AD-17)", () => {
  it("GET /_demo/telemetry answers 200 with the lines and the metrics, and an X-Trace-Id", async () => {
    await book(users.customerA);
    await conflict();
    const reply = await call("/_demo/telemetry", { user: users.customerA });
    expect(reply.status).toBe(200);
    expect(reply.problems).toEqual([]);
    expect(reply.headers.get("x-trace-id")).toBe("a".repeat(32));
    expect(reply.body.logs.length).toBeGreaterThan(0);
    expect(reply.body.counters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "appointments_confirmed_total" }),
        expect.objectContaining({ name: "appointment_conflicts_total" }),
      ]),
    );
    expect(reply.body.histograms[0]).toEqual({
      name: expect.any(String),
      labels: expect.any(Object),
      count: expect.any(Number),
      sum: expect.any(Number),
      p50: expect.any(Number),
      p95: expect.any(Number),
      max: expect.any(Number),
    });
    const day = reply.body.gauges.find(
      (g: { labels: { dealershipId: string; date: string } }) =>
        g.labels.dealershipId === LON && g.labels.date === "2026-11-02",
    );
    expect(day.name).toBe("bay_utilisation_ratio");
  });

  it("POST /_demo/reset answers 204, the booking is gone and the seeded appointments are back", async () => {
    const listed = () =>
      call("/appointments", {
        user: users.staffLondon,
        query: { dealershipId: LON, date: "2026-11-09" },
      });
    const before = (await listed()).body;
    await book(users.customerA);
    expect((await listed()).body).toHaveLength(before.length + 1);
    await call(`/appointments/${SEEDED_A.id}/cancel`, {
      user: users.managerLondon,
      method: "POST",
    });

    const reset = await call("/_demo/reset", {
      user: users.customerA,
      method: "POST",
    });
    expect(reset.status).toBe(204);
    expect(reset.problems).toEqual([]);
    expect((await listed()).body).toEqual(before);
    const seeded = await call(`/appointments/${SEEDED_A.id}`, {
      user: users.customerA,
    });
    expect(seeded.body.status).toBe("confirmed");
  });

  it("every operation under /_demo/ has the tag demo-only, and no other operation has it", () => {
    for (const operation of operations) {
      expect(operation.tags.includes("demo-only"), operation.id).toBe(
        operation.path.startsWith("/_demo/"),
      );
    }
    expect(operations.filter((o) => o.tags.includes("demo-only"))).toHaveLength(
      3,
    );
  });

  const SEEDED_USERS = [
    "user-customer-a",
    "user-customer-b",
    "user-staff-london",
    "user-manager-london",
    "user-staff-saigon",
    "user-manager-saigon",
    // D-0001-144: every customer can be picked; the seeded walk-in customer has no user of their own.
    "user-customer-c",
  ];

  it("GET /_demo/users answers 200 with no X-Demo-User: the six users and one per other customer, each id, name, role and dealershipIds only", async () => {
    const reply = await call("/_demo/users");
    expect(reply.status).toBe(200);
    expect(reply.problems).toEqual([]);
    expect(reply.body.map((u: { id: string }) => u.id).sort()).toEqual(
      [...SEEDED_USERS].sort(),
    );
    for (const user of reply.body) {
      expect(Object.keys(user).sort()).toEqual([
        "dealershipIds",
        "id",
        "name",
        "role",
      ]);
    }
    // D-0001-89: no staff member is linked to two dealerships.
    for (const user of reply.body.filter(
      (u: { role: string }) => u.role === "staff",
    )) {
      expect(user.dealershipIds).toHaveLength(1);
    }
    const text = JSON.stringify(reply.body);
    expect(text).not.toContain("customerId");
    // The user's name is the label the switcher shows; the customer's phone and email must not appear.
    for (const customer of customerFile.customers) {
      expect(text).not.toContain(customer.phone);
      expect(text).not.toContain(customer.email);
    }
  });

  it("the contract check fails when the body holds customerId or any other field", () => {
    const operation = operations.find((o) => o.id === "getDemoUsers")!;
    const good = { id: "u", name: "N", role: "customer", dealershipIds: [] };
    const headers = new Headers({
      "X-Trace-Id": "a".repeat(32),
      "Content-Type": "application/json",
    });
    expect(checkResponse(operation, 200, headers, [good])).toEqual([]);
    for (const extra of [
      { customerId: "customer-a" },
      { phone: "+44 0" },
      { email: "a@b.c" },
    ]) {
      expect(
        checkResponse(operation, 200, headers, [{ ...good, ...extra }]),
      ).not.toEqual([]);
    }
  });

  it("after POST /_demo/reset the same seven users are returned", async () => {
    const before = (await call("/_demo/users")).body;
    await book(users.customerA);
    await call("/_demo/reset", { user: users.customerA, method: "POST" });
    const after = await call("/_demo/users");
    expect(after.body).toEqual(before);
    expect(after.body).toHaveLength(7);
  });
});

const CANARIES = [
  "Zz Canary Name",
  "+0 000 0000",
  "canary@example.invalid",
  "ZZ00 CNR",
];

/** Every seeded customer's name, phone, email and every registration. */
const seeded = [
  ...customerFile.customers.flatMap((c) => [c.name, c.phone, c.email]),
  ...customerFile.vehicles.map((v) => v.registration),
];

describe("no personal data in telemetry (SEC-10, S6)", () => {
  /** A flow with a booking for a new customer, a 409, a 422, a 500 and a customer search. */
  async function canaryFlow() {
    const problems: unknown[] = [];
    const saved: string[] = [];
    const booked = await book(users.staffLondon, {
      vehicleId: undefined,
      newCustomer: {
        name: CANARIES[0],
        phone: CANARIES[1],
        email: CANARIES[2],
      },
      newVehicle: { registration: CANARIES[3], make: "Zz Make", model: "Zz" },
    });
    expect(booked.status).toBe(201);
    problems.push((await conflict()).body);

    const invalid = await book(users.staffLondon, {
      vehicleId: undefined,
      customerId: "customer-a",
      newVehicle: {
        registration: `${CANARIES[3]} Zz Canary Name`,
        make: "M",
        model: "M",
      },
    });
    expect(invalid.status).toBe(422);
    problems.push(invalid.body);

    const search = await call("/customers/search", {
      user: users.staffLondon,
      method: "POST",
      body: { text: "Zz Canary" },
    });
    expect(search.status).toBe(200);

    const read = world.repository.read;
    world.repository.read = () => {
      throw new Error(`boom ${CANARIES.join(" ")}`);
    };
    const failed = await call("/appointments", { user: users.customerA });
    expect(failed.status).toBe(500);
    problems.push(failed.body);
    world.repository.read = read;

    const rows = await world.repository.read(async (s) =>
      Promise.all(
        Object.values(users).flatMap((u) =>
          Array.from({ length: keys }, (_, i) =>
            s.idempotency.get(u, NEW_KEY(i + 1)),
          ),
        ),
      ),
    );
    saved.push(JSON.stringify(rows));

    const answer = await call("/_demo/telemetry", { user: users.staffLondon });
    return { problems, saved, answer: answer.body };
  }

  it("the canary flow leaves no canary in a log line, the buffer, a metric, the telemetry answer, a Problem body or an idempotency row", async () => {
    const { problems, saved, answer } = await canaryFlow();
    const metrics = [...counters(), ...world.telemetry.reader.histograms()].map(
      (m) => JSON.stringify([m.name, m.labels]),
    );
    const places = {
      console: world.output.join("\n"),
      buffer: JSON.stringify(lines()),
      metrics: metrics.join("\n"),
      answer: JSON.stringify(answer),
      problems: JSON.stringify(problems),
      idempotency: saved.join("\n"),
    };
    for (const [place, text] of Object.entries(places)) {
      expect(text.length, place).toBeGreaterThan(2);
      for (const canary of [...CANARIES, "Canary", "canary"]) {
        expect(text, `${place} holds ${canary}`).not.toContain(canary);
      }
    }
  });

  it("whole-run output holds no seeded name, phone, email or registration", async () => {
    await canaryFlow();
    let sawData = false;
    for (const user of Object.values(users)) {
      const search = await call("/customers/search", {
        user,
        method: "POST",
        body: { text: "Demo" },
      });
      const vehicles = await call("/customers/customer-a/vehicles", { user });
      await call("/appointments", { user });
      // The sweep must meet the data it says is absent: staff and managers see customers and vehicles.
      const sees = user !== users.customerA && user !== users.customerB;
      if (sees) expect(search.body.length).toBeGreaterThan(0);
      if (user === users.staffLondon) {
        expect(vehicles.body.length).toBeGreaterThan(0);
        sawData = true;
      }
    }
    expect(sawData).toBe(true);
    const text = [world.output.join("\n"), JSON.stringify(lines())].join("\n");
    for (const value of seeded) expect(text).not.toContain(value);
  });
});

describe("an unknown dealership id is not logged (SEC-10)", () => {
  it("digits typed as a dealership id appear in no line and no metric label, and the answer is 404", async () => {
    const reply = await call("/dealerships/0912345678/availability", {
      user: users.customerA,
      query: { serviceTypeId: OIL, date: "2026-11-09", transport: "wait" },
    });
    expect(reply.status).toBe(404);
    const text = [
      world.output.join("\n"),
      JSON.stringify(lines()),
      JSON.stringify(counters()),
      JSON.stringify(world.telemetry.reader.histograms()),
    ].join("\n");
    expect(text).not.toContain("0912345678");
    expect(lines().some((l) => l.msg === "http.request")).toBe(true);
  });
});

describe("reset leaves the five tables equal to the seed (SEC-13.AC-4)", () => {
  it("customers, vehicles, appointments, outbox rows and idempotency records are the seed again", async () => {
    const snapshot = () =>
      world.repository.read(async (s) => ({
        customers: await s.customers.search("e"),
        appointments: [
          ...(await s.appointments.listByDealershipDay(LON, 0, 2 ** 52)),
          ...(await s.appointments.listByDealershipDay(
            "dealership-saigon",
            0,
            2 ** 52,
          )),
        ],
        outbox: await s.outbox.list(),
        idempotency: await Promise.all(
          Object.values(users).flatMap((u) =>
            Array.from({ length: 5 }, (_, i) =>
              s.idempotency.get(u, NEW_KEY(i + 1)),
            ),
          ),
        ),
      }));
    const seed = await snapshot();
    const made = await book(users.staffLondon, {
      vehicleId: undefined,
      newCustomer: {
        name: CANARIES[0],
        phone: CANARIES[1],
        email: CANARIES[2],
      },
      newVehicle: { registration: CANARIES[3], make: "Zz", model: "Zz" },
    });
    expect(made.status).toBe(201);
    await call(`/appointments/${made.body.id}/cancel`, {
      user: users.managerLondon,
      method: "POST",
    });
    expect(await snapshot()).not.toEqual(seed);

    await call("/_demo/reset", { user: users.staffLondon, method: "POST" });
    const after = await snapshot();
    expect(after).toEqual(seed);
    expect(JSON.stringify(after)).not.toMatch(/Canary|ZZ00/);
  });
});
