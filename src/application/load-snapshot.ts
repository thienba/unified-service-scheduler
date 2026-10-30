import type { SchedulingSnapshot } from "../domain/availability";
import type { EpochMs } from "../domain/model";
import { MINUTE_MS, addDays, dayBounds, localDateOf } from "../domain/time";
import type { ReadStores } from "./ports";

export interface SnapshotRequest {
  dealershipId: string;
  serviceTypeId: string;
  /** The wanted start; the snapshot covers its local date. */
  around: EpochMs;
  /** How many more local dates either side to cover (0 for a check, the window for suggestions). */
  daysEitherSide: number;
  /** The car being booked: its blocking appointments at any dealership are loaded too (D-0001-146). */
  vehicleId?: string;
}

/**
 * Builds the availability snapshot from the stores for one dealership and the dates a request
 * touches (architecture.md section 7.4). Gives `undefined` when the dealership or service type is unknown.
 */
export async function loadSnapshot(
  stores: Pick<ReadStores, "scheduling">,
  request: SnapshotRequest,
): Promise<SchedulingSnapshot | undefined> {
  const { scheduling } = stores;
  const dealership = await scheduling.getDealership(request.dealershipId);
  const serviceType = await scheduling.getServiceType(request.serviceTypeId);
  if (!dealership || !serviceType) return undefined;

  const date = localDateOf(request.around, dealership.timeZone);
  const first = dayBounds(
    addDays(date, -request.daysEitherSide),
    dealership.timeZone,
  );
  const last = dayBounds(
    addDays(date, request.daysEitherSide),
    dealership.timeZone,
  );
  // A job just outside the dates still holds its technician for the break after it.
  const margin = dealership.policies.breakMinutes * MINUTE_MS;
  return {
    dealership,
    serviceType,
    technicians: await scheduling.listTechnicians(dealership.id),
    bays: await scheduling.listServiceBays(dealership.id),
    courtesyCars: await scheduling.listCourtesyCars(dealership.id),
    appointments: await scheduling.listBlockingAppointments(
      dealership.id,
      first.start - margin,
      last.end + margin,
    ),
    ...(request.vehicleId === undefined
      ? {}
      : {
          vehicleAppointments: await scheduling.listBlockingByVehicle(
            request.vehicleId,
            first.start,
            last.end,
          ),
        }),
  };
}
