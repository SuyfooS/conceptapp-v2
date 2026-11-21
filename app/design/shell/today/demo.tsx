import type { LockAction } from "../../../(app)/clock/station/station-types";
import { type TodayData, TodayView } from "../../../(app)/home/today-view";
import { baseWording } from "../../../(app)/wording";
import { demoLockDevice, demoSignOutOfStation } from "../station/actions";

/**
 * The real Today screen on the demo: its links stay in the demo, and locking
 * the station again or signing out from its card leads to the station's twin.
 * Its lock locks nothing, so the device's own orders are neither read nor
 * cleared.
 */
export function TodayDemo({
  data,
  lockStation = demoLockDevice,
}: {
  data: TodayData;
  /** The kitchen's screen locks again to its own twin. */
  lockStation?: LockAction;
}) {
  return (
    <TodayView
      data={data}
      wording={baseWording}
      base="/design/shell"
      hideFirstStepsUrl="/design/shell/home/first-steps"
      lockStation={lockStation}
      lockClearsDevice={false}
      signOut={demoSignOutOfStation}
    />
  );
}
