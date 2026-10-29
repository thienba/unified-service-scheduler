// Who the staff `book` page books for (staff.md 5.4): the customer and vehicle in the address, or the new
// customer, or the new vehicle of the picked customer, which stay in screen memory (D-0001-29 B, Q-0001-23).
import { useSearchParams } from "react-router";
import {
  ADD_VEHICLE,
  useStaffMemory,
  type CustomerValues,
  type VehicleValues,
} from "./staff-memory";
import { useCustomerById } from "./staff-queries";

export interface StaffWho {
  kind: "staff";
  name: string;
  phone: string;
  vehicle: { make: string; model: string; registration: string };
  /** The stored customer, or null for a new one. */
  customerId: string | null;
  /** The stored vehicle, or null for a new one. */
  vehicleId: string | null;
  newCustomer: CustomerValues | null;
  newVehicle: VehicleValues | null;
}

export type WhoAnswer =
  | { state: "loading" }
  | { state: "failed"; error: unknown; retry: () => void }
  | { state: "none" }
  | { state: "ready"; who: StaffWho };

const trimmed = (v: VehicleValues) => ({
  registration: v.registration.trim(),
  make: v.make.trim(),
  model: v.model.trim(),
});

export function useStaffWho(): WhoAnswer {
  const [params] = useSearchParams();
  const [memory] = useStaffMemory();
  const customerId = params.get("customerId");
  const vehicleId = params.get("vehicleId");
  const known =
    memory.picked && memory.picked.id === customerId ? memory.picked : null;
  const lookUp = useCustomerById(customerId, vehicleId, known);

  if (customerId === null) {
    if (!memory.newCustomerReady) return { state: "none" };
    return {
      state: "ready",
      who: {
        kind: "staff",
        name: memory.customer.name.trim(),
        phone: memory.customer.phone,
        vehicle: trimmed(memory.vehicle),
        customerId: null,
        vehicleId: null,
        newCustomer: memory.customer,
        newVehicle: memory.vehicle,
      },
    };
  }
  const customer = known ?? lookUp.data ?? null;
  if (!known) {
    if (lookUp.isPending) return { state: "loading" };
    if (lookUp.isError)
      return {
        state: "failed",
        error: lookUp.error,
        retry: () => void lookUp.refetch(),
      };
  }
  if (!customer) return { state: "none" };
  if (vehicleId === null) {
    // A new vehicle for this customer, typed under their row on the search page.
    if (known === null || memory.vehicleChoice !== ADD_VEHICLE)
      return { state: "none" };
    return {
      state: "ready",
      who: {
        kind: "staff",
        name: customer.name,
        phone: customer.phone,
        vehicle: trimmed(memory.addedVehicle),
        customerId,
        vehicleId: null,
        newCustomer: null,
        newVehicle: memory.addedVehicle,
      },
    };
  }
  const vehicle = customer.vehicles.find((v) => v.id === vehicleId);
  if (!vehicle) return { state: "none" };
  return {
    state: "ready",
    who: {
      kind: "staff",
      name: customer.name,
      phone: customer.phone,
      vehicle,
      customerId,
      vehicleId,
      newCustomer: null,
      newVehicle: null,
    },
  };
}

/** The body parts that say who: an existing customer and vehicle, a new vehicle, or a new customer (contract). */
export function whoBody(who: StaffWho) {
  const vehicle = who.newVehicle && {
    registration: who.newVehicle.registration.trim(),
    make: who.newVehicle.make.trim(),
    model: who.newVehicle.model.trim(),
    ...(who.newVehicle.year.trim()
      ? { year: Number(who.newVehicle.year.trim()) }
      : {}),
  };
  if (who.newCustomer && vehicle) {
    const email = who.newCustomer.email.trim();
    return {
      newCustomer: {
        name: who.newCustomer.name.trim(),
        phone: who.newCustomer.phone.trim(),
        ...(email ? { email } : {}),
      },
      newVehicle: vehicle,
    };
  }
  if (vehicle) return { customerId: who.customerId!, newVehicle: vehicle };
  return { customerId: who.customerId!, vehicleId: who.vehicleId! };
}
