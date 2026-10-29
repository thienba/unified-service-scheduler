// The in-memory store for tests (AD-8). Write units run one after another through a queue;
// each works on a copy and the copy replaces the stored data only when the unit succeeds.
import { isBlocking } from "../../../domain/appointment/blocking";
import type {
  Appointment,
  Customer,
  CourtesyCar,
  Dealership,
  DemoUser,
  ServiceBay,
  ServiceType,
  Technician,
  Vehicle,
} from "../../../domain/model";
import type {
  CustomerWithVehicles,
  IdempotencyRecord,
  OutboxMessage,
  Repository,
  Stores,
} from "../../../application/ports";
import {
  byId,
  byStartThenId,
  byTechnicianThenDate,
  matchesSearch,
  touchesRange,
} from "../shared";

interface Data {
  dealerships: Map<string, Dealership>;
  technicians: Map<string, Technician>;
  serviceBays: Map<string, ServiceBay>;
  courtesyCars: Map<string, CourtesyCar>;
  serviceTypes: Map<string, ServiceType>;
  customers: Map<string, Customer>;
  vehicles: Map<string, Vehicle>;
  appointments: Map<string, Appointment>;
  idempotency: Map<string, IdempotencyRecord>;
  outbox: Map<string, OutboxMessage>;
  demoUsers: Map<string, DemoUser>;
  seedVersion: number | undefined;
}

function emptyData(): Data {
  return {
    dealerships: new Map(),
    technicians: new Map(),
    serviceBays: new Map(),
    courtesyCars: new Map(),
    serviceTypes: new Map(),
    customers: new Map(),
    vehicles: new Map(),
    appointments: new Map(),
    idempotency: new Map(),
    outbox: new Map(),
    demoUsers: new Map(),
    seedVersion: undefined,
  };
}

/** Values go in and come out as copies, as they do with IndexedDB. */
const copy = <T>(value: T): T => structuredClone(value);
const mapById = <T extends { id: string }>(rows: T[]) =>
  new Map(rows.map((row) => [row.id, copy(row)]));

function withVehicles(data: Data, customer: Customer): CustomerWithVehicles {
  const vehicles = byId(
    [...data.vehicles.values()].filter((v) => v.customerId === customer.id),
  );
  return copy({ ...customer, vehicles });
}

function buildStores(data: Data): Stores {
  const listBy = <T extends { dealershipId: string }>(
    rows: Map<string, T>,
    dealershipId: string,
  ) => [...rows.values()].filter((r) => r.dealershipId === dealershipId);
  const touching = (dealershipId: string, from: number, to: number) =>
    byStartThenId(
      listBy(data.appointments, dealershipId).filter((a) =>
        touchesRange(a, from, to),
      ),
    );

  return {
    scheduling: {
      getDealership: async (id) => copy(data.dealerships.get(id)),
      listDealerships: async () => copy(byId([...data.dealerships.values()])),
      listServiceTypes: async () => copy(byId([...data.serviceTypes.values()])),
      listTechnicians: async (id) => copy(byId(listBy(data.technicians, id))),
      listShiftExceptions: async (dealershipId, fromDate, toDate) =>
        byTechnicianThenDate(
          listBy(data.technicians, dealershipId).flatMap((t) =>
            Object.entries(t.shiftExceptions)
              .filter(([date]) => date >= fromDate && date <= toDate)
              .map(([date, exception]) =>
                copy({ technicianId: t.id, date, exception }),
              ),
          ),
        ),
      listServiceBays: async (id) => copy(byId(listBy(data.serviceBays, id))),
      listCourtesyCars: async (id) => copy(byId(listBy(data.courtesyCars, id))),
      getServiceType: async (id) => copy(data.serviceTypes.get(id)),
      listBlockingAppointments: async (dealershipId, from, to) =>
        copy(touching(dealershipId, from, to).filter(isBlocking)),
    },
    appointments: {
      get: async (id) => copy(data.appointments.get(id)),
      insert: async (appointment) => {
        if (data.appointments.has(appointment.id)) {
          throw new Error(`Appointment ${appointment.id} is already stored`);
        }
        data.appointments.set(appointment.id, copy(appointment));
      },
      update: async (appointment) => {
        if (!data.appointments.has(appointment.id)) {
          throw new Error(`Appointment ${appointment.id} is not stored`);
        }
        data.appointments.set(appointment.id, copy(appointment));
      },
      listByDealershipDay: async (dealershipId, from, to) =>
        copy(touching(dealershipId, from, to)),
      listByCustomer: async (customerId) =>
        copy(
          byStartThenId(
            [...data.appointments.values()].filter(
              (a) => a.customerId === customerId,
            ),
          ),
        ),
    },
    customers: {
      search: async (text) =>
        byId(
          [...data.customers.values()]
            .map((c) => withVehicles(data, c))
            .filter((c) => matchesSearch(text, c, c.vehicles)),
        ),
      get: async (id) => {
        const customer = data.customers.get(id);
        return customer && withVehicles(data, customer);
      },
      insert: async (customer, vehicle) => {
        if (data.customers.has(customer.id)) {
          throw new Error(`Customer ${customer.id} is already stored`);
        }
        if (data.vehicles.has(vehicle.id)) {
          throw new Error(`Vehicle ${vehicle.id} is already stored`);
        }
        data.customers.set(customer.id, copy(customer));
        data.vehicles.set(vehicle.id, copy(vehicle));
      },
      insertVehicle: async (vehicle) => {
        if (data.vehicles.has(vehicle.id)) {
          throw new Error(`Vehicle ${vehicle.id} is already stored`);
        }
        data.vehicles.set(vehicle.id, copy(vehicle));
      },
      findDuplicates: async (phone, registration) =>
        byId(
          [...data.customers.values()]
            .map((c) => withVehicles(data, c))
            .filter(
              (c) =>
                c.phone === phone ||
                c.vehicles.some((v) => v.registration === registration),
            ),
        ),
    },
    settings: {
      saveDealershipSettings: async (id, settings) => {
        const dealership = data.dealerships.get(id);
        if (!dealership) throw new Error(`Dealership ${id} is not stored`);
        data.dealerships.set(id, copy({ ...dealership, ...settings }));
      },
      saveTechnicianShifts: async (id, shiftPattern, shiftExceptions) => {
        const technician = data.technicians.get(id);
        if (!technician) throw new Error(`Technician ${id} is not stored`);
        data.technicians.set(
          id,
          copy({ ...technician, shiftPattern, shiftExceptions }),
        );
      },
    },
    idempotency: {
      get: async (actorId, key) =>
        copy(data.idempotency.get(`${actorId}|${key}`)),
      put: async (record) => {
        data.idempotency.set(`${record.actorId}|${record.key}`, copy(record));
      },
    },
    outbox: {
      add: async (messages) => {
        for (const message of messages) {
          const known = [...data.outbox.values()].some(
            (m) => m.dedupeKey === message.dedupeKey,
          );
          if (known) continue;
          if (data.outbox.has(message.id)) {
            throw new Error(`Outbox message ${message.id} is already stored`);
          }
          data.outbox.set(message.id, copy(message));
        }
      },
      cancelPending: async (appointmentId) => {
        for (const message of data.outbox.values()) {
          if (
            message.appointmentId === appointmentId &&
            message.status === "pending"
          ) {
            message.status = "cancelled";
          }
        }
      },
      list: async (filter = {}) =>
        copy(
          byId(
            [...data.outbox.values()].filter(
              (m) =>
                (filter.appointmentId === undefined ||
                  m.appointmentId === filter.appointmentId) &&
                (filter.status === undefined || m.status === filter.status),
            ),
          ),
        ),
    },
  };
}

export function createMemoryRepository(): Repository {
  let committed = emptyData();
  // Write units wait for the one before them. A failed unit must not stop the queue.
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
    const result = queue.then(job);
    queue = result.catch(() => undefined);
    return result;
  };

  return {
    read: (work) => work(buildStores(committed)),
    write: (work) =>
      enqueue(async () => {
        const draft = copy(committed);
        const outcome = await work(buildStores(draft));
        if (outcome.ok) committed = draft;
        return outcome;
      }),
    getSeedVersion: async () => committed.seedVersion,
    listDemoUsers: async () => copy(byId([...committed.demoUsers.values()])),
    replaceAll: (seed, seedVersion) =>
      enqueue(async () => {
        const next = emptyData();
        next.dealerships = mapById(seed.dealerships);
        next.technicians = mapById(seed.technicians);
        next.serviceBays = mapById(seed.serviceBays);
        next.courtesyCars = mapById(seed.courtesyCars);
        next.serviceTypes = mapById(seed.serviceTypes);
        next.customers = mapById(seed.customers);
        next.vehicles = mapById(seed.vehicles);
        next.appointments = mapById(seed.appointments);
        next.demoUsers = mapById(seed.demoUsers);
        next.seedVersion = seedVersion;
        committed = next;
      }),
  };
}
