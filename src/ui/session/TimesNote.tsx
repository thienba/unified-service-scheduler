import { cx } from "../components/cx";
import { viewerTimeZone, zoneNote } from "../format/format";
import { useTimesNote } from "./dealership";

/** "Times are in London time." when the viewer is in another zone. The schedule's title shows it (design.md 8.3). */
export function TimesNote({ className }: { className?: string }) {
  const note = useTimesNote();
  return note ? (
    <p className={cx("text-sm text-text-secondary", className)}>{note}</p>
  ) : null;
}

/**
 * The same note for a screen that already knows the zone its times are in (an appointment's), once per screen
 * (design.md section 9).
 */
export function ZoneTimesNote({
  timeZone,
  className,
}: {
  timeZone: string;
  className?: string;
}) {
  const note = zoneNote(timeZone, viewerTimeZone(), "sentence");
  return note ? (
    <p className={cx("text-sm text-text-secondary", className)}>{note}</p>
  ) : null;
}
