// An appointment as a screen shows it: the stored fields, the one-line reason of each flag (D-0001-34)
// and a `display` block with the names a screen needs.
import type { Actor } from "../actor";
import { flagReason } from "../../domain/appointment/flag-reason";
import type { Appointment, Technician } from "../../domain/model";
import type { ReadStores } from "../ports";
import type { QueryDeps } from "./shared";

export interface AppointmentDisplay {
  serviceTypeName: string;
  vehicle: { registration: string; make: string; model: string };
  /** The technician's name: the owner of the appointment sees it too (D-0001-71). */
  technicianName?: string;
  /** Only staff and managers see the bay and the customer's name. */
  serviceBayName?: string;
  customerName?: string;
  /** The courtesy car's name, when the appointment has one (REQ-BOOK-010.AC-2). */
  courtesyCarName?: string;
}

export interface AppointmentView {
  appointment: Appointment;
  /** One line for each flag, in the order of `appointment.flags`. */
  flagReasons: string[];
  display: AppointmentDisplay;
}

async function build(
  actor: Actor,
  stores: ReadStores,
  appointments: readonly Appointment[],
): Promise<AppointmentView[]> {
  const technicians = new Map<string, Technician[]>();
  const technicianList = async (dealershipId: string) => {
    if (!technicians.has(dealershipId)) {
      technicians.set(
        dealershipId,
        await stores.scheduling.listTechnicians(dealershipId),
      );
    }
    return technicians.get(dealershipId)!;
  };
  // One read of a dealership's cars and bays, not one per appointment: a busy day has many.
  const once = <T>(load: (dealershipId: string) => Promise<T>) => {
    const seen = new Map<string, Promise<T>>();
    return (dealershipId: string) => {
      if (!seen.has(dealershipId)) seen.set(dealershipId, load(dealershipId));
      return seen.get(dealershipId)!;
    };
  };
  const carList = once((id) => stores.scheduling.listCourtesyCars(id));
  const bayList = once((id) => stores.scheduling.listServiceBays(id));
  const views: AppointmentView[] = [];
  for (const appointment of appointments) {
    const serviceType = await stores.scheduling.getServiceType(
      appointment.serviceTypeId,
    );
    const customer = await stores.customers.get(appointment.customerId);
    const vehicle = customer!.vehicles.find(
      (v) => v.id === appointment.vehicleId,
    )!;
    const technician = (await technicianList(appointment.dealershipId)).find(
      (t) => t.id === appointment.technicianId,
    );
    const display: AppointmentDisplay = {
      serviceTypeName: serviceType!.name,
      vehicle: {
        registration: vehicle.registration,
        make: vehicle.make,
        model: vehicle.model,
      },
    };
    if (appointment.courtesyCarId !== null) {
      const car = (await carList(appointment.dealershipId)).find(
        (c) => c.id === appointment.courtesyCarId,
      );
      if (car) display.courtesyCarName = car.name;
    }
    if (technician) display.technicianName = technician.name;
    if (actor.role !== "customer") {
      const bays = await bayList(appointment.dealershipId);
      display.customerName = customer!.name;
      const bay = bays.find((b) => b.id === appointment.serviceBayId);
      if (bay) display.serviceBayName = bay.name;
    }
    const dealership =
      appointment.flags.length > 0
        ? await stores.scheduling.getDealership(appointment.dealershipId)
        : undefined;
    views.push({
      appointment,
      display,
      flagReasons: appointment.flags.map((flag) =>
        flagReason(flag.kind, appointment, dealership!, technician),
      ),
    });
  }
  return views;
}

/** Adds the names and flag reasons to appointments the caller was already allowed to see. */
export function viewAppointments(
  actor: Actor,
  deps: Pick<QueryDeps, "uow">,
  appointments: readonly Appointment[],
): Promise<AppointmentView[]> {
  return deps.uow.read((stores) => build(actor, stores, appointments));
}

/** The same, inside a read unit that is already open. */
export { build as viewAppointmentsIn };
