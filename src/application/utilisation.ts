// The gauge `bay_utilisation_ratio` of section 7.7, worked out when it is read: the bay time booked
// inside opening hours, over the bay time on offer.
import type { Clock, UnitOfWork } from "./ports";
import type { GaugeSample } from "./ports/telemetry";
import { openingWindow } from "../domain/policies/opening-window";
import { MINUTE_MS, addDays, localDateOf } from "../domain/time";

/** From today, how many days the gauge covers. */
export const UTILISATION_DAYS = 7;

/** Booked bay minutes over the minutes the bays are open; 0 when there is nothing on offer. */
export function utilisationRatio(
  bayCount: number,
  openMinutes: number,
  bookedMinutes: number,
): number {
  const onOffer = bayCount * openMinutes;
  return onOffer === 0
    ? 0
    : Math.round((bookedMinutes / onOffer) * 1000) / 1000;
}

export async function bayUtilisation(deps: {
  uow: UnitOfWork;
  clock: Clock;
}): Promise<GaugeSample[]> {
  const now = deps.clock.now();
  return deps.uow.read(async ({ scheduling }) => {
    const samples: GaugeSample[] = [];
    for (const dealership of await scheduling.listDealerships()) {
      const bays = await scheduling.listServiceBays(dealership.id);
      const today = localDateOf(now, dealership.timeZone);
      for (let i = 0; i < UTILISATION_DAYS; i++) {
        const date = addDays(today, i);
        const window = openingWindow(dealership, date);
        if (!window) continue;
        const booked = await scheduling.listBlockingAppointments(
          dealership.id,
          window.start,
          window.end,
        );
        const bookedMs = booked.reduce(
          (sum, a) =>
            sum +
            Math.max(
              0,
              Math.min(a.end, window.end) - Math.max(a.start, window.start),
            ),
          0,
        );
        samples.push({
          name: "bay_utilisation_ratio",
          labels: { dealershipId: dealership.id, date },
          value: utilisationRatio(
            bays.length,
            (window.end - window.start) / MINUTE_MS,
            bookedMs / MINUTE_MS,
          ),
        });
      }
    }
    return samples;
  });
}
