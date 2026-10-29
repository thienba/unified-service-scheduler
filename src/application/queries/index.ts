export { viewAppointments, type AppointmentView } from "./appointmentView";
export {
  checkAvailability,
  searchAvailability,
  type CheckAnswer,
  type CheckQuery,
  type CheckQueryResult,
  type DayRequest,
  type DayResult,
} from "./availability";
export {
  getAppointment,
  getSchedule,
  listMyAppointments,
  type AppointmentResult,
  type AppointmentsResult,
  type ScheduleRequest,
} from "./appointments";
export {
  listVehicles,
  searchCustomers,
  type CustomerSearch,
  type CustomerSearchResult,
  type VehiclesResult,
} from "./customers";
export {
  getDealership,
  listDealerships,
  listServiceBays,
  listServiceTypes,
  listTechnicians,
  type BaysResult,
  type TechnicianView,
  type TechniciansResult,
} from "./dealerships";
export { listOutbox, type OutboxEntry, type OutboxResult } from "./outbox";
export type { QueryDeps, QueryFailure } from "./shared";
