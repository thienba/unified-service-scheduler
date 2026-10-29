// The manager's view of `appointment`: the read side for now. The manager ticket adds Adjust and Cancel
// here (manager-adjust.html?state=appointment).
import {
  AppointmentReadSide,
  type AppointmentViewProps,
} from "./AppointmentReadSide";

export function ManagerAppointmentView(props: AppointmentViewProps) {
  return <AppointmentReadSide {...props} audience="garage" />;
}
