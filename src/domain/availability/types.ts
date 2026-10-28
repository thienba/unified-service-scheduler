import type {
  Appointment,
  CourtesyCar,
  Dealership,
  EpochMs,
  LocalDate,
  ServiceBay,
  ServiceType,
  Technician,
  Transport,
} from "../model";

/**
 * The plain data one check needs (architecture.md section 7.4). The application layer builds it
 * from storage in one unit; the domain only reads it.
 */
export interface SchedulingSnapshot {
  dealership: Dealership;
  serviceType: ServiceType;
  technicians: readonly Technician[];
  bays: readonly ServiceBay[];
  courtesyCars: readonly CourtesyCar[];
  /** The appointments around the dates asked about. Cancelled ones are ignored. */
  appointments: readonly Appointment[];
}

export type UnavailableReason =
  | "TECHNICIAN_BUSY"
  | "NO_QUALIFIED_TECHNICIAN_ON_SHIFT"
  | "BAY_BUSY"
  | "COURTESY_CAR_BUSY"
  | "OUTSIDE_OPENING_HOURS"
  | "DEALERSHIP_CLOSED"
  | "TOO_SOON"
  | "BEYOND_HORIZON";

/** What the caller may ask for besides a time. */
export interface ResourceRequest {
  transport: Transport;
  /** Only this technician may be chosen (manager reassign, Q-0001-7 A). */
  technicianId?: string;
  /** Only this bay may be chosen. */
  serviceBayId?: string;
  /** An appointment to leave out of the check, for reschedule and adjust. */
  excludeAppointmentId?: string;
}

export interface CheckRequest extends ResourceRequest {
  start: EpochMs;
}

export interface DayRequest extends ResourceRequest {
  date: LocalDate;
}

export interface Resources {
  technicianId: string;
  serviceBayId: string;
  courtesyCarId: string | null;
}

export type CheckResult =
  | ({ available: true } & Resources)
  | { available: false; reasons: UnavailableReason[] };

export interface SuggestOptions {
  /** How many times to return (D-0001-16). */
  count?: number;
  /** How many days either side of the wanted time to look (D-0001-16). */
  windowDays?: number;
}
