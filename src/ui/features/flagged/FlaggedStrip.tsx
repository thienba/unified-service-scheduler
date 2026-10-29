// The manager's warning strip on the schedule (manager.md 4.1 `schedule-additions`): shown above the facts line
// when bookings are flagged. Staff never get it; the count is the one the Flagged tab shows.
import { Alert } from "../../components/Alert";
import { Button } from "../../components/Button";
import { useFlaggedCount } from "../../data/flagged";
import { stripTitle } from "./flagged-model";

export function FlaggedStrip({
  dealershipId,
}: {
  dealershipId: string | undefined;
}) {
  const count = useFlaggedCount(dealershipId);
  if (count === 0) return null;
  return (
    <Alert
      kind="warning"
      role={null}
      title={stripTitle(count)}
      actions={
        <Button icon="right" to="/manage/flagged">
          Review flagged bookings
        </Button>
      }
    >
      <p>
        They no longer fit the opening hours or a technician’s shift. They are
        still booked.
      </p>
    </Alert>
  );
}
