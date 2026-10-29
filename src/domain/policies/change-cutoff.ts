import type { EpochMs } from "../model";
import { MINUTE_MS } from "../time";

/**
 * Whether a customer may still cancel or reschedule: up to and including the moment
 * `start - lead time` (Q-0001-20 A, D-0001-22 a). A manager is not limited by it.
 */
export function customerMayChange(
  start: EpochMs,
  now: EpochMs,
  leadTimeMinutes: number,
): boolean {
  return now <= start - leadTimeMinutes * MINUTE_MS;
}
