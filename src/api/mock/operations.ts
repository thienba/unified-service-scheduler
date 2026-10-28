// One function for each operation of openapi.yaml: read the checked request, call the command or the
// query, map the answer. There are no business rules here (AD-2, AD-3); `Record<keyof operations, …>`
// makes the build fail when the contract gains an operation that has no handler.
import type { Actor } from "../../application/actor";
import type { CommandDeps } from "../../application/deps";
import {
  adjustAppointment,
  bookAppointment,
  cancelAppointment,
  rescheduleAppointment,
  updateDealershipSettings,
  updateTechnicianShifts,
  type BookRequest,
  type CommandResult,
  type SettingsResult,
} from "../../application/commands";
import {
  checkAvailability,
  getAppointment,
  getDealership,
  getSchedule,
  listDealerships,
  listMyAppointments,
  listOutbox,
  listServiceBays,
  listServiceTypes,
  listTechnicians,
  listVehicles,
  searchAvailability,
  searchCustomers,
  viewAppointments,
  type QueryFailure,
} from "../../application/queries";
import type { DemoUser } from "../../domain/model";
import type { components, operations } from "../contract/schema";
import type { ProblemSpec } from "./problems";
import {
  appointmentToWire,
  bayToWire,
  customerToWire,
  dealershipToWire,
  outboxToWire,
  parseInstant,
  serviceTypeToWire,
  slot,
  technicianToWire,
  vehicleToWire,
} from "./wire";

type Schemas = components["schemas"];

export type Reply =
  { status: number; body: unknown } | { problem: ProblemSpec };

/** What a handler is given: the user, the checked request and the services (the logger already carries the trace id). */
export interface Context {
  actor: Actor;
  user: DemoUser;
  deps: CommandDeps;
  path: Record<string, unknown>;
  query: Record<string, unknown>;
  body: unknown;
  idempotencyKey: string | undefined;
  /** The origin the request was sent to, for the links in outbox messages. */
  origin: string;
}

type Handler = (c: Context) => Promise<Reply>;

const ok = (body: unknown, status = 200): Reply => ({ status, body });

/** Every answer a command or query can give instead of data, as the problem the contract names. */
function fail(
  result: Exclude<CommandResult, { kind: "ok" }> | QueryFailure,
): Reply {
  switch (result.kind) {
    case "validation_failed":
      return { problem: { code: "VALIDATION_FAILED", errors: result.errors } };
    case "forbidden":
      return { problem: { code: "FORBIDDEN" } };
    case "not_found":
      return { problem: { code: "NOT_FOUND" } };
    case "already_cancelled":
      return { problem: { code: "ALREADY_CANCELLED" } };
    case "change_window_closed":
      return { problem: { code: "CHANGE_WINDOW_CLOSED" } };
    case "idempotency_key_missing":
      return { problem: { code: "IDEMPOTENCY_KEY_MISSING" } };
    case "idempotency_key_reused":
      return { problem: { code: "IDEMPOTENCY_KEY_REUSED" } };
    case "search_range_too_large":
      return { problem: { code: "SEARCH_RANGE_TOO_LARGE" } };
    case "slot_unavailable":
      return {
        problem: {
          code: "SLOT_UNAVAILABLE",
          reasons: result.reasons,
          suggestions: result.suggestions.map(slot),
        },
      };
  }
}

/** The text is a real moment, or the 422 that names the field. */
function momentOf(text: string, field: string): number | Reply {
  return (
    parseInstant(text) ?? {
      problem: {
        code: "VALIDATION_FAILED",
        errors: [{ field, message: "Must be a real date and time." }],
      },
    }
  );
}

async function appointmentReply(
  c: Context,
  result: CommandResult,
  status = 200,
): Promise<Reply> {
  if (result.kind !== "ok") return fail(result);
  const [view] = await viewAppointments(c.actor, c.deps, [result.appointment]);
  return ok(appointmentToWire(view!), status);
}

async function flaggedReply(
  c: Context,
  result: SettingsResult,
): Promise<Reply> {
  if (result.kind !== "ok") return fail(result);
  const views = await viewAppointments(c.actor, c.deps, result.flagged);
  return ok({ flagged: views.map((v) => appointmentToWire(v)) });
}

export const handlers: Record<keyof operations, Handler> = {
  getMe: async ({ user }) =>
    ok({
      userId: user.id,
      name: user.name,
      role: user.role,
      customerId: user.customerId,
      dealershipIds: user.dealershipIds,
    }),

  listDealerships: async (c) =>
    ok((await listDealerships(c.actor, c.deps)).map(dealershipToWire)),

  getDealership: async (c) => {
    const dealership = await getDealership(
      c.actor,
      c.deps,
      c.path.dealershipId as string,
    );
    return dealership
      ? ok(dealershipToWire(dealership))
      : { problem: { code: "NOT_FOUND" } };
  },

  updateDealershipSettings: async (c) =>
    flaggedReply(
      c,
      await updateDealershipSettings(
        c.actor,
        c.deps,
        c.path.dealershipId as string,
        c.body as Schemas["SettingsRequest"],
        { preview: c.query.preview === true },
      ),
    ),

  listServiceTypes: async (c) =>
    ok((await listServiceTypes(c.actor, c.deps)).map(serviceTypeToWire)),

  listTechnicians: async (c) => {
    const result = await listTechnicians(c.actor, c.deps, {
      dealershipId: c.path.dealershipId as string,
      from: c.query.from as string,
      to: c.query.to as string,
    });
    return result.kind === "ok"
      ? ok(result.technicians.map(technicianToWire))
      : fail(result);
  },

  updateTechnicianShifts: async (c) =>
    flaggedReply(
      c,
      await updateTechnicianShifts(
        c.actor,
        c.deps,
        c.path.technicianId as string,
        c.body as Schemas["ShiftsRequest"],
        { preview: c.query.preview === true },
      ),
    ),

  listServiceBays: async (c) => {
    const result = await listServiceBays(
      c.actor,
      c.deps,
      c.path.dealershipId as string,
    );
    return result.kind === "ok" ? ok(result.bays.map(bayToWire)) : fail(result);
  },

  searchAvailability: async (c) => {
    const q = c.query as {
      serviceTypeId: string;
      date: string;
      transport: Schemas["Transport"];
      technicianId?: string;
    };
    const result = await searchAvailability(c.actor, c.deps, {
      dealershipId: c.path.dealershipId as string,
      ...q,
    });
    return result.kind === "ok"
      ? ok({
          date: result.date,
          timeZone: result.timeZone,
          gridMinutes: result.gridMinutes,
          slots: result.slots.map(slot),
        })
      : fail(result);
  },

  checkAvailability: async (c) => {
    const b = c.body as Schemas["AvailabilityCheckRequest"];
    const start = momentOf(b.start, "start");
    if (typeof start !== "number") return start;
    const result = await checkAvailability(c.actor, c.deps, { ...b, start });
    if (result.kind !== "ok") return fail(result);
    const { answer } = result;
    return ok(
      answer.available
        ? {
            available: true,
            technicianId: answer.technicianId,
            serviceBayId: answer.serviceBayId,
            courtesyCarId: answer.courtesyCarId,
          }
        : {
            available: false,
            reasons: answer.reasons,
            suggestions: answer.suggestions.map(slot),
          },
    );
  },

  listAppointments: async (c) => {
    const q = c.query as {
      dealershipId?: string;
      date?: string;
      flagged?: boolean;
      includeCancelled?: boolean;
    };
    // A customer who gives no date gets their own appointments from now on.
    const result =
      c.actor.role === "customer" && q.date === undefined && !q.flagged
        ? await listMyAppointments(c.actor, c.deps, q)
        : await getSchedule(c.actor, c.deps, q);
    return result.kind === "ok"
      ? ok(result.appointments.map((v) => appointmentToWire(v)))
      : fail(result);
  },

  bookAppointment: async (c) => {
    const b = c.body as Schemas["BookingRequest"];
    let start: number | undefined;
    if (b.start !== undefined) {
      const moment = momentOf(b.start, "start");
      if (typeof moment !== "number") return moment;
      start = moment;
    }
    const request: BookRequest = { ...b, start };
    return appointmentReply(
      c,
      await bookAppointment(c.actor, c.deps, request, c.idempotencyKey),
      201,
    );
  },

  getAppointment: async (c) => {
    const result = await getAppointment(
      c.actor,
      c.deps,
      c.path.appointmentId as string,
    );
    return result.kind === "ok"
      ? ok(appointmentToWire(result.appointment))
      : fail(result);
  },

  adjustAppointment: async (c) => {
    const b = c.body as Schemas["AdjustRequest"];
    let start: number | undefined;
    if (b.start !== undefined) {
      const moment = momentOf(b.start, "start");
      if (typeof moment !== "number") return moment;
      start = moment;
    }
    const result = await adjustAppointment(
      c.actor,
      c.deps,
      c.path.appointmentId as string,
      { ...b, start },
    );
    if (result.kind !== "ok") return fail(result);
    const [view] = await viewAppointments(c.actor, c.deps, [
      result.appointment,
    ]);
    const picked =
      Object.keys(result.picked).length > 0 ? result.picked : undefined;
    return ok(appointmentToWire(view!, picked));
  },

  rescheduleAppointment: async (c) => {
    const start = momentOf(
      (c.body as Schemas["RescheduleRequest"]).start,
      "start",
    );
    if (typeof start !== "number") return start;
    return appointmentReply(
      c,
      await rescheduleAppointment(
        c.actor,
        c.deps,
        c.path.appointmentId as string,
        { start },
        c.idempotencyKey,
      ),
    );
  },

  cancelAppointment: async (c) =>
    appointmentReply(
      c,
      await cancelAppointment(c.actor, c.deps, c.path.appointmentId as string),
    ),

  searchCustomers: async (c) => {
    const result = await searchCustomers(
      c.actor,
      c.deps,
      c.body as Schemas["CustomerSearchRequest"],
    );
    return result.kind === "ok"
      ? ok(result.customers.map(customerToWire))
      : fail(result);
  },

  listCustomerVehicles: async (c) => {
    const result = await listVehicles(
      c.actor,
      c.deps,
      c.path.customerId as string,
    );
    return result.kind === "ok"
      ? ok(result.vehicles.map(vehicleToWire))
      : fail(result);
  },

  listOutbox: async (c) => {
    const result = await listOutbox(
      c.actor,
      c.deps,
      c.query as { dealershipId?: string; appointmentId?: string },
    );
    return result.kind === "ok"
      ? ok(result.messages.map((m) => outboxToWire(m, c.origin)))
      : fail(result);
  },
};
