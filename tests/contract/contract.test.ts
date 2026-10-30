// The API contract tests (AD-2, AD-5, AD-11, AD-12). Every response is checked against openapi.yaml
// as it comes back (see `Reply.problems`). The whole file runs three times: against the mock directly,
// and through the typed client at two different origins handled by the same mock (S2).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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
  type Reply,
  type Transport,
  type World,
} from "./support";

const LON = "dealership-london";
const OIL = "service-oil-change";
const EV = "service-ev-check";
const MONDAY = "2026-11-09";
const FREE_START = at(MONDAY, "10:00");

beforeAll(startMsw);
afterAll(stopMsw);

const transports: Transport[] = [
  directTransport(),
  clientTransport("https://first.mock.test"),
  clientTransport("https://second.mock.test"),
];

describe.each(transports)("API contract through $name", (transport) => {
  let world: World;
  let origin: string;
  let send: (path: string, options?: CallOptions) => Promise<Reply>;
  let keys: number;
  const key = () => NEW_KEY(++keys);

  beforeEach(async () => {
    const started = await transport.start();
    world = started.world;
    origin = started.origin;
    keys = 0;
    // Every answer must match the contract: status, headers and body.
    send = async (path, options) => {
      const reply = await started.call(path, options);
      expect(reply.problems).toEqual([]);
      return reply;
    };
  });

  const book = (
    user: string,
    body: Record<string, unknown> = {},
    idempotencyKey = key(),
  ) =>
    send("/appointments", {
      user,
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: {
        dealershipId: LON,
        serviceTypeId: OIL,
        start: FREE_START,
        transport: "wait",
        vehicleId: "vehicle-a",
        ...body,
      },
    });

  /** Takes a technician at `start` with a car of its own: customer A's seeded car is already busy then (D-0001-146). */
  const takeSecondTechnician = (start: string) =>
    book(users.staffLondon, {
      customerId: "customer-a",
      vehicleId: undefined,
      newVehicle: {
        registration: "TT01 AAA",
        make: "Make",
        model: "Model",
      },
      serviceTypeId: EV,
      start,
    });

  const dayList = (user: string, date: string, dealershipId = LON) =>
    send("/appointments", { user, query: { dealershipId, date } });

  describe("errors, trace ids and users", () => {
    it("every error is application/problem+json with type, title, status, code and traceId", async () => {
      const replies = [
        await send("/me"), // UNKNOWN_USER
        await send("/appointments/nope", { user: users.customerA }), // NOT_FOUND
        await send("/dealerships/dealership-london/settings", {
          user: users.customerA,
          method: "PUT",
          body: {
            weeklyHours: {},
            dateOverrides: {},
            policies: { leadTimeMinutes: 1, horizonDays: 1, breakMinutes: 0 },
          },
        }), // FORBIDDEN
        await book(users.customerA, { start: undefined }), // VALIDATION_FAILED
      ];
      for (const reply of replies) {
        expect(reply.headers.get("content-type")).toContain(
          "application/problem+json",
        );
        expect(reply.body).toMatchObject({
          type: expect.stringMatching(/^\/problems\//),
          title: expect.any(String),
          status: reply.status,
          code: expect.any(String),
          traceId: reply.headers.get("x-trace-id"),
        });
      }
      expect(replies.map((r) => r.body.code)).toEqual([
        "UNKNOWN_USER",
        "NOT_FOUND",
        "FORBIDDEN",
        "VALIDATION_FAILED",
      ]);
    });

    it("answers 401 UNKNOWN_USER with no X-Demo-User and with one that is not seeded", async () => {
      for (const user of [undefined, "user-nobody"]) {
        const reply = await send("/me", { user });
        expect(reply.status).toBe(401);
        expect(reply.body.code).toBe("UNKNOWN_USER");
        expect(reply.body.traceId).toMatch(/^[0-9a-f]{32}$/);
      }
    });

    it("GET /me answers the seeded user with X-Trace-Id", async () => {
      const reply = await send("/me", { user: users.managerLondon });
      expect(reply.status).toBe(200);
      expect(reply.body).toEqual({
        userId: "user-manager-london",
        name: "Demo Manager London",
        role: "manager",
        customerId: null,
        dealershipIds: [LON],
      });
      expect(reply.headers.get("x-trace-id")).toMatch(/^[0-9a-f]{32}$/);
    });
  });

  describe("requesting and checking (REQ-BOOK-001, 002)", () => {
    const check = (user: string, body: Record<string, unknown> = {}) =>
      send("/availability-checks", {
        user,
        method: "POST",
        body: {
          dealershipId: LON,
          serviceTypeId: OIL,
          start: FREE_START,
          transport: "wait",
          ...body,
        },
      });

    it("a free time answers 200 with the resources, a taken one 200 with reasons and suggestions; never 409", async () => {
      const free = await check(users.customerA);
      expect(free.status).toBe(200);
      expect(free.body).toMatchObject({
        available: true,
        technicianId: expect.any(String),
        serviceBayId: expect.any(String),
        courtesyCarId: null,
      });
      // The seeded EV check uses Ash and bay 1 at 10:00 on Thursday; Cedar is the only other EV technician.
      await book(users.customerB, {
        serviceTypeId: EV,
        start: SEEDED_A.start,
        vehicleId: "vehicle-b",
      });
      const taken = await check(users.customerA, {
        serviceTypeId: EV,
        start: SEEDED_A.start,
      });
      expect(taken.status).toBe(200);
      expect(taken.body.available).toBe(false);
      expect(taken.body.reasons.length).toBeGreaterThan(0);
      expect(taken.body.suggestions.length).toBeGreaterThan(0);
    });

    it("D-0001-101, D-0001-102: appointmentId leaves that appointment out of the check and the day search, for people who may reach it only", async () => {
      // The seeded EV check uses Oliver at 10:00; Tom is the only other EV technician, and customer B takes him.
      await book(users.customerB, {
        serviceTypeId: EV,
        start: SEEDED_A.start,
        vehicleId: "vehicle-b",
      });
      const body = { serviceTypeId: EV, start: SEEDED_A.start };
      const day = (user: string, appointmentId?: string) =>
        send(`/dealerships/${LON}/availability`, {
          user,
          query: {
            serviceTypeId: EV,
            date: SEEDED_A.date,
            transport: "wait",
            ...(appointmentId ? { appointmentId } : {}),
          },
        });
      const offered = (reply: Reply) =>
        reply.body.slots.some(
          (x: { start: string }) => x.start === SEEDED_A.start,
        );

      expect((await check(users.customerA, body)).body.available).toBe(false);
      expect(offered(await day(users.customerA))).toBe(false);
      for (const user of [
        users.customerA,
        users.staffLondon,
        users.managerLondon,
      ]) {
        const sent = { ...body, appointmentId: SEEDED_A.id };
        expect((await check(user, sent)).body.available).toBe(true);
        expect(offered(await day(user, SEEDED_A.id))).toBe(true);
      }
      // Everyone else still sees the old time as busy.
      expect((await check(users.customerB, body)).body.available).toBe(false);
      // A stranger gets the answer for a missing appointment.
      const missing = "f7d1c2aa-0000-4000-8000-000000000000";
      for (const id of [SEEDED_A.id, missing]) {
        const checked = await check(users.customerB, {
          ...body,
          appointmentId: id,
        });
        expect(checked.status).toBe(404);
        expect((await day(users.customerB, id)).status).toBe(404);
      }
      expect(
        (await check(users.customerA, { ...body, appointmentId: missing }))
          .status,
      ).toBe(404);
    });

    it("a missing field is 422 naming it, and an unreal date is 422", async () => {
      const missing = await check(users.customerA, { dealershipId: undefined });
      expect(missing.status).toBe(422);
      expect(missing.body.errors).toEqual([
        { field: "dealershipId", message: "Is required." },
      ]);
      const unreal = await check(users.customerA, {
        start: "2026-02-30T10:00:00Z",
      });
      expect(unreal.status).toBe(422);
      expect(unreal.body.errors[0].field).toBe("start");
    });

    it("a booking with vehicle, service type, dealership or start missing is 422 naming each, and no check runs", async () => {
      const before = world.logger.steps().filter((s) => s === "check").length;
      const reply = await book(users.customerA, {
        vehicleId: undefined,
        serviceTypeId: undefined,
        dealershipId: undefined,
        start: undefined,
      });
      expect(reply.status).toBe(422);
      expect(reply.body.code).toBe("VALIDATION_FAILED");
      expect(
        reply.body.errors.map((e: { field: string }) => e.field).sort(),
      ).toEqual(["dealershipId", "serviceTypeId", "start", "vehicleId"]);
      expect(world.logger.steps().filter((s) => s === "check").length).toBe(
        before,
      );
    });

    it("the day's free times have the contract shape, and every slot passes an availability check", async () => {
      const reply = await send(`/dealerships/${LON}/availability`, {
        user: users.customerA,
        query: { serviceTypeId: OIL, date: MONDAY, transport: "wait" },
      });
      expect(reply.status).toBe(200);
      expect(reply.body).toMatchObject({
        date: MONDAY,
        timeZone: "Europe/London",
        gridMinutes: 15,
      });
      expect(reply.body.slots.length).toBeGreaterThan(10);
      for (const slot of reply.body.slots.slice(0, 12)) {
        const checked = await check(users.customerA, { start: slot.start });
        expect(checked.body.available).toBe(true);
      }
    });

    it("a missing parameter is 422, and a technician range over 31 days is SEARCH_RANGE_TOO_LARGE", async () => {
      const missing = await send(`/dealerships/${LON}/availability`, {
        user: users.customerA,
        query: { serviceTypeId: OIL, date: MONDAY },
      });
      expect(missing.status).toBe(422);
      expect(missing.body.errors).toEqual([
        { field: "transport", message: "Is required." },
      ]);
      const range = (to: string) =>
        send(`/dealerships/${LON}/technicians`, {
          user: users.managerLondon,
          query: { from: "2026-11-02", to },
        });
      const tooLarge = await range("2026-12-03");
      expect(tooLarge.status).toBe(422);
      expect(tooLarge.body.code).toBe("SEARCH_RANGE_TOO_LARGE");
      expect((await range("2026-12-02")).status).toBe(200);
      expect((await range("2026-11-01")).body.errors[0].field).toBe("to");
    });
  });

  describe("booking, conflicts and idempotency (REQ-BOOK-003, 009, 012, 014)", () => {
    it("a free time is booked: 201 with the whole appointment", async () => {
      const reply = await book(users.customerA);
      expect(reply.status).toBe(201);
      expect(reply.body).toMatchObject({
        dealershipId: LON,
        timeZone: "Europe/London",
        customerId: "customer-a",
        vehicleId: "vehicle-a",
        serviceTypeId: OIL,
        transport: "wait",
        start: FREE_START,
        end: at(MONDAY, "11:00"),
        status: "confirmed",
        version: 1,
        flags: [],
        courtesyCarId: null,
        cancelledAt: null,
      });
      expect(reply.body.technicianId).toMatch(/^tech-lon-/);
      expect(reply.body.serviceBayId).toMatch(/^bay-lon-/);
      // The owner sees the service, the vehicle and the technician's name (D-0001-71), not the bay or customer name.
      expect(reply.body.display).toEqual({
        serviceTypeName: "Oil and filter change",
        technicianName: expect.stringMatching(
          /^(Oliver Hughes|Amara Okafor|Tom Fletcher)$/,
        ),
        vehicle: {
          registration: "AB00 DMA",
          make: "Demo Motors",
          model: "Hatch",
        },
      });
    });

    it("two bookings together for the one free technician and bay: one 201, one 409 with reasons and suggestions", async () => {
      const [a, b] = await Promise.all([
        book(users.customerA, { serviceTypeId: EV, start: SEEDED_A.start }),
        book(users.customerB, {
          serviceTypeId: EV,
          start: SEEDED_A.start,
          vehicleId: "vehicle-b",
        }),
      ]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
      const lost = a.status === 409 ? a : b;
      expect(lost.body.code).toBe("SLOT_UNAVAILABLE");
      expect(lost.body.reasons.length).toBeGreaterThan(0);
      expect(Array.isArray(lost.body.suggestions)).toBe(true);
      expect(lost.body.suggestions.length).toBeGreaterThan(0);
      const list = await dayList(users.staffLondon, SEEDED_A.date);
      // The seeded appointment and exactly one new one.
      expect(list.body).toHaveLength(2);
    });

    it("a time listed as free but taken before the confirm is 409", async () => {
      const listed = await send(`/dealerships/${LON}/availability`, {
        user: users.customerB,
        query: { serviceTypeId: EV, date: SEEDED_A.date, transport: "wait" },
      });
      expect(
        listed.body.slots.map((s: { start: string }) => s.start),
      ).toContain(SEEDED_A.start);
      expect((await takeSecondTechnician(SEEDED_A.start)).status).toBe(201);
      const late = await book(users.customerB, {
        serviceTypeId: EV,
        start: SEEDED_A.start,
        vehicleId: "vehicle-b",
      });
      expect(late.status).toBe(409);
    });

    it("the same key and body twice: the same status and body, one appointment; the same for reschedule", async () => {
      const first = await book(users.customerA, {}, NEW_KEY(900));
      const second = await book(users.customerA, {}, NEW_KEY(900));
      expect(second.status).toBe(first.status);
      expect(second.body).toEqual(first.body);
      const list = await dayList(users.staffLondon, MONDAY);
      expect(list.body).toHaveLength(1);

      const move = (start: string, idempotencyKey: string) =>
        send(`/appointments/${first.body.id}/reschedule`, {
          user: users.customerA,
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey },
          body: { start },
        });
      const moved = await move(at(MONDAY, "14:00"), NEW_KEY(901));
      const again = await move(at(MONDAY, "14:00"), NEW_KEY(901));
      expect(moved.status).toBe(200);
      expect(again.body).toEqual(moved.body);
      expect(moved.body.version).toBe(2);
      const other = await move(at(MONDAY, "15:00"), NEW_KEY(901));
      expect(other.status).toBe(422);
      expect(other.body.code).toBe("IDEMPOTENCY_KEY_REUSED");
      const missing = await send(`/appointments/${first.body.id}/reschedule`, {
        user: users.customerA,
        method: "POST",
        body: { start: at(MONDAY, "15:00") },
      });
      expect(missing.status).toBe(400);
      expect(missing.body.code).toBe("IDEMPOTENCY_KEY_MISSING");
    });

    it("the same key with another body is 422 IDEMPOTENCY_KEY_REUSED, and no key is 400", async () => {
      await book(users.customerA, {}, NEW_KEY(910));
      const reused = await book(
        users.customerA,
        { start: at(MONDAY, "12:00") },
        NEW_KEY(910),
      );
      expect(reused.status).toBe(422);
      expect(reused.body.code).toBe("IDEMPOTENCY_KEY_REUSED");
      const none = await send("/appointments", {
        user: users.customerA,
        method: "POST",
        body: { dealershipId: LON },
      });
      expect(none.status).toBe(400);
      expect(none.body.code).toBe("IDEMPOTENCY_KEY_MISSING");
    });

    describe("a staff member books a new customer and vehicle (REQ-BOOK-014)", () => {
      const newPeople = {
        newCustomer: {
          name: "Pat Canary",
          phone: "+44 7700 900777",
          email: "pat@canary.example",
        },
        newVehicle: {
          registration: "ZZ99 CAN",
          make: "Make",
          model: "Model",
          year: 2021,
        },
        vehicleId: undefined,
      };
      const search = (
        body: Record<string, unknown>,
        user: string = users.staffLondon,
      ) => send("/customers/search", { user, method: "POST", body });

      it("is 201, and the search then finds the customer by name, phone and registration with the vehicle", async () => {
        expect((await book(users.staffLondon, newPeople)).status).toBe(201);
        for (const text of ["Canary", "900777", "ZZ99"]) {
          const found = await search({ text });
          expect(found.status).toBe(200);
          expect(found.body).toHaveLength(1);
          expect(found.body[0]).toMatchObject({
            name: "Pat Canary",
            vehicles: [
              {
                registration: "ZZ99 CAN",
                make: "Make",
                model: "Model",
                year: 2021,
              },
            ],
          });
        }
      });

      it("a missing required field is 422 naming it and stores nothing", async () => {
        const reply = await book(users.staffLondon, {
          ...newPeople,
          newCustomer: { name: "Pat Canary", email: "pat@canary.example" },
        });
        expect(reply.status).toBe(422);
        expect(reply.body.errors).toEqual([
          { field: "newCustomer.phone", message: "Phone is required." },
        ]);
        expect((await search({ text: "Canary" })).body).toEqual([]);
      });

      it("a taken time is 409 and stores no customer", async () => {
        await takeSecondTechnician(SEEDED_A.start);
        const reply = await book(users.staffLondon, {
          ...newPeople,
          serviceTypeId: EV,
          start: SEEDED_A.start,
        });
        expect(reply.status).toBe(409);
        expect((await search({ text: "Canary" })).body).toEqual([]);
      });

      it("an existing customer with a new vehicle is 201 (customerId and newVehicle)", async () => {
        const reply = await book(users.staffLondon, {
          customerId: "customer-b",
          vehicleId: undefined,
          newVehicle: newPeople.newVehicle,
        });
        expect(reply.status).toBe(201);
        const vehicles = await send("/customers/customer-b/vehicles", {
          user: users.staffLondon,
        });
        expect(vehicles.body).toHaveLength(2);
      });

      it("the duplicate hint finds a customer by phone or registration, never by both kinds with text", async () => {
        const byPhone = await search({ phone: "+44 7700 900101" });
        expect(byPhone.body.map((c: { id: string }) => c.id)).toEqual([
          "customer-a",
        ]);
        const byPlate = await search({ registration: "CD11 DMB" });
        expect(byPlate.body.map((c: { id: string }) => c.id)).toEqual([
          "customer-b",
        ]);
        const both = await search({ text: "Demo", phone: "+44 7700 900101" });
        expect(both.status).toBe(422);
        expect((await search({})).status).toBe(422);
      });
    });

    it("cancel by the owner is 200 cancelled, a second cancel is 200 with the same body, and the default list drops it", async () => {
      const booked = await book(users.customerA);
      const cancel = () =>
        send(`/appointments/${booked.body.id}/cancel`, {
          user: users.customerA,
          method: "POST",
        });
      const first = await cancel();
      expect(first.status).toBe(200);
      expect(first.body.status).toBe("cancelled");
      expect((await cancel()).body).toEqual(first.body);
      const mine = await send("/appointments", { user: users.customerA });
      expect(mine.body.map((a: { id: string }) => a.id)).toEqual([SEEDED_A.id]);
      const all = await send("/appointments", {
        user: users.customerA,
        query: { includeCancelled: true },
      });
      expect(all.body).toHaveLength(2);
    });

    it("a customer's own list is from now on, soonest first", async () => {
      const later = await book(users.customerA, {
        start: at("2026-11-12", "10:00"),
      });
      const sooner = await book(users.customerA, {
        start: at("2026-11-04", "10:00"),
      });
      const mine = await send("/appointments", { user: users.customerA });
      expect(mine.body.map((a: { id: string }) => a.id)).toEqual([
        sooner.body.id,
        SEEDED_A.id,
        later.body.id,
      ]);
      world.clock.set(Date.parse("2026-11-05T12:00:00Z"));
      const now = await send("/appointments", { user: users.customerA });
      expect(now.body.map((a: { id: string }) => a.id)).toEqual([
        later.body.id,
      ]);
    });

    it("D-0001-94: includePast=true adds a customer's own ended appointments after the others, newest first, and never another customer's", async () => {
      const earlier = await book(users.customerA, {
        start: at("2026-11-04", "10:00"),
      });
      const later = await book(users.customerA, {
        start: at("2026-11-12", "10:00"),
      });
      world.clock.set(Date.parse("2026-11-05T12:00:00Z"));
      const ids = async (user: string, query: Record<string, boolean>) =>
        (await send("/appointments", { user, query })).body.map(
          (a: { id: string }) => a.id,
        );
      expect(await ids(users.customerA, { includePast: true })).toEqual([
        later.body.id,
        SEEDED_A.id,
        earlier.body.id,
      ]);
      expect(await ids(users.customerA, {})).toEqual([later.body.id]);
      const mine = await ids(users.customerB, { includePast: true });
      expect(mine).not.toContain(SEEDED_A.id);
      expect(mine).not.toContain(earlier.body.id);
      expect(mine).not.toContain(later.body.id);
    });

    it("reschedule to a free time keeps the id; to a taken time is 409 and the original is unchanged", async () => {
      const move = (start: string, serviceKey = key()) =>
        send(`/appointments/${SEEDED_A.id}/reschedule`, {
          user: users.customerA,
          method: "POST",
          headers: { "Idempotency-Key": serviceKey },
          body: { start },
        });
      // Cedar takes the EV slot at 14:00; Ash is free then, so the move to 14:00 still works.
      await book(users.customerB, {
        serviceTypeId: EV,
        start: at(SEEDED_A.date, "14:00"),
        vehicleId: "vehicle-b",
      });
      const moved = await move(at(SEEDED_A.date, "14:00"));
      expect(moved.status).toBe(200);
      expect(moved.body).toMatchObject({
        id: SEEDED_A.id,
        start: at(SEEDED_A.date, "14:00"),
        version: 2,
      });
      // Both EV technicians are now busy at 14:00.
      await book(users.customerB, {
        serviceTypeId: EV,
        start: at(SEEDED_A.date, "11:00"),
        vehicleId: "vehicle-b",
      });
      await book(users.staffLondon, {
        serviceTypeId: EV,
        customerId: "customer-c",
        vehicleId: "vehicle-c",
        start: at(SEEDED_A.date, "11:00"),
      });
      const clash = await move(at(SEEDED_A.date, "11:00"));
      expect(clash.status).toBe(409);
      expect(clash.body.code).toBe("SLOT_UNAVAILABLE");
      const unchanged = await send(`/appointments/${SEEDED_A.id}`, {
        user: users.customerA,
      });
      expect(unchanged.body).toEqual(moved.body);
    });

    it("a customer's cancel or reschedule after the cutoff is 409 CHANGE_WINDOW_CLOSED that says to contact the dealership", async () => {
      world.clock.set(Date.parse("2026-11-05T09:00:00Z"));
      const cancel = await send(`/appointments/${SEEDED_A.id}/cancel`, {
        user: users.customerA,
        method: "POST",
      });
      const move = await send(`/appointments/${SEEDED_A.id}/reschedule`, {
        user: users.customerA,
        method: "POST",
        headers: { "Idempotency-Key": key() },
        body: { start: at("2026-11-06", "10:00") },
      });
      for (const reply of [cancel, move]) {
        expect(reply.status).toBe(409);
        expect(reply.body.code).toBe("CHANGE_WINDOW_CLOSED");
        expect(reply.body.detail).toMatch(/contact the dealership/i);
      }
      const dealership = await send(`/dealerships/${LON}`, {
        user: users.customerA,
      });
      expect(dealership.body.phone).toBe("+44 1632 960 123");
    });

    it("a cancelled appointment cannot be moved: 409 ALREADY_CANCELLED for reschedule and adjust", async () => {
      await send(`/appointments/${SEEDED_A.id}/cancel`, {
        user: users.customerA,
        method: "POST",
      });
      const move = await send(`/appointments/${SEEDED_A.id}/reschedule`, {
        user: users.customerA,
        method: "POST",
        headers: { "Idempotency-Key": key() },
        body: { start: at("2026-11-06", "10:00") },
      });
      const adjust = await send(`/appointments/${SEEDED_A.id}`, {
        user: users.managerLondon,
        method: "PATCH",
        body: { start: at("2026-11-06", "10:00") },
      });
      for (const reply of [move, adjust]) {
        expect(reply.status).toBe(409);
        expect(reply.body.code).toBe("ALREADY_CANCELLED");
      }
    });

    it("the manager's PATCH to a free time is 200; to a clashing time is 409 with suggestions and nothing changes", async () => {
      const patch = (body: Record<string, unknown>) =>
        send(`/appointments/${SEEDED_A.id}`, {
          user: users.managerLondon,
          method: "PATCH",
          body,
        });
      const moved = await patch({ start: at(SEEDED_A.date, "14:00") });
      expect(moved.status).toBe(200);
      expect(moved.body.start).toBe(at(SEEDED_A.date, "14:00"));
      expect(moved.body.version).toBe(2);
      // Cedar is the only other EV technician. Book her at 15:00, then ask for her at 15:00.
      await book(users.customerB, {
        serviceTypeId: EV,
        start: at(SEEDED_A.date, "15:00"),
        vehicleId: "vehicle-b",
        technicianId: undefined,
      });
      const booked = await dayList(users.managerLondon, SEEDED_A.date);
      const cedar = booked.body.find(
        (a: { start: string }) => a.start === at(SEEDED_A.date, "15:00"),
      );
      const clash = await patch({
        start: at(SEEDED_A.date, "15:00"),
        technicianId: cedar.technicianId,
      });
      expect(clash.status).toBe(409);
      expect(clash.body.code).toBe("SLOT_UNAVAILABLE");
      expect(clash.body.suggestions.length).toBeGreaterThan(0);
      const after = await send(`/appointments/${SEEDED_A.id}`, {
        user: users.managerLondon,
      });
      expect(after.body).toEqual(moved.body);
    });

    it("staff and managers may fix the technician on the day grid, the check and the booking; a customer may not", async () => {
      const grid = (user: string) =>
        send(`/dealerships/${LON}/availability`, {
          user,
          query: {
            serviceTypeId: OIL,
            date: MONDAY,
            transport: "wait",
            technicianId: "tech-lon-birch",
          },
        });
      const staff = await grid(users.staffLondon);
      expect(staff.status).toBe(200);
      // Birch starts at 09:00 and Ash at 08:00, so fixing Birch removes the 08:00 start.
      expect(staff.body.slots[0].start).toBe(at(MONDAY, "09:00"));
      const open = await send(`/dealerships/${LON}/availability`, {
        user: users.staffLondon,
        query: { serviceTypeId: OIL, date: MONDAY, transport: "wait" },
      });
      expect(open.body.slots[0].start).toBe(at(MONDAY, "08:00"));
      expect((await grid(users.customerA)).status).toBe(403);
      const check = (user: string) =>
        send("/availability-checks", {
          user,
          method: "POST",
          body: {
            dealershipId: LON,
            serviceTypeId: OIL,
            start: FREE_START,
            transport: "wait",
            technicianId: "tech-lon-birch",
          },
        });
      expect((await check(users.managerLondon)).body.technicianId).toBe(
        "tech-lon-birch",
      );
      expect((await check(users.customerA)).status).toBe(403);
      const booked = await book(users.staffLondon, {
        customerId: "customer-a",
        technicianId: "tech-lon-birch",
      });
      expect(booked.body.technicianId).toBe("tech-lon-birch");
      expect(
        (await book(users.customerA, { technicianId: "tech-lon-birch" }))
          .status,
      ).toBe(403);
    });
  });

  describe("starts must be on the 15-minute grid (D-0001-147)", () => {
    const offGrid = [at(MONDAY, "10:07"), `${MONDAY}T14:07:33Z`];
    const onGrid = (iso: string) => Date.parse(iso) % (15 * 60_000) === 0;
    const expectNotOnGrid = (reply: Reply) => {
      expect(reply.status).toBe(409);
      expect(reply.body.code).toBe("SLOT_UNAVAILABLE");
      expect(reply.body.reasons).toContain("NOT_ON_GRID");
      expect(reply.body.suggestions.length).toBeGreaterThan(0);
      for (const suggestion of reply.body.suggestions) {
        expect(onGrid(suggestion.start)).toBe(true);
      }
    };

    it.each(offGrid)(
      "POST /appointments at %s is 409 NOT_ON_GRID with grid suggestions and stores nothing",
      async (start) => {
        expectNotOnGrid(await book(users.customerA, { start }));
        const list = await dayList(users.staffLondon, MONDAY);
        expect(list.body).toEqual([]);
      },
    );

    it.each(offGrid)(
      "POST /availability-checks at %s is 200 available:false with NOT_ON_GRID",
      async (start) => {
        const reply = await send("/availability-checks", {
          user: users.customerA,
          method: "POST",
          body: {
            dealershipId: LON,
            serviceTypeId: OIL,
            start,
            transport: "wait",
          },
        });
        expect(reply.status).toBe(200);
        expect(reply.body.available).toBe(false);
        expect(reply.body.reasons).toContain("NOT_ON_GRID");
      },
    );

    it.each(offGrid)(
      "reschedule and adjust to %s are 409 NOT_ON_GRID and the appointment is unchanged",
      async (start) => {
        const before = await send(`/appointments/${SEEDED_A.id}`, {
          user: users.managerLondon,
        });
        const move = await send(`/appointments/${SEEDED_A.id}/reschedule`, {
          user: users.customerA,
          method: "POST",
          headers: { "Idempotency-Key": key() },
          body: { start },
        });
        expectNotOnGrid(move);
        const adjust = await send(`/appointments/${SEEDED_A.id}`, {
          user: users.managerLondon,
          method: "PATCH",
          body: { start },
        });
        expectNotOnGrid(adjust);
        const after = await send(`/appointments/${SEEDED_A.id}`, {
          user: users.managerLondon,
        });
        expect(after.body).toEqual(before.body);
      },
    );

    it("an adjust that keeps the start and changes only the technician or the bay is still 200", async () => {
      const patch = (body: Record<string, unknown>) =>
        send(`/appointments/${SEEDED_A.id}`, {
          user: users.managerLondon,
          method: "PATCH",
          body,
        });
      const tech = await patch({ technicianId: "tech-lon-cedar" });
      expect(tech.status).toBe(200);
      expect(tech.body).toMatchObject({
        technicianId: "tech-lon-cedar",
        start: SEEDED_A.start,
      });
      const bay = await patch({ serviceBayId: "bay-lon-2" });
      expect(bay.status).toBe(200);
      expect(bay.body).toMatchObject({
        serviceBayId: "bay-lon-2",
        start: SEEDED_A.start,
      });
    });
  });

  describe("an appointment stored off the grid (D-0001-147)", () => {
    // The dealership opens at 08:10 that day, so the stored 10:00 is no longer on the grid.
    const moveOpening = async () => {
      const { body } = await send(`/dealerships/${LON}`, {
        user: users.managerLondon,
      });
      const saved = await send(`/dealerships/${LON}/settings`, {
        user: users.managerLondon,
        method: "PUT",
        body: {
          weeklyHours: body.weeklyHours,
          dateOverrides: { [SEEDED_A.date]: { open: "08:10", close: "18:00" } },
          policies: {
            leadTimeMinutes: body.policies.leadTimeMinutes,
            horizonDays: body.policies.horizonDays,
            breakMinutes: body.policies.breakMinutes,
          },
        },
      });
      expect(saved.status).toBe(200);
    };
    const patch = (body: Record<string, unknown>) =>
      send(`/appointments/${SEEDED_A.id}`, {
        user: users.managerLondon,
        method: "PATCH",
        body,
      });

    it("a new technician or bay with the stored start is 200, also when the start is off the grid", async () => {
      await moveOpening();
      const tech = await patch({ technicianId: "tech-lon-cedar" });
      expect(tech.status).toBe(200);
      expect(tech.body).toMatchObject({
        technicianId: "tech-lon-cedar",
        start: SEEDED_A.start,
      });
      const bay = await patch({ serviceBayId: "bay-lon-2" });
      expect(bay.status).toBe(200);
      expect(bay.body.start).toBe(SEEDED_A.start);
    });

    it("a move to a different off-grid start is still 409 NOT_ON_GRID and nothing changes", async () => {
      await moveOpening();
      const before = await send(`/appointments/${SEEDED_A.id}`, {
        user: users.managerLondon,
      });
      const clash = await patch({
        start: at(SEEDED_A.date, "10:05"),
        technicianId: "tech-lon-cedar",
      });
      expect(clash.status).toBe(409);
      expect(clash.body.reasons).toContain("NOT_ON_GRID");
      const after = await send(`/appointments/${SEEDED_A.id}`, {
        user: users.managerLondon,
      });
      expect(after.body).toEqual(before.body);
    });
  });

  describe("one car, one appointment at a time (D-0001-146)", () => {
    const SGN = "dealership-saigon";
    const THURSDAY = SEEDED_A.date;
    const busyFrom = at(THURSDAY, "08:00");
    const busyTo = at(THURSDAY, "09:00");
    const overlapsBusy = (s: { start: string; end: string }) =>
      Date.parse(s.start) < Date.parse(busyTo) &&
      Date.parse(busyFrom) < Date.parse(s.end);
    const bookSaigon = () =>
      book(users.customerA, {
        dealershipId: SGN,
        serviceTypeId: OIL,
        start: busyFrom,
        vehicleId: "vehicle-a",
      });
    const days = (user: string, query: Record<string, unknown>) =>
      send(`/dealerships/${LON}/availability`, {
        user,
        query: {
          serviceTypeId: OIL,
          date: THURSDAY,
          transport: "wait",
          ...query,
        },
      });
    const check = (user: string, body: Record<string, unknown>) =>
      send("/availability-checks", {
        user,
        method: "POST",
        body: {
          dealershipId: LON,
          serviceTypeId: OIL,
          start: at(THURSDAY, "08:30"),
          transport: "wait",
          ...body,
        },
      });

    it("a second booking that overlaps the car's other dealership is 409 VEHICLE_BUSY with suggestions that leave out the busy time, and nothing is stored", async () => {
      expect((await bookSaigon()).status).toBe(201);
      const before = (
        await send("/appointments", {
          user: users.managerLondon,
          query: { dealershipId: LON, date: THURSDAY },
        })
      ).body;
      const late = await book(users.customerA, {
        serviceTypeId: OIL,
        start: at(THURSDAY, "08:30"),
        vehicleId: "vehicle-a",
      });
      expect(late.status).toBe(409);
      expect(late.body.code).toBe("SLOT_UNAVAILABLE");
      expect(late.body.reasons).toContain("VEHICLE_BUSY");
      expect(late.body.suggestions.length).toBeGreaterThan(0);
      expect(late.body.suggestions.some(overlapsBusy)).toBe(false);
      const after = (
        await send("/appointments", {
          user: users.managerLondon,
          query: { dealershipId: LON, date: THURSDAY },
        })
      ).body;
      expect(after).toEqual(before);
    });

    it("the same overlap at the same dealership is refused too, and another car is not", async () => {
      expect((await book(users.customerA, { start: busyFrom })).status).toBe(
        201,
      );
      const same = await book(users.customerA, {
        start: at(THURSDAY, "08:30"),
      });
      expect(same.status).toBe(409);
      expect(same.body.reasons).toContain("VEHICLE_BUSY");
      const other = await book(users.customerB, {
        start: at(THURSDAY, "08:30"),
        vehicleId: "vehicle-b",
      });
      // Resources may be short at that time, but the reason is never the other car.
      expect(other.body.reasons ?? []).not.toContain("VEHICLE_BUSY");
    });

    it("reschedule and adjust apply the same rule", async () => {
      const first = await book(users.customerA, { start: busyFrom });
      const second = await book(users.customerA, {
        start: at(THURSDAY, "13:00"),
      });
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      const reschedule = await send(
        `/appointments/${second.body.id}/reschedule`,
        {
          user: users.customerA,
          method: "POST",
          headers: { "Idempotency-Key": key() },
          body: { start: at(THURSDAY, "08:30") },
        },
      );
      expect(reschedule.status).toBe(409);
      expect(reschedule.body.reasons).toContain("VEHICLE_BUSY");
      const adjust = await send(`/appointments/${second.body.id}`, {
        user: users.managerLondon,
        method: "PATCH",
        body: { start: at(THURSDAY, "08:30") },
      });
      expect(adjust.status).toBe(409);
      expect(adjust.body.reasons).toContain("VEHICLE_BUSY");
      const self = await send(`/appointments/${first.body.id}/reschedule`, {
        user: users.customerA,
        method: "POST",
        headers: { "Idempotency-Key": key() },
        body: { start: at(THURSDAY, "08:30") },
      });
      expect(self.status).toBe(200);
    });

    it("the day search and the check take an optional vehicleId and leave out the car's busy times", async () => {
      expect((await bookSaigon()).status).toBe(201);
      const without = await days(users.customerA, {});
      const withCar = await days(users.customerA, { vehicleId: "vehicle-a" });
      expect(without.status).toBe(200);
      expect(without.body.slots.some(overlapsBusy)).toBe(true);
      expect(withCar.status).toBe(200);
      expect(withCar.body.slots.length).toBeGreaterThan(0);
      expect(withCar.body.slots.some(overlapsBusy)).toBe(false);

      expect((await check(users.customerA, {})).body.available).toBe(true);
      const busy = await check(users.customerA, { vehicleId: "vehicle-a" });
      expect(busy.status).toBe(200);
      expect(busy.body.available).toBe(false);
      expect(busy.body.reasons).toContain("VEHICLE_BUSY");
      expect(busy.body.suggestions.some(overlapsBusy)).toBe(false);
      const otherCar = await check(users.customerB, {
        vehicleId: "vehicle-b",
      });
      expect(otherCar.body.available).toBe(true);
    });

    it("SEC-6: a car a customer does not own is the same 404 as a missing car; staff follow the dealership rules", async () => {
      const notMine = await check(users.customerB, { vehicleId: "vehicle-a" });
      const missing = await check(users.customerB, { vehicleId: "nope" });
      expect(notMine.status).toBe(404);
      expect(missing.status).toBe(404);
      expect({ ...notMine.body, traceId: "", instance: "" }).toEqual({
        ...missing.body,
        traceId: "",
        instance: "",
      });
      const dayNotMine = await days(users.customerB, {
        vehicleId: "vehicle-a",
      });
      const dayMissing = await days(users.customerB, { vehicleId: "nope" });
      expect([dayNotMine.status, dayMissing.status]).toEqual([404, 404]);
      expect(dayNotMine.body.detail).toEqual(dayMissing.body.detail);
      for (const user of [users.staffLondon, users.managerLondon]) {
        expect((await check(user, { vehicleId: "vehicle-a" })).status).toBe(
          200,
        );
      }
      expect(
        (
          await check(users.staffLondon, {
            dealershipId: SGN,
            vehicleId: "vehicle-a",
          })
        ).status,
      ).toBe(403);
    });
  });

  describe("reading the schedule (REQ-BOOK-004, 006, 010)", () => {
    it("staff get every appointment of the local date with a display block; a booking made a moment ago is there; an empty date is an empty list", async () => {
      const before = await dayList(users.staffLondon, SEEDED_A.date);
      expect(before.body).toHaveLength(1);
      expect(before.body[0]).toMatchObject({
        id: SEEDED_A.id,
        timeZone: "Europe/London",
        display: {
          serviceTypeName: "Battery and EV systems check",
          vehicle: { registration: "AB00 DMA" },
          technicianName: "Oliver Hughes",
          serviceBayName: expect.stringMatching(/^Bay/),
          customerName: "Demo Customer A",
        },
      });
      await book(users.customerB, {
        start: at(SEEDED_A.date, "13:00"),
        vehicleId: "vehicle-b",
      });
      expect(
        (await dayList(users.staffLondon, SEEDED_A.date)).body,
      ).toHaveLength(2);
      expect((await dayList(users.staffLondon, "2026-11-20")).body).toEqual([]);
    });

    it("the owner of an appointment gets the technician's name but no bay; another customer gets 404 (D-0001-71)", async () => {
      const mine = await send(`/appointments/${SEEDED_A.id}`, {
        user: users.customerA,
      });
      expect(mine.status).toBe(200);
      expect(mine.body.display.technicianName).toBe("Oliver Hughes");
      expect(mine.body.display).not.toHaveProperty("serviceBayName");
      expect(mine.body.display).not.toHaveProperty("customerName");
      const listed = await send("/appointments", { user: users.customerA });
      expect(listed.body[0].display.technicianName).toBe("Oliver Hughes");
      expect(
        (await send(`/appointments/${SEEDED_A.id}`, { user: users.customerB }))
          .status,
      ).toBe(404);
    });

    it("technicians come with skills, shifts, exceptions and booked intervals, and the bays are listed", async () => {
      const technicians = await send(`/dealerships/${LON}/technicians`, {
        user: users.staffLondon,
        query: { from: SEEDED_A.date, to: SEEDED_A.date },
      });
      expect(technicians.body.map((t: { id: string }) => t.id)).toEqual([
        "tech-lon-ash",
        "tech-lon-birch",
        "tech-lon-cedar",
      ]);
      const ash = technicians.body[0];
      expect(ash.skills).toEqual(["mechanic", "ev"]);
      expect(ash.shiftPattern["1"]).toMatchObject({
        start: "08:00",
        breakStart: "12:00",
      });
      expect(ash.booked).toEqual([
        {
          appointmentId: SEEDED_A.id,
          start: SEEDED_A.start,
          end: at(SEEDED_A.date, "11:00"),
        },
      ]);
      expect(technicians.body[1].booked).toEqual([]);
      const bays = await send(`/dealerships/${LON}/service-bays`, {
        user: users.staffLondon,
      });
      expect(bays.body.map((b: { id: string }) => b.id)).toEqual([
        "bay-lon-1",
        "bay-lon-2",
      ]);
    });

    it("lists the dealerships, one dealership and the service types for every role", async () => {
      const dealerships = await send("/dealerships", { user: users.customerA });
      expect(dealerships.body.map((d: { id: string }) => d.id)).toEqual([
        LON,
        "dealership-saigon",
      ]);
      expect(
        (await send(`/dealerships/${LON}`, { user: users.customerA })).body
          .policies.gridMinutes,
      ).toBe(15);
      expect(
        (await send("/dealerships/nowhere", { user: users.customerA })).status,
      ).toBe(404);
      const types = await send("/service-types", { user: users.customerA });
      expect(types.body).toHaveLength(3);
    });
  });

  describe("settings and shifts over HTTP (REQ-BOOK-007, 008, 011)", () => {
    const settingsBody = async () => {
      const { body } = await send(`/dealerships/${LON}`, {
        user: users.managerLondon,
      });
      return {
        weeklyHours: body.weeklyHours,
        dateOverrides: body.dateOverrides,
        policies: {
          leadTimeMinutes: body.policies.leadTimeMinutes,
          horizonDays: body.policies.horizonDays,
          breakMinutes: body.policies.breakMinutes,
        },
      };
    };
    const put = (body: unknown, preview = false) =>
      send(`/dealerships/${LON}/settings`, {
        user: users.managerLondon,
        method: "PUT",
        body,
        query: preview ? { preview: true } : undefined,
      });

    it("saves hours, flags the appointments that no longer fit with a one-line reason, and the next answers use the new hours", async () => {
      const body = await settingsBody();
      const cut = {
        ...body,
        dateOverrides: { [SEEDED_A.date]: { open: "11:00", close: "16:00" } },
      };
      const preview = await put(cut, true);
      expect(preview.body.flagged).toHaveLength(1);
      // A preview saves nothing.
      expect(
        (await send(`/dealerships/${LON}`, { user: users.managerLondon })).body
          .dateOverrides,
      ).toEqual({});
      const saved = await put(cut);
      expect(saved.status).toBe(200);
      expect(saved.body.flagged).toHaveLength(1);
      expect(saved.body.flagged[0].flags).toEqual([
        {
          kind: "outside_opening_hours",
          since: expect.any(String),
          reason: "Starts before opening time, 11:00",
        },
      ]);
      const grid = await send(`/dealerships/${LON}/availability`, {
        user: users.customerA,
        query: { serviceTypeId: OIL, date: SEEDED_A.date, transport: "wait" },
      });
      expect(grid.body.slots[0].start).toBe(at(SEEDED_A.date, "11:00"));
      const flagged = await send("/appointments", {
        user: users.managerLondon,
        query: { dealershipId: LON, flagged: true },
      });
      expect(flagged.body.map((a: { id: string }) => a.id)).toEqual([
        SEEDED_A.id,
      ]);
      // Moving a flagged appointment to a fitting time clears the flag.
      const moved = await send(`/appointments/${SEEDED_A.id}`, {
        user: users.managerLondon,
        method: "PATCH",
        body: { start: at(SEEDED_A.date, "12:00") },
      });
      expect(moved.body.flags).toEqual([]);
    });

    it("a booking that has already ended is never in the preview or the save (D-0001-46 A)", async () => {
      const body = await settingsBody();
      // Customer A's booking runs 10:00 to 11:00; these hours leave it outside.
      const cut = {
        ...body,
        dateOverrides: { [SEEDED_A.date]: { open: "11:00", close: "16:00" } },
      };
      // Still running: it is tested and would be flagged.
      world.clock.set(Date.parse(at(SEEDED_A.date, "10:30")));
      expect(
        (await put(cut, true)).body.flagged.map((a: { id: string }) => a.id),
      ).toEqual([SEEDED_A.id]);
      // Ended: it is left out of the preview and of the save, and keeps no flag.
      world.clock.set(Date.parse(at(SEEDED_A.date, "11:00")));
      expect((await put(cut, true)).body.flagged).toEqual([]);
      const saved = await put(cut);
      expect(saved.status).toBe(200);
      expect(saved.body.flagged).toEqual([]);
      const flagged = await send("/appointments", {
        user: users.managerLondon,
        query: { dealershipId: LON, flagged: true },
      });
      expect(flagged.body).toEqual([]);
    });

    it("an invalid body is 422 naming the field", async () => {
      const body = await settingsBody();
      const bad = await put({
        ...body,
        weeklyHours: { "1": { open: "18:00", close: "08:00" } },
      });
      expect(bad.status).toBe(422);
      expect(bad.body.errors).toEqual([
        {
          field: "weeklyHours.1.close",
          message: "Closing time must be after the opening time.",
        },
      ]);
      const zone = await put({ ...body, timeZone: "Asia/Tokyo" });
      expect(zone.status).toBe(422);
      expect(zone.body.errors).toEqual([
        { field: "timeZone", message: "Is not accepted." },
      ]);
    });

    it("saves a technician's shifts and flags what no longer fits", async () => {
      const ash = (
        await send(`/dealerships/${LON}/technicians`, {
          user: users.managerLondon,
          query: { from: SEEDED_A.date, to: SEEDED_A.date },
        })
      ).body[0];
      const leave = {
        shiftPattern: ash.shiftPattern,
        shiftExceptions: { [SEEDED_A.date]: { kind: "leave" } },
      };
      const saved = await send("/technicians/tech-lon-ash/shifts", {
        user: users.managerLondon,
        method: "PUT",
        body: leave,
      });
      expect(saved.status).toBe(200);
      expect(saved.body.flagged[0].flags[0]).toMatchObject({
        kind: "outside_shift",
        reason: "Oliver is not working this day",
      });
      const bad = await send("/technicians/tech-lon-ash/shifts", {
        user: users.managerLondon,
        method: "PUT",
        body: {
          ...leave,
          shiftExceptions: {
            "2026-11-06": {
              kind: "changed",
              shift: { start: "09:07", end: "10:00" },
            },
          },
        },
      });
      expect(bad.status).toBe(422);
      expect(bad.body.errors[0].field).toBe(
        "shiftExceptions.2026-11-06.shift.start",
      );
    });
  });

  describe("the outbox (REQ-BOOK-013, SEC-17)", () => {
    it("is 200 for the manager of the dealership with each message's links built from the request origin; empty until messages exist", async () => {
      const empty = await send("/outbox", {
        user: users.managerLondon,
        query: { dealershipId: LON },
      });
      expect(empty.body).toEqual([]);
      await world.repository.write(async (stores) => {
        await stores.outbox.add([
          {
            id: "message-1",
            appointmentId: SEEDED_A.id,
            kind: "confirmation",
            dedupeKey: `${SEEDED_A.id}:confirmation:1`,
            dueAt: Date.parse("2026-11-02T09:00:00Z"),
            createdAt: Date.parse("2026-11-02T09:00:00Z"),
            forStart: Date.parse("2026-11-02T09:00:00Z"),
            status: "pending",
          },
        ]);
        return { ok: true, value: undefined };
      });
      const reply = await send("/outbox", { user: users.managerLondon });
      expect(reply.body).toEqual([
        {
          id: "message-1",
          appointmentId: SEEDED_A.id,
          dealershipId: LON,
          kind: "confirmation",
          dueAt: "2026-11-02T09:00:00Z",
          createdAt: "2026-11-02T09:00:00Z",
          forStart: "2026-11-02T09:00:00Z",
          status: "pending",
          links: {
            cancel: `${origin}/appointments/${SEEDED_A.id}`,
            reschedule: `${origin}/appointments/${SEEDED_A.id}/reschedule`,
          },
        },
      ]);
      const byAppointment = await send("/outbox", {
        user: users.managerLondon,
        query: { appointmentId: SEEDED_A.id },
      });
      expect(byAppointment.body).toHaveLength(1);
      expect(
        (
          await send("/outbox", {
            user: users.managerLondon,
            query: { appointmentId: "nope" },
          })
        ).status,
      ).toBe(404);
    });

    it("the manager of dealership 2 asking for dealership 1 is 403, and so is everyone who is not a manager", async () => {
      const ask = (user: string) =>
        send("/outbox", { user, query: { dealershipId: LON } });
      expect((await ask(users.managerSaigon)).status).toBe(403);
      for (const user of [users.customerA, users.staffLondon]) {
        expect((await ask(user)).status).toBe(403);
      }
    });
  });

  describe("search limits (SEC-7.AC-4, D-0000-26)", () => {
    it("search text under 3 characters is 422, and many matches come back at most 10", async () => {
      await world.repository.write(async (stores) => {
        for (let i = 1; i <= 12; i++) {
          await stores.customers.insert(
            {
              id: `many-${i}`,
              name: `Zed Many ${i}`,
              phone: `+44 7700 9005${String(i).padStart(2, "0")}`,
              email: "",
            },
            {
              id: `many-v-${i}`,
              customerId: `many-${i}`,
              registration: `MN${i}`,
              make: "M",
              model: "M",
            },
          );
        }
        return { ok: true, value: undefined };
      });
      const search = (text: string) =>
        send("/customers/search", {
          user: users.staffLondon,
          method: "POST",
          body: { text },
        });
      const short = await search("Ze");
      expect(short.status).toBe(422);
      expect(short.body.errors[0].field).toBe("text");
      expect((await search("Zed")).body).toHaveLength(10);
    });
  });
});
