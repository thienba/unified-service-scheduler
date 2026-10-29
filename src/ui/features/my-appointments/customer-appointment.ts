// What the customer's own appointment screens share (customer.md section 6, REQ-BOOK-012): the change
// window, the date line, the words for the car, and the cancel call. Plain functions where they can be.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { components } from "../../../api/contract/schema";
import { call, type Dealership } from "../../data/api-problem";
import { formatDay, formatDuration, localDateIn } from "../../format/format";
import { useSession } from "../../session/session";

export type Appointment = components["schemas"]["Appointment"];
export type Transport = components["schemas"]["Transport"];

/** What the customer reads about their car (customer.md 6, "The car"). */
export const carWords: Record<Transport, string> = {
  wait: "You will wait on site",
  drop_off: "You will drop it off",
  courtesy_car: "You will borrow a courtesy car",
};

export function isCancelled(a: Appointment): boolean {
  return a.cancelledAt !== null;
}

/** Confirmed, cancelled, or past: "past" is worked out here, it is not stored (P3). */
export function customerStatus(
  a: Appointment,
  now: number,
): "confirmed" | "cancelled" | "past" {
  if (isCancelled(a)) return "cancelled";
  return Date.parse(a.end) <= now ? "past" : "confirmed";
}

/** The last moment the customer may cancel or move it online: the start less the lead time, included (D-0001-22 a). */
export function cutoffOf(a: Appointment, dealership: Dealership): number {
  return Date.parse(a.start) - dealership.policies.leadTimeMinutes * 60_000;
}

/** True while a confirmed appointment can still be changed online (REQ-BOOK-012.AC-4). */
export function mayChangeOnline(
  a: Appointment,
  dealership: Dealership,
  now: number,
): boolean {
  return (
    customerStatus(a, now) === "confirmed" && now <= cutoffOf(a, dealership)
  );
}

/** "2 hours": the dealership's lead time, written from the data. */
export function leadWords(dealership: Dealership): string {
  return formatDuration(dealership.policies.leadTimeMinutes);
}

/** "Today, Wed 28 Oct" or "Fri 30 Oct". */
export function dateLine(instant: string, zone: string, now: number): string {
  const day = formatDay(instant, zone, now);
  return localDateIn(instant, zone) === localDateIn(now, zone)
    ? `Today, ${day}`
    : day;
}

/** The customer's own appointments, cancelled and past ones too (GET /appointments with no date). */
export function useMyAppointments() {
  const { client, me } = useSession();
  return useQuery({
    queryKey: ["my-appointments", me?.userId],
    queryFn: () =>
      call(
        client.GET("/appointments", {
          params: { query: { includeCancelled: true, includePast: true } },
        }),
      ),
  });
}

/** POST /appointments/{id}/cancel. A second cancel answers the same cancelled appointment (200). */
export function useCancelAppointment() {
  const { client } = useSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (appointmentId: string) =>
      call(
        client.POST("/appointments/{appointmentId}/cancel", {
          params: { path: { appointmentId } },
        }),
      ),
    onSuccess: (appointment) => {
      queryClient.setQueryData(["appointment", appointment.id], appointment);
      void queryClient.invalidateQueries({ queryKey: ["my-appointments"] });
      void queryClient.invalidateQueries({ queryKey: ["availability"] });
    },
  });
}
