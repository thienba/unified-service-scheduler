// The staff view of `appointment` (staff.md 5.2): read only. No Cancel, Reschedule or Adjust, not even
// disabled (REQ-BOOK-005.AC-3, D-0001-19 A); a panel says who can. One shortcut: book another visit for the
// same customer and vehicle (D-0001-32 A).
import { Button } from "../../components/Button";
import { formatDuration } from "../../format/format";
import {
  AppointmentReadSide,
  SidePanel,
  isCancelled,
  type AppointmentViewProps,
} from "./AppointmentReadSide";

export function StaffAppointmentView(props: AppointmentViewProps) {
  const a = props.appointment;
  const firstName = (a.display.customerName ?? "").split(" ")[0] ?? "";
  const query = new URLSearchParams({
    dealership: a.dealershipId,
    customerId: a.customerId,
    vehicleId: a.vehicleId,
  });
  const again = (
    <Button icon="plus" to={`/book?${query.toString()}`}>
      Book another visit for {firstName}
    </Button>
  );
  const lead = props.dealership?.policies.leadTimeMinutes;
  const aside = isCancelled(a) ? (
    <SidePanel title="What next?" actions={again}>
      To book this customer again, start a new booking.
    </SidePanel>
  ) : (
    <SidePanel title="Need to change or cancel this?" actions={again}>
      Staff cannot move or cancel appointments. Ask the garage manager, or the
      customer can do it from their own account until{" "}
      {lead === undefined ? "shortly" : formatDuration(lead)} before the start.
    </SidePanel>
  );
  return <AppointmentReadSide {...props} audience="garage" aside={aside} />;
}
