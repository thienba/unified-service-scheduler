// The store interfaces of architecture.md section 7.2. Plain data only: no Dexie, no browser types.
import type {
  Appointment,
  Customer,
  CourtesyCar,
  Dealership,
  DemoUser,
  EpochMs,
  LocalDate,
  SeedData,
  ServiceBay,
  ServiceType,
  Shift,
  ShiftException,
  Technician,
  Vehicle,
  Weekday,
} from "../../domain/model";

export type CustomerWithVehicles = Customer & { vehicles: Vehicle[] };

export interface ShiftExceptionRecord {
  technicianId: string;
  date: LocalDate;
  exception: ShiftException;
}

export type DealershipSettings = Pick<
  Dealership,
  "weeklyHours" | "dateOverrides" | "policies"
>;

// Order of every list a store returns, the same for all stores (AD-8): appointments by `start`,
// then `id`; shift exceptions by technician id, then date; everything else by `id`.

export interface SchedulingReader {
  getDealership(id: string): Promise<Dealership | undefined>;
  listDealerships(): Promise<Dealership[]>;
  listServiceTypes(): Promise<ServiceType[]>;
  listTechnicians(dealershipId: string): Promise<Technician[]>;
  /** Both dates are included. */
  listShiftExceptions(
    dealershipId: string,
    fromDate: LocalDate,
    toDate: LocalDate,
  ): Promise<ShiftExceptionRecord[]>;
  listServiceBays(dealershipId: string): Promise<ServiceBay[]>;
  listCourtesyCars(dealershipId: string): Promise<CourtesyCar[]>;
  getServiceType(id: string): Promise<ServiceType | undefined>;
  /** Appointments that hold their resources and touch `[from, to)` (AD-1). */
  listBlockingAppointments(
    dealershipId: string,
    from: EpochMs,
    to: EpochMs,
  ): Promise<Appointment[]>;
  /** Appointments that hold their resources and touch `[from, to)`, of one vehicle at any dealership (D-0001-146). */
  listBlockingByVehicle(
    vehicleId: string,
    from: EpochMs,
    to: EpochMs,
  ): Promise<Appointment[]>;
}

export interface AppointmentStore {
  get(id: string): Promise<Appointment | undefined>;
  /** Fails when the id is already stored. */
  insert(appointment: Appointment): Promise<void>;
  /** Fails when the id is not stored. */
  update(appointment: Appointment): Promise<void>;
  /** Every status; the appointments of the dealership that touch `[from, to)`. */
  listByDealershipDay(
    dealershipId: string,
    from: EpochMs,
    to: EpochMs,
  ): Promise<Appointment[]>;
  listByCustomer(customerId: string): Promise<Appointment[]>;
}

export interface CustomerStore {
  /** Part of the name (any case), part of the phone, or part of a registration. */
  search(text: string): Promise<CustomerWithVehicles[]>;
  get(id: string): Promise<CustomerWithVehicles | undefined>;
  /** Fails when the customer id or the vehicle id is already stored. */
  insert(customer: Customer, vehicle: Vehicle): Promise<void>;
  /** Adds a vehicle to a stored customer. Fails when the vehicle id is already stored. */
  insertVehicle(vehicle: Vehicle): Promise<void>;
  /** Customers with this phone (digits only), or with a vehicle with this registration (letters and numbers, in capitals). */
  findDuplicates(
    phone: string,
    registration: string,
  ): Promise<CustomerWithVehicles[]>;
}

export interface SettingsStore {
  saveDealershipSettings(
    dealershipId: string,
    settings: DealershipSettings,
  ): Promise<void>;
  saveTechnicianShifts(
    technicianId: string,
    shiftPattern: Partial<Record<Weekday, Shift>>,
    shiftExceptions: Record<LocalDate, ShiftException>,
  ): Promise<void>;
}

/** Kept for the idempotency window. Ids and a hash only, never contact details (SEC-10). */
export interface IdempotencyRecord {
  actorId: string;
  key: string;
  requestHash: string;
  response: unknown;
  createdAt: EpochMs;
}

export interface IdempotencyStore {
  get(actorId: string, key: string): Promise<IdempotencyRecord | undefined>;
  put(record: IdempotencyRecord): Promise<void>;
}

export type OutboxStatus = "pending" | "sent" | "cancelled";

/** Holds ids, not contact details (AD-13). */
export interface OutboxMessage {
  id: string;
  appointmentId: string;
  kind: string;
  /** `appointmentId:kind:version` */
  dedupeKey: string;
  dueAt: EpochMs;
  /** When the message was made, and the start of the appointment then (D-0001-79). */
  createdAt: EpochMs;
  forStart: EpochMs;
  status: OutboxStatus;
}

export interface OutboxStore {
  /** A message whose `dedupeKey` is already stored is skipped; a new message with a stored id fails. */
  add(messages: OutboxMessage[]): Promise<void>;
  /**
   * Marks the pending messages of the appointment cancelled. Sent ones stay as they are. With
   * `kinds`, only pending messages of those kinds are cancelled (D-0001-50).
   */
  cancelPending(appointmentId: string, kinds?: string[]): Promise<void>;
  list(filter?: {
    appointmentId?: string;
    status?: OutboxStatus;
  }): Promise<OutboxMessage[]>;
}

/** What the seed loader needs from a store (AD-17). */
export interface SeedTarget {
  getSeedVersion(): Promise<number | undefined>;
  /** Removes everything stored and writes the seed and its version, all or nothing. */
  replaceAll(data: SeedData, seedVersion: number): Promise<void>;
  listDemoUsers(): Promise<DemoUser[]>;
}
