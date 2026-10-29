// design.md 8.25. The warning before a save that would flag bookings (D-0001-36 A). Nothing is saved while it is
// open. It starts on "Go back and edit"; Esc and the close button go back too; the scrim does not close it.
import type { ReactNode } from "react";
import { useRef } from "react";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

export interface FlagImpactBooking {
  key: string;
  /** "Sat 31 Oct, 14:30 to 15:30". */
  when: string;
  /** "Inspection · Ana Costa · ends 1 hour after closing". */
  detail: ReactNode;
}

const SHOWN = 5;

export function FlagImpactDialog({
  open,
  changeSentence,
  bookings,
  onBack,
  onConfirm,
  loading = false,
  error,
}: {
  open: boolean;
  /** "You changed Saturday: it now closes at 14:00 instead of 17:00. Two bookings on Sat 31 Oct end after that." */
  changeSentence: string;
  /** Every booking the save would flag; the first five are listed, then "and 3 more". */
  bookings: readonly FlagImpactBooking[];
  onBack: () => void;
  onConfirm: () => void;
  loading?: boolean;
  error?: ReactNode;
}) {
  const back = useRef<HTMLButtonElement>(null);
  const count = bookings.length;
  const words = `${count} ${count === 1 ? "booking" : "bookings"}`;
  const more = count - SHOWN;
  return (
    <Dialog
      open={open}
      title={`Saving will flag ${words}`}
      onClose={onBack}
      destructive
      busy={loading}
      error={error}
      initialFocus={back}
      actions={
        <>
          <Button ref={back} disabled={loading} onClick={onBack}>
            Go back and edit
          </Button>
          <Button
            variant="primary"
            loading={loading}
            loadingLabel="Saving…"
            onClick={onConfirm}
          >
            Save and flag {words}
          </Button>
        </>
      }
    >
      <p>{changeSentence}</p>
      <ul className="m-0 list-none p-0">
        {bookings.slice(0, SHOWN).map((b) => (
          <li
            key={b.key}
            className="border-t border-border-subtle py-3 wrap-anywhere first:border-t-0"
          >
            <b className="num block">{b.when}</b>
            <small className="block text-sm text-text-secondary">
              {b.detail}
            </small>
          </li>
        ))}
        {more > 0 && (
          <li className="border-t border-border-subtle py-3">
            and {more} more
          </li>
        )}
      </ul>
      <p>
        {count === 1
          ? "It stays booked and keeps its technician and bay. Nothing is deleted or moved. After you save, it shows under Flagged, where you can move or cancel it."
          : "They stay booked and keep their technician and bay. Nothing is deleted or moved. After you save, they show under Flagged, where you can move or cancel each one."}
      </p>
    </Dialog>
  );
}
