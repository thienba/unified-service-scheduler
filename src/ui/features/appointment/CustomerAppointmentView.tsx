// The customer's view of `appointment`: the read side without the customer, the bay and the staff panel
// (D-0001-26 C). The customer-appointments ticket adds Cancel and Reschedule here.
import {
  AppointmentReadSide,
  type AppointmentViewProps,
} from "./AppointmentReadSide";

export function CustomerAppointmentView(props: AppointmentViewProps) {
  return <AppointmentReadSide {...props} audience="customer" />;
}
