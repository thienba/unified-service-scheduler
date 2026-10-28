// The IndexedDB tables and indexes of architecture.md section 7.2. Dexie is imported only here (AD-8).
import Dexie, { type EntityTable, type Table } from "dexie";
import type {
  Appointment,
  CourtesyCar,
  Customer,
  Dealership,
  DemoUser,
  ServiceBay,
  ServiceType,
  Technician,
  Vehicle,
} from "../../../domain/model";
import type {
  IdempotencyRecord,
  OutboxMessage,
  ShiftExceptionRecord,
} from "../../../application/ports";

/** A customer row also holds the lower-case name, for the name index. */
export type CustomerRow = Customer & { nameLower: string };
/** The shift exceptions live in their own table, so a technician row keeps none. */
export type TechnicianRow = Omit<Technician, "shiftExceptions">;
export interface MetaRow {
  key: string;
  value: number;
}

export class SchedulerDb extends Dexie {
  dealerships!: EntityTable<Dealership, "id">;
  technicians!: EntityTable<TechnicianRow, "id">;
  shiftExceptions!: Table<ShiftExceptionRecord, [string, string]>;
  serviceBays!: EntityTable<ServiceBay, "id">;
  courtesyCars!: EntityTable<CourtesyCar, "id">;
  serviceTypes!: EntityTable<ServiceType, "id">;
  customers!: EntityTable<CustomerRow, "id">;
  vehicles!: EntityTable<Vehicle, "id">;
  appointments!: EntityTable<Appointment, "id">;
  idempotency!: Table<IdempotencyRecord, [string, string]>;
  outbox!: EntityTable<OutboxMessage, "id">;
  demoUsers!: EntityTable<DemoUser, "id">;
  meta!: EntityTable<MetaRow, "key">;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      dealerships: "id",
      technicians: "id, dealershipId",
      shiftExceptions: "[technicianId+date], technicianId",
      serviceBays: "id, dealershipId",
      courtesyCars: "id, dealershipId",
      serviceTypes: "id",
      customers: "id, phone, nameLower",
      vehicles: "id, customerId, registration",
      appointments:
        "id, [dealershipId+start], customerId, technicianId, serviceBayId",
      idempotency: "[actorId+key]",
      outbox: "id, appointmentId, &dedupeKey",
      demoUsers: "id",
      meta: "key",
    });
  }
}
