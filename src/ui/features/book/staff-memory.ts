// What staff typed and picked while booking for a customer: the search text, the picked customer and vehicle,
// and a new customer's details. It lives in screen memory only (staff.md 4.2, SEC-10.AC-4, SEC-13.AC-2): never
// in the address and never in browser storage. It lasts from the search page to the booking page and back, and
// it is emptied with the query cache, which the role switch empties, so it is gone after a switch.
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";
import type { components } from "../../../api/contract/schema";

export type FoundCustomer = components["schemas"]["CustomerWithVehicles"];

export interface CustomerValues {
  name: string;
  phone: string;
  email: string;
}

export interface VehicleValues {
  registration: string;
  make: string;
  model: string;
  year: string;
}

export const emptyCustomer: CustomerValues = { name: "", phone: "", email: "" };
export const emptyVehicle: VehicleValues = {
  registration: "",
  make: "",
  model: "",
  year: "",
};

/** The vehicle choice under a picked customer: one of theirs, or a new one (D-0001-29 B, D-0001-61 A). */
export const ADD_VEHICLE = "new";

export interface StaffMemory {
  /** Which half of `book-customer` shows. */
  mode: "search" | "form";
  text: string;
  picked: FoundCustomer | null;
  /** A vehicle id, `ADD_VEHICLE`, or null. */
  vehicleChoice: string | null;
  /** The vehicle typed for the picked customer. */
  addedVehicle: VehicleValues;
  /** The new-customer form, as typed. */
  customer: CustomerValues;
  vehicle: VehicleValues;
  /** Set when the new-customer form passed its checks and Continue was pressed. */
  newCustomerReady: boolean;
}

export const emptyMemory: StaffMemory = {
  mode: "search",
  text: "",
  picked: null,
  vehicleChoice: null,
  addedVehicle: emptyVehicle,
  customer: emptyCustomer,
  vehicle: emptyVehicle,
  newCustomerReady: false,
};

const key = ["staff-booking", "memory"] as const;

// The values themselves are kept here, so a change shows in the same render (a controlled radio stays chosen).
let memory: StaffMemory = emptyMemory;
const listeners = new Set<() => void>();
function store(next: StaffMemory) {
  memory = next;
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// A marker in the query cache: when the cache is emptied (the role switch), the memory is emptied with it.
const watched = new WeakSet<QueryClient>();
function watch(queryClient: QueryClient) {
  if (watched.has(queryClient)) return;
  watched.add(queryClient);
  memory = emptyMemory;
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type === "removed" && event.query.queryKey[0] === key[0])
      store(emptyMemory);
  });
}

export function useStaffMemory(): [
  StaffMemory,
  (change: Partial<StaffMemory>) => void,
  () => void,
] {
  const queryClient = useQueryClient();
  watch(queryClient);
  useQuery({
    queryKey: key,
    queryFn: () => true,
    initialData: true,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const data = useSyncExternalStore(
    subscribe,
    () => memory,
    () => memory,
  );
  const update = useCallback(
    (change: Partial<StaffMemory>) => store({ ...memory, ...change }),
    [],
  );
  const forget = useCallback(() => store(emptyMemory), []);
  return [data, update, forget];
}

/** "Phone ending 0123": phone numbers are shown as their last four digits only (staff.md 6). */
export function phoneEnding(phone: string): string {
  return `Phone ending ${phone.replace(/\D/g, "").slice(-4)}`;
}

/** "Ford Focus AB12 CDE, Nissan Micra MK07 XYZ", or "No vehicle on file". */
export function vehiclesLine(customer: FoundCustomer): string {
  return customer.vehicles.length === 0
    ? "No vehicle on file"
    : customer.vehicles
        .map((v) => `${v.make} ${v.model} ${v.registration}`)
        .join(", ");
}
