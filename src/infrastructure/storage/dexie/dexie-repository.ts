// The IndexedDB store for the app (AD-8). Each write unit is one `rw` transaction over every table.
// Inside a unit, await only store calls: Dexie ends a transaction when code awaits a promise
// that is not Dexie's (AD-7, architecture.md section 7.2 guarantee 4).
import Dexie from "dexie";
import type { Customer, Technician } from "../../../domain/model";
import { isBlocking } from "../../../domain/appointment/blocking";
import type {
  CustomerWithVehicles,
  Outcome,
  Repository,
  ShiftExceptionRecord,
  Stores,
} from "../../../application/ports";
import {
  byId,
  byStartThenId,
  byTechnicianThenDate,
  matchesSearch,
  nameLower,
  touchesRange,
} from "../shared";
import {
  SchedulerDb,
  type CustomerRow,
  type TechnicianRow,
} from "./scheduler-db";

/** Thrown inside a transaction to roll it back when the work returns a failure. */
class Rollback {
  constructor(readonly outcome: Outcome<unknown, unknown>) {}
}

function toCustomer(row: CustomerRow): Customer {
  const customer: Partial<CustomerRow> = { ...row };
  delete customer.nameLower;
  return customer as Customer;
}

function toTechnicianRow(technician: Technician): TechnicianRow {
  const row: Partial<Technician> = { ...technician };
  delete row.shiftExceptions;
  return row as TechnicianRow;
}

function buildStores(db: SchedulerDb): Stores {
  const customerWithVehicles = async (
    row: CustomerRow,
  ): Promise<CustomerWithVehicles> => ({
    ...toCustomer(row),
    vehicles: byId(
      await db.vehicles.where("customerId").equals(row.id).toArray(),
    ),
  });
  const touching = async (dealershipId: string, from: number, to: number) => {
    const rows = await db.appointments
      .where("[dealershipId+start]")
      .between([dealershipId, Dexie.minKey], [dealershipId, to], true, false)
      .toArray();
    return byStartThenId(rows.filter((a) => touchesRange(a, from, to)));
  };
  const exceptionsOf = (technicianId: string, from: string, to: string) =>
    db.shiftExceptions
      .where("[technicianId+date]")
      .between([technicianId, from], [technicianId, to], true, true)
      .toArray();

  return {
    scheduling: {
      getDealership: (id) => db.dealerships.get(id),
      listTechnicians: async (dealershipId) => {
        const rows = await db.technicians
          .where("dealershipId")
          .equals(dealershipId)
          .toArray();
        const technicians: Technician[] = [];
        for (const row of rows) {
          const records = await exceptionsOf(row.id, "", "￿");
          technicians.push({
            ...row,
            shiftExceptions: Object.fromEntries(
              records.map((r) => [r.date, r.exception]),
            ),
          });
        }
        return byId(technicians);
      },
      listShiftExceptions: async (dealershipId, fromDate, toDate) => {
        const rows = await db.technicians
          .where("dealershipId")
          .equals(dealershipId)
          .toArray();
        const records: ShiftExceptionRecord[] = [];
        for (const row of rows) {
          records.push(...(await exceptionsOf(row.id, fromDate, toDate)));
        }
        return byTechnicianThenDate(records);
      },
      listServiceBays: (id) =>
        db.serviceBays.where("dealershipId").equals(id).toArray().then(byId),
      listCourtesyCars: (id) =>
        db.courtesyCars.where("dealershipId").equals(id).toArray().then(byId),
      getServiceType: (id) => db.serviceTypes.get(id),
      listBlockingAppointments: async (dealershipId, from, to) =>
        (await touching(dealershipId, from, to)).filter(isBlocking),
    },
    appointments: {
      get: (id) => db.appointments.get(id),
      insert: async (appointment) => {
        await db.appointments.add(appointment);
      },
      update: async (appointment) => {
        if ((await db.appointments.get(appointment.id)) === undefined) {
          throw new Error(`Appointment ${appointment.id} is not stored`);
        }
        await db.appointments.put(appointment);
      },
      listByDealershipDay: touching,
      listByCustomer: (customerId) =>
        db.appointments
          .where("customerId")
          .equals(customerId)
          .toArray()
          .then(byStartThenId),
    },
    customers: {
      search: async (text) => {
        const found: CustomerWithVehicles[] = [];
        for (const row of await db.customers.toArray()) {
          const customer = await customerWithVehicles(row);
          if (matchesSearch(text, customer, customer.vehicles)) {
            found.push(customer);
          }
        }
        return byId(found);
      },
      get: async (id) => {
        const row = await db.customers.get(id);
        return row && customerWithVehicles(row);
      },
      insert: async (customer, vehicle) => {
        await db.customers.add({
          ...customer,
          nameLower: nameLower(customer.name),
        });
        await db.vehicles.add(vehicle);
      },
      insertVehicle: async (vehicle) => {
        await db.vehicles.add(vehicle);
      },
      findDuplicates: async (phone, registration) => {
        const byPhone = await db.customers
          .where("phone")
          .equals(phone)
          .toArray();
        const byVehicle = await db.vehicles
          .where("registration")
          .equals(registration)
          .toArray();
        const rows = new Map(byPhone.map((row) => [row.id, row]));
        for (const vehicle of byVehicle) {
          const owner = await db.customers.get(vehicle.customerId);
          if (owner) rows.set(owner.id, owner);
        }
        const found: CustomerWithVehicles[] = [];
        for (const row of rows.values()) {
          found.push(await customerWithVehicles(row));
        }
        return byId(found);
      },
    },
    settings: {
      saveDealershipSettings: async (id, settings) => {
        const changed = await db.dealerships.update(id, settings);
        if (changed === 0) throw new Error(`Dealership ${id} is not stored`);
      },
      saveTechnicianShifts: async (id, shiftPattern, shiftExceptions) => {
        const changed = await db.technicians.update(id, { shiftPattern });
        if (changed === 0) throw new Error(`Technician ${id} is not stored`);
        await db.shiftExceptions.where("technicianId").equals(id).delete();
        await db.shiftExceptions.bulkAdd(
          Object.entries(shiftExceptions).map(([date, exception]) => ({
            technicianId: id,
            date,
            exception,
          })),
        );
      },
    },
    idempotency: {
      get: (actorId, key) => db.idempotency.get([actorId, key]),
      put: async (record) => {
        await db.idempotency.put(record);
      },
    },
    outbox: {
      add: async (messages) => {
        for (const message of messages) {
          const known = await db.outbox
            .where("dedupeKey")
            .equals(message.dedupeKey)
            .count();
          if (known === 0) await db.outbox.add(message);
        }
      },
      cancelPending: async (appointmentId) => {
        await db.outbox
          .where("appointmentId")
          .equals(appointmentId)
          .filter((m) => m.status === "pending")
          .modify({ status: "cancelled" });
      },
      list: (filter = {}) =>
        db.outbox
          .filter(
            (m) =>
              (filter.appointmentId === undefined ||
                m.appointmentId === filter.appointmentId) &&
              (filter.status === undefined || m.status === filter.status),
          )
          .toArray(),
    },
  };
}

export type DexieRepository = Repository & {
  /** Closes the connection. The data stays in the browser. */
  close(): void;
};

/** Opens (or creates) the IndexedDB database with this name. */
export function createDexieRepository(databaseName: string): DexieRepository {
  const db = new SchedulerDb(databaseName);
  const stores = buildStores(db);

  return {
    close: () => db.close(),
    read: (work) =>
      db.transaction("r", db.tables, async () => await work(stores)),
    write: async (work) => {
      try {
        return await db.transaction("rw", db.tables, async () => {
          const outcome = await work(stores);
          if (!outcome.ok) throw new Rollback(outcome);
          return outcome;
        });
      } catch (error) {
        if (error instanceof Rollback) return error.outcome as never;
        throw error;
      }
    },
    getSeedVersion: async () => (await db.meta.get("seedVersion"))?.value,
    listDemoUsers: () => db.demoUsers.toArray().then(byId),
    replaceAll: (seed, seedVersion) =>
      db.transaction("rw", db.tables, async () => {
        for (const table of db.tables) await table.clear();
        await db.dealerships.bulkAdd(seed.dealerships);
        await db.technicians.bulkAdd(seed.technicians.map(toTechnicianRow));
        await db.shiftExceptions.bulkAdd(
          seed.technicians.flatMap((t) =>
            Object.entries(t.shiftExceptions).map(([date, exception]) => ({
              technicianId: t.id,
              date,
              exception,
            })),
          ),
        );
        await db.serviceBays.bulkAdd(seed.serviceBays);
        await db.courtesyCars.bulkAdd(seed.courtesyCars);
        await db.serviceTypes.bulkAdd(seed.serviceTypes);
        await db.customers.bulkAdd(
          seed.customers.map((c) => ({ ...c, nameLower: nameLower(c.name) })),
        );
        await db.vehicles.bulkAdd(seed.vehicles);
        await db.appointments.bulkAdd(seed.appointments);
        await db.demoUsers.bulkAdd(seed.demoUsers);
        await db.meta.put({ key: "seedVersion", value: seedVersion });
      }),
  };
}
