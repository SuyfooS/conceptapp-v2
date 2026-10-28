import { AvailabilityView } from "../../../../(app)/schedule/availability/availability-view";
import { demoSaveAvailability } from "./actions";
import { demoWeek } from "./week";

// The real availability form with a fixed week and the demo's stand-in
// action: the same checks, nothing stored.
export default function ShellAvailability() {
  return (
    <AvailabilityView
      week={demoWeek}
      late={false}
      save={demoSaveAvailability}
    />
  );
}
