import { useTimesNote } from "./dealership";

/** "Times are in London time." when the viewer is in another zone. The schedule's title shows it (design.md 8.3). */
export function TimesNote() {
  const note = useTimesNote();
  return note ? <p className="text-sm text-text-secondary">{note}</p> : null;
}
