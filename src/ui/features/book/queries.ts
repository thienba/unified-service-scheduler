// The calls the booking screens make, through the typed client only (AD-2).
import { useQueries, useQuery } from "@tanstack/react-query";
import type { components } from "../../../api/contract/schema";
import { call } from "../../data/api-problem";
import { useSession } from "../../session/session";

export type ServiceType = components["schemas"]["ServiceType"];
export type Vehicle = components["schemas"]["Vehicle"];
export type Appointment = components["schemas"]["Appointment"];
export type Transport = components["schemas"]["Transport"];
export type BookingRequest = components["schemas"]["BookingRequest"];

export function useServiceTypes() {
  const { client, status } = useSession();
  return useQuery({
    queryKey: ["service-types"],
    queryFn: () => call(client.GET("/service-types")),
    enabled: status === "ready",
  });
}

export function useVehicles(customerId: string | null | undefined) {
  const { client } = useSession();
  return useQuery({
    queryKey: ["vehicles", customerId],
    queryFn: () =>
      call(
        client.GET("/customers/{customerId}/vehicles", {
          params: { path: { customerId: customerId! } },
        }),
      ),
    enabled: Boolean(customerId),
  });
}

export const availabilityKey = (
  dealershipId: string,
  serviceTypeId: string,
  date: string,
  transport: Transport,
  technicianId?: string,
  appointmentId?: string,
) =>
  [
    "availability",
    dealershipId,
    serviceTypeId,
    date,
    transport,
    technicianId ?? null,
    appointmentId ?? null,
  ] as const;

/** The free start times of each date: one call per date (customer.md, "for the architect"). With a
 * technician, only that technician's times (staff from a free gap, D-0001-31 A). With an appointment, that
 * appointment is left out of the search, for the person moving it (D-0001-101). */
export function useWeekAvailability(
  dealershipId: string | undefined,
  serviceTypeId: string | undefined,
  dates: readonly string[],
  transport: Transport,
  technicianId?: string,
  appointmentId?: string,
) {
  const { client } = useSession();
  return useQueries({
    queries: dates.map((date) => ({
      queryKey: availabilityKey(
        dealershipId ?? "",
        serviceTypeId ?? "",
        date,
        transport,
        technicianId,
        appointmentId,
      ),
      queryFn: () =>
        call(
          client.GET("/dealerships/{dealershipId}/availability", {
            params: {
              path: { dealershipId: dealershipId! },
              query: {
                serviceTypeId: serviceTypeId!,
                date,
                transport,
                ...(technicianId ? { technicianId } : {}),
                ...(appointmentId ? { appointmentId } : {}),
              },
            },
          }),
        ),
      enabled: Boolean(dealershipId && serviceTypeId),
    })),
  });
}

export function useAppointment(appointmentId: string) {
  const { client } = useSession();
  return useQuery({
    queryKey: ["appointment", appointmentId],
    queryFn: () =>
      call(
        client.GET("/appointments/{appointmentId}", {
          params: { path: { appointmentId } },
        }),
      ),
  });
}
