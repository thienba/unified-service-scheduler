// The domain's own words, taken from the brief (D-0000-14). Plain data only.
// Later tickets add to these types and never rename them.

/** A calendar date in the dealership's zone, written `YYYY-MM-DD`. */
export type LocalDate = string;
/** A clock time in the dealership's zone, written `HH:mm`. */
export type LocalTime = string;
/** An IANA time zone name, for example `Europe/London` (D-0001-10). */
export type TimeZone = string;
/** Milliseconds since 1970-01-01T00:00:00Z. */
export type EpochMs = number;
/** 1 is Monday and 7 is Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
/** What a technician can do and what a service type needs (Q-0001-1). */
export type Skill = string;

/** One open stretch of a local day. */
export interface OpeningHours {
  open: LocalTime;
  close: LocalTime;
}

/** A date override either closes the day or gives the day's own hours. */
export type OpeningOverride = "closed" | OpeningHours;

export interface Policies {
  leadTimeMinutes: number;
  horizonDays: number;
  /** The rest a technician gets after each job (Q-0001-19). */
  breakMinutes: number;
  /** Appointments start on this grid (Q-0001-11). */
  gridMinutes: number;
}

export interface Dealership {
  id: string;
  name: string;
  timeZone: TimeZone;
  weeklyHours: Partial<Record<Weekday, OpeningHours>>;
  dateOverrides: Record<LocalDate, OpeningOverride>;
  policies: Policies;
}

export interface ServiceBay {
  id: string;
  dealershipId: string;
  name: string;
  active: boolean;
}

/** One working day of a technician, with an optional rest inside it (Q-0001-10). */
export interface Shift {
  start: LocalTime;
  end: LocalTime;
  breakStart?: LocalTime;
  breakEnd?: LocalTime;
}

/** A date-specific change to the weekly pattern. */
export type ShiftException =
  { kind: "leave" } | { kind: "changed"; shift: Shift };

export interface Technician {
  id: string;
  dealershipId: string;
  name: string;
  active: boolean;
  skills: Skill[];
  shiftPattern: Partial<Record<Weekday, Shift>>;
  shiftExceptions: Record<LocalDate, ShiftException>;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
}

export interface Vehicle {
  id: string;
  customerId: string;
  registration: string;
  make: string;
  model: string;
}

export interface ServiceType {
  id: string;
  name: string;
  /** Fixed per service type (Q-0001-2). */
  durationMinutes: number;
  requiredSkill: Skill;
}

export interface CourtesyCar {
  id: string;
  dealershipId: string;
  name: string;
  active: boolean;
}

export type AppointmentStatus = "confirmed" | "cancelled";
export type Transport = "wait" | "drop_off" | "courtesy_car";
export type AppointmentFlagKind = "outside_opening_hours" | "outside_shift";

export interface AppointmentFlag {
  kind: AppointmentFlagKind;
  /** When the flag was raised. */
  since: EpochMs;
}

/** The interval is half-open: `[start, end)` (AD-1). */
export interface Appointment {
  id: string;
  dealershipId: string;
  timeZone: TimeZone;
  customerId: string;
  vehicleId: string;
  serviceTypeId: string;
  technicianId: string;
  serviceBayId: string;
  courtesyCarId: string | null;
  transport: Transport;
  start: EpochMs;
  end: EpochMs;
  status: AppointmentStatus;
  flags: AppointmentFlag[];
  version: number;
  createdAt: EpochMs;
  updatedAt: EpochMs;
  cancelledAt: EpochMs | null;
}
