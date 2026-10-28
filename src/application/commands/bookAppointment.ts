// Plan ticket A5. Book is one write unit: look up the key, load, re-check, then write (AD-4, AD-5).
import { servesDealership, type Actor } from "../actor";
import type { CommandDeps } from "../deps";
import { keyRecord, lookupKey, requestHash } from "../idempotency";
import { loadSnapshot } from "../load-snapshot";
import type { Outcome } from "../ports";
import type { SchedulingSnapshot } from "../../domain/availability";
import { MINUTE_MS } from "../../domain/time";
import type {
  Appointment,
  Customer,
  EpochMs,
  Transport,
  Vehicle,
} from "../../domain/model";
import {
  validateNewCustomer,
  validateNewVehicle,
  type FieldError,
  type NewCustomerInput,
  type NewVehicleInput,
} from "../../domain/validation/new-customer";
import {
  ROUTES,
  logOutcome,
  runCheck,
  slotUnavailable,
  type CommandResult,
  type Conflict,
  type Failure,
} from "./shared";

/** Every field may be missing: the command names what is missing (REQ-BOOK-001.AC-2). */
export interface BookRequest {
  dealershipId?: string;
  serviceTypeId?: string;
  start?: EpochMs;
  /** Exactly one of `wait`, `drop_off`, `courtesy_car` (REQ-BOOK-010.AC-1). */
  transport?: Transport;
  /** An existing customer and one of their vehicles... */
  customerId?: string;
  vehicleId?: string;
  /** ...or a new customer and vehicle, for staff and managers (Q-0001-23 A). */
  newCustomer?: NewCustomerInput;
  newVehicle?: NewVehicleInput;
  /**
   * Staff and managers may fix the technician (D-0001-20 B). Open question Q-0001-63: the day
   * search and the suggestions do not follow it beyond this one booking.
   */
  technicianId?: string;
}

const TRANSPORTS: readonly string[] = ["wait", "drop_off", "courtesy_car"];

/** Answers from the actor and the request alone, before any store is read (AD-3). */
function refused(actor: Actor, request: BookRequest): boolean {
  if (actor.role === "customer") {
    return (
      request.newCustomer !== undefined ||
      request.newVehicle !== undefined ||
      request.technicianId !== undefined ||
      (request.customerId !== undefined &&
        request.customerId !== actor.customerId)
    );
  }
  return (
    request.dealershipId !== undefined &&
    !servesDealership(actor, request.dealershipId)
  );
}

function validate(
  actor: Actor,
  request: BookRequest,
  now: EpochMs,
): FieldError[] {
  const errors: FieldError[] = [];
  const missing = (field: string, label: string) =>
    errors.push({ field, message: `${label} is required.` });

  if (request.dealershipId === undefined) missing("dealershipId", "Dealership");
  if (request.serviceTypeId === undefined)
    missing("serviceTypeId", "Service type");
  if (typeof request.start !== "number" || !Number.isFinite(request.start)) {
    missing("start", "Start time");
  }
  if (
    request.transport === undefined ||
    !TRANSPORTS.includes(request.transport)
  ) {
    errors.push({
      field: "transport",
      message: "Choose exactly one of wait, drop off or courtesy car.",
    });
  }

  // Open question Q-0001-61: a new vehicle for an existing customer is not accepted yet.
  const isNew =
    request.newCustomer !== undefined || request.newVehicle !== undefined;
  if (isNew) {
    if (request.newCustomer === undefined)
      missing("newCustomer", "New customer");
    else errors.push(...validateNewCustomer(request.newCustomer));
    if (request.newVehicle === undefined) missing("newVehicle", "New vehicle");
    else errors.push(...validateNewVehicle(request.newVehicle, now));
    if (request.customerId !== undefined || request.vehicleId !== undefined) {
      errors.push({
        field: "newCustomer",
        message:
          "Send an existing customer and vehicle, or a new customer and vehicle, not both.",
      });
    }
  } else {
    if (actor.role !== "customer" && request.customerId === undefined)
      missing("customerId", "Customer");
    if (request.vehicleId === undefined) missing("vehicleId", "Vehicle");
  }
  return errors;
}

interface NewPair {
  customer: Customer;
  vehicle: Vehicle;
}

interface Loaded {
  snapshot: SchedulingSnapshot;
  customerId: string;
  vehicleId: string;
  created?: NewPair;
}

interface Replayed {
  kind: "replay";
  appointment: Appointment;
}

export async function bookAppointment(
  actor: Actor,
  deps: CommandDeps,
  request: BookRequest,
  idempotencyKey: string | undefined,
): Promise<CommandResult> {
  const result = await book(actor, deps, request, idempotencyKey);
  logOutcome(deps, "appointment.book", actor, result, {
    dealershipId: request.dealershipId,
  });
  return result;
}

async function book(
  actor: Actor,
  deps: CommandDeps,
  request: BookRequest,
  idempotencyKey: string | undefined,
): Promise<CommandResult> {
  if (idempotencyKey === undefined || idempotencyKey === "") {
    return { kind: "idempotency_key_missing" };
  }
  if (refused(actor, request)) return { kind: "forbidden" };
  const now = deps.clock.now();
  const errors = validate(actor, request, now);
  if (errors.length > 0) return { kind: "validation_failed", errors };

  // Every field is present now (validate checked it).
  const dealershipId = request.dealershipId!;
  const serviceTypeId = request.serviceTypeId!;
  const start = request.start!;
  const transport = request.transport!;
  const check = { start, transport, technicianId: request.technicianId };
  const hash = await requestHash("bookAppointment", request);

  const outcome = await deps.uow.write<
    Appointment,
    Failure | Conflict | Replayed
  >(async (stores) => {
    const loaded = await deps.logger.step(
      "load",
      async (): Promise<Outcome<Loaded, Failure | Replayed>> => {
        const key = await lookupKey(stores, actor, idempotencyKey, hash);
        if (key.kind === "reused") {
          return { ok: false, error: { kind: "idempotency_key_reused" } };
        }
        if (key.kind === "same") {
          const appointment = await stores.appointments.get(
            key.response.appointmentId,
          );
          return {
            ok: false,
            error: { kind: "replay", appointment: appointment! },
          };
        }

        let customerId: string;
        let vehicleId: string;
        let created: NewPair | undefined;
        if (request.newCustomer !== undefined) {
          const { name, phone, email } = request.newCustomer;
          const { registration, make, model, year } = request.newVehicle!;
          customerId = deps.ids.next();
          vehicleId = deps.ids.next();
          created = {
            customer: {
              id: customerId,
              name: name!.trim(),
              phone: phone!.trim(),
              email: email?.trim() ?? "",
            },
            vehicle: {
              id: vehicleId,
              customerId,
              registration: registration!.trim(),
              make: make!.trim(),
              model: model!.trim(),
              ...(year === undefined ? {} : { year }),
            },
          };
        } else {
          customerId =
            actor.role === "customer" ? actor.customerId! : request.customerId!;
          vehicleId = request.vehicleId!;
          const customer = await stores.customers.get(customerId);
          if (!customer) return { ok: false, error: { kind: "not_found" } };
          if (!customer.vehicles.some((v) => v.id === vehicleId)) {
            // A customer must not learn that another customer's vehicle exists (SEC-6.AC-2).
            return {
              ok: false,
              error:
                actor.role === "customer"
                  ? { kind: "not_found" }
                  : {
                      kind: "validation_failed",
                      errors: [
                        {
                          field: "vehicleId",
                          message: "Vehicle does not belong to this customer.",
                        },
                      ],
                    },
            };
          }
        }

        const snapshot = await loadSnapshot(stores, {
          dealershipId,
          serviceTypeId,
          around: start,
          daysEitherSide: 0,
        });
        if (!snapshot) return { ok: false, error: { kind: "not_found" } };
        return {
          ok: true,
          value: { snapshot, customerId, vehicleId, created },
        };
      },
    );
    if (!loaded.ok) return loaded;
    const { snapshot, customerId, vehicleId, created } = loaded.value;

    const checked = await runCheck(deps, snapshot, check, now);
    if (!checked.available) {
      return {
        ok: false,
        error: { kind: "conflict", reasons: checked.reasons },
      };
    }

    const appointment: Appointment = {
      id: deps.ids.next(),
      dealershipId,
      timeZone: snapshot.dealership.timeZone,
      customerId,
      vehicleId,
      serviceTypeId,
      technicianId: checked.technicianId,
      serviceBayId: checked.serviceBayId,
      courtesyCarId: checked.courtesyCarId,
      transport,
      start,
      end: start + snapshot.serviceType.durationMinutes * MINUTE_MS,
      status: "confirmed",
      flags: [],
      version: 1,
      createdAt: now,
      updatedAt: now,
      cancelledAt: null,
    };
    await deps.logger.step("write", async () => {
      if (created)
        await stores.customers.insert(created.customer, created.vehicle);
      await stores.appointments.insert(appointment);
      await stores.idempotency.put(
        keyRecord(actor, idempotencyKey, hash, appointment.id, now),
      );
    });
    return { ok: true, value: appointment };
  });

  if (outcome.ok) {
    deps.metrics.increment("appointments_confirmed_total", {
      dealershipId,
      actorRole: actor.role,
    });
    return { kind: "ok", appointment: outcome.value };
  }
  const { error } = outcome;
  if (error.kind === "replay") {
    deps.metrics.increment("idempotent_replays_total", { route: ROUTES.book });
    return { kind: "ok", appointment: error.appointment };
  }
  if (error.kind === "conflict") {
    return slotUnavailable(
      deps,
      { dealershipId, serviceTypeId, request: { ...check, start } },
      error,
      now,
    );
  }
  return error;
}
