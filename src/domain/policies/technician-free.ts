import { overlaps, type Interval } from "../appointment/interval";
import { MINUTE_MS } from "../time";

/**
 * Whether a technician can take the candidate job, given their other jobs.
 * The break is kept after a job and before the next one: a job ending at 10:00 blocks a
 * start before 10:15 (REQ-BOOK-011.AC-3). The break is not needed after the last job of a
 * work segment; that is a matter of the segment, not of this test (AC-4).
 * The break comes in as a number, so a changed policy changes the answer and nothing stored (AC-5).
 */
export function isTechnicianFree(
  candidate: Interval,
  jobs: readonly Interval[],
  breakMinutes: number,
): boolean {
  const gap = breakMinutes * MINUTE_MS;
  return !jobs.some((job) =>
    overlaps(candidate, { start: job.start - gap, end: job.end + gap }),
  );
}
