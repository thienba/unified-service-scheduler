// The calls of the staff booking screens, through the typed client only (AD-2). The search text travels in a
// request body, never in an address (D-0000-28, SEC-10.AC-5).
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { call, type Dealership } from "../../data/api-problem";
import { localDateIn } from "../../format/format";
import { useSession } from "../../session/session";
import type { FoundCustomer } from "./staff-memory";

/** Customers whose name, phone or plate holds the text: from 3 characters, at most 10 (D-0000-26). */
export function useCustomerSearch(text: string) {
  const { client } = useSession();
  return useQuery({
    queryKey: ["customer-search", text],
    queryFn: () => call(client.POST("/customers/search", { body: { text } })),
    enabled: text.length >= 3,
  });
}

/** Exact matches for the duplicate hint (D-0001-30 B). */
export function useFindDuplicates() {
  const { client } = useSession();
  return (body: { phone: string } | { registration: string }) =>
    call(client.POST("/customers/search", { body }));
}

/** The free gap that started the booking (D-0001-20 B): who, and until when, from the day's schedule. */
export interface Gap {
  start: string;
  technicianId: string;
  technicianName: string;
  /** The end of the free window that holds the start, when the schedule still shows one. */
  end: string | null;
}

const isInstant = (value: string | null): value is string =>
  value !== null &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?Z$/.test(value) &&
  !Number.isNaN(Date.parse(value));

/**
 * `start` and `technicianId` from the address, looked up in what the API returns (SEC-12): an unknown
 * technician or a start that is not a time is left out, as if the booking had not come from a gap.
 */
export function useGapFromAddress(dealership: Dealership | undefined): {
  loading: boolean;
  gap: Gap | null;
  /** A start time from the address that is a real instant (kept even with "Any technician"). */
  start: string | null;
  failure: unknown;
  retry: () => void;
} {
  const { client } = useSession();
  const [params] = useSearchParams();
  const rawStart = params.get("start");
  const start = isInstant(rawStart) ? rawStart : null;
  const technicianId = params.get("technicianId");
  const date =
    start && dealership ? localDateIn(start, dealership.timeZone) : null;
  const day = useQuery({
    queryKey: ["schedule", dealership?.id, date],
    queryFn: () =>
      call(
        client.GET("/dealerships/{dealershipId}/schedule", {
          params: {
            path: { dealershipId: dealership!.id },
            query: { date: date! },
          },
        }),
      ),
    enabled: Boolean(dealership && date && technicianId),
  });
  if (!start || !technicianId || !dealership) {
    return {
      loading: false,
      gap: null,
      start,
      failure: null,
      retry: () => {},
    };
  }
  const technician = day.data?.technicians.find((t) => t.id === technicianId);
  const at = Date.parse(start);
  const window = technician?.free.find(
    (w) => Date.parse(w.start) <= at && at < Date.parse(w.end),
  );
  return {
    loading: day.isPending,
    gap: technician
      ? {
          start,
          technicianId,
          technicianName: technician.name,
          end: window?.end ?? null,
        }
      : null,
    start,
    failure: day.error,
    retry: () => void day.refetch(),
  };
}

/** The customer of `customerId`, when the page was opened from its address (a reload) and not from the search. */
export function useCustomerById(
  customerId: string | null,
  vehicleId: string | null,
  known: FoundCustomer | null,
) {
  const { client } = useSession();
  return useQuery({
    queryKey: ["customer-by-id", customerId, vehicleId],
    queryFn: async (): Promise<FoundCustomer | null> => {
      // There is no "get one customer" call: the vehicle's plate finds its owner through the search.
      const vehicles = await call(
        client.GET("/customers/{customerId}/vehicles", {
          params: { path: { customerId: customerId! } },
        }),
      );
      const vehicle =
        vehicles.find((v) => v.id === vehicleId) ?? vehicles[0] ?? null;
      if (!vehicle) return null;
      const found = await call(
        client.POST("/customers/search", {
          body: { registration: vehicle.registration },
        }),
      );
      return found.find((c) => c.id === customerId) ?? null;
    },
    enabled: Boolean(customerId) && known?.id !== customerId,
  });
}
