// The role matrix (AD-3 Check, SEC-1.AC-3, SEC-3, SEC-4, SEC-5). The list of operations is read from
// openapi.yaml, so an operation with no row here fails the suite and is named.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { operations } from "../../src/api/contract/validator";
import {
  NEW_KEY,
  SEEDED_A,
  at,
  clientTransport,
  directTransport,
  startMsw,
  stopMsw,
  users,
  type CallOptions,
  type UserKey,
} from "./support";

const LON = "dealership-london";

interface Row {
  method: string;
  path: string;
  /** The request body, which may depend on who sends it. */
  body?: (user: UserKey) => unknown;
  query?: CallOptions["query"];
  idempotent?: boolean;
  /** The status each caller gets. The unknown user always gets 401. */
  expect: Record<UserKey, number>;
  /**
   * The one exception to SEC-1.AC-1 (D-0001-57 A): the role switcher has to list the demo users before
   * anyone is picked, so there is no X-Demo-User to send. Only `getDemoUsers` sets this, and its answer
   * holds ids, names, roles and dealership ids only (SEC-9, SEC-10).
   */
  answersWithoutUser?: true;
}

const only = (
  allowed: Partial<Record<UserKey, number>>,
  otherwise: number,
): Record<UserKey, number> => ({
  customerA: otherwise,
  customerB: otherwise,
  staffLondon: otherwise,
  managerLondon: otherwise,
  staffSaigon: otherwise,
  managerSaigon: otherwise,
  staffBoth: otherwise,
  ...allowed,
});

const settings = {
  weeklyHours: { "1": { open: "08:00", close: "18:00" } },
  dateOverrides: {},
  policies: { leadTimeMinutes: 120, horizonDays: 30, breakMinutes: 15 },
};
const shifts = {
  shiftPattern: { "1": { start: "08:00", end: "16:30" } },
  shiftExceptions: {},
};
const checkBody = {
  dealershipId: LON,
  serviceTypeId: "service-oil-change",
  start: at("2026-11-09", "10:00"),
  transport: "wait",
};
const dayQuery = {
  serviceTypeId: "service-oil-change",
  date: "2026-11-09",
  transport: "wait",
};
/** Who is allowed to see dealership London's data: its own staff and managers. */
const londonStaff = {
  staffLondon: 200,
  managerLondon: 200,
  staffBoth: 200,
} as const;

export const matrix: Record<string, Row> = {
  getMe: { method: "GET", path: "/me", expect: only({}, 200) },
  listDealerships: {
    method: "GET",
    path: "/dealerships",
    expect: only({}, 200),
  },
  getDealership: {
    method: "GET",
    path: `/dealerships/${LON}`,
    expect: only({}, 200),
  },
  updateDealershipSettings: {
    method: "PUT",
    path: `/dealerships/${LON}/settings`,
    body: () => settings,
    expect: only({ managerLondon: 200 }, 403),
  },
  listServiceTypes: {
    method: "GET",
    path: "/service-types",
    expect: only({}, 200),
  },
  listTechnicians: {
    method: "GET",
    path: `/dealerships/${LON}/technicians`,
    query: { from: "2026-11-05", to: "2026-11-05" },
    expect: only(londonStaff, 403),
  },
  updateTechnicianShifts: {
    method: "PUT",
    path: "/technicians/tech-lon-ash/shifts",
    body: () => shifts,
    // A manager of another dealership is told the technician does not exist (D-0000-27 C).
    expect: only({ managerLondon: 200, managerSaigon: 404 }, 403),
  },
  listServiceBays: {
    method: "GET",
    path: `/dealerships/${LON}/service-bays`,
    expect: only(londonStaff, 403),
  },
  searchAvailability: {
    method: "GET",
    path: `/dealerships/${LON}/availability`,
    query: dayQuery,
    expect: only({ staffSaigon: 403, managerSaigon: 403 }, 200),
  },
  checkAvailability: {
    method: "POST",
    path: "/availability-checks",
    body: () => checkBody,
    expect: only({ staffSaigon: 403, managerSaigon: 403 }, 200),
  },
  listAppointments: {
    method: "GET",
    path: "/appointments",
    query: { dealershipId: LON, date: SEEDED_A.date },
    expect: only({ staffSaigon: 403, managerSaigon: 403 }, 200),
  },
  bookAppointment: {
    method: "POST",
    path: "/appointments",
    idempotent: true,
    body: (user) => ({
      ...checkBody,
      vehicleId: "vehicle-a",
      // Staff and managers book for a customer; customer B tries to use customer A's vehicle.
      ...(user === "customerA" || user === "customerB"
        ? {}
        : { customerId: "customer-a" }),
    }),
    expect: only(
      {
        staffLondon: 201,
        managerLondon: 201,
        staffBoth: 201,
        customerA: 201,
        customerB: 404,
      },
      403,
    ),
  },
  getAppointment: {
    method: "GET",
    path: `/appointments/${SEEDED_A.id}`,
    expect: only({ ...londonStaff, customerA: 200 }, 404),
  },
  adjustAppointment: {
    method: "PATCH",
    path: `/appointments/${SEEDED_A.id}`,
    body: () => ({ start: at(SEEDED_A.date, "14:00") }),
    expect: only({ managerLondon: 200, managerSaigon: 404 }, 403),
  },
  rescheduleAppointment: {
    method: "POST",
    path: `/appointments/${SEEDED_A.id}/reschedule`,
    idempotent: true,
    body: () => ({ start: at(SEEDED_A.date, "14:00") }),
    expect: only(
      {
        customerA: 200,
        managerLondon: 200,
        customerB: 404,
        managerSaigon: 404,
      },
      403,
    ),
  },
  cancelAppointment: {
    method: "POST",
    path: `/appointments/${SEEDED_A.id}/cancel`,
    expect: only(
      {
        customerA: 200,
        managerLondon: 200,
        customerB: 404,
        managerSaigon: 404,
      },
      403,
    ),
  },
  searchCustomers: {
    method: "POST",
    path: "/customers/search",
    body: () => ({ text: "Demo" }),
    expect: only({ customerA: 403, customerB: 403 }, 200),
  },
  listCustomerVehicles: {
    method: "GET",
    path: "/customers/customer-a/vehicles",
    expect: only({ customerB: 404 }, 200),
  },
  listOutbox: {
    method: "GET",
    path: "/outbox",
    query: { dealershipId: LON },
    expect: only({ managerLondon: 200 }, 403),
  },
  // Demo only, open to every signed-in user (architecture.md section 7.3).
  getDemoTelemetry: {
    method: "GET",
    path: "/_demo/telemetry",
    expect: only({}, 200),
  },
  getDemoUsers: {
    method: "GET",
    path: "/_demo/users",
    expect: only({}, 200),
    answersWithoutUser: true,
  },
  resetDemoData: {
    method: "POST",
    path: "/_demo/reset",
    expect: only({}, 204),
  },
};

beforeAll(startMsw);
afterAll(stopMsw);

describe("the role matrix has a row for every operation of openapi.yaml (SEC-1.AC-3)", () => {
  it("names each operation that has no row", () => {
    const missing = operations
      .map((operation) => operation.id)
      .filter((id) => matrix[id] === undefined);
    expect(
      missing,
      `operations with no matrix row: ${missing.join(", ")}`,
    ).toEqual([]);
    expect(Object.keys(matrix).sort()).toEqual(
      operations.map((o) => o.id).sort(),
    );
  });
});

const callers = Object.keys(users) as UserKey[];

describe.each([directTransport(), clientTransport("https://first.mock.test")])(
  "roles and dealerships through $name (AD-3, D-0001-14)",
  (transport) => {
    describe.each(Object.entries(matrix))("%s", (id, row) => {
      it.each(callers)("%s", async (who) => {
        const { call } = await transport.start();
        const reply = await call(row.path, {
          user: users[who],
          method: row.method,
          query: row.query,
          headers: row.idempotent
            ? { "Idempotency-Key": NEW_KEY(1) }
            : undefined,
          body: row.body?.(who),
        });
        expect(reply.problems).toEqual([]);
        expect(
          reply.status,
          `${id} as ${who}: ${JSON.stringify(reply.body)}`,
        ).toBe(row.expect[who]);
        if (reply.status === 403) expect(reply.body.code).toBe("FORBIDDEN");
        if (reply.status === 404) expect(reply.body.code).toBe("NOT_FOUND");
      });

      it("an unknown user gets 401 UNKNOWN_USER in the Problem shape (except the demo users list)", async () => {
        const { call } = await transport.start();
        for (const user of [undefined, "user-nobody"]) {
          const reply = await call(row.path, {
            user,
            method: row.method,
            query: row.query,
            headers: row.idempotent
              ? { "Idempotency-Key": NEW_KEY(1) }
              : undefined,
            body: row.body?.("managerLondon"),
          });
          expect(reply.problems).toEqual([]);
          if (row.answersWithoutUser) {
            expect(reply.status).toBe(200);
            continue;
          }
          expect(reply.status).toBe(401);
          expect(reply.body).toMatchObject({
            code: "UNKNOWN_USER",
            traceId: expect.stringMatching(/^[0-9a-f]{32}$/),
          });
        }
      });
    });
  },
);

describe("only the demo users list answers without X-Demo-User (SEC-1.AC-1)", () => {
  it("is the single operation that is not 401 without the header", () => {
    expect(
      Object.entries(matrix)
        .filter(([, row]) => row.answersWithoutUser)
        .map(([id]) => id),
    ).toEqual(["getDemoUsers"]);
  });
});
