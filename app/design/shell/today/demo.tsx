import { type TodayData, TodayView } from "../../../(app)/home/today-view";
import { baseWording } from "../../../(app)/wording";
import { demoLockDevice, demoSignOutOfStation } from "../station/actions";

/**
 * The real Today screen on the demo: its links stay in the demo, and locking
 * the station again or signing out from its card leads to the station's twin.
 */
export function TodayDemo({ data }: { data: TodayData }) {
  return (
    <TodayView
      data={data}
      wording={baseWording}
      base="/design/shell"
      hideFirstStepsUrl="/design/shell/home/first-steps"
      lockStation={demoLockDevice}
      signOut={demoSignOutOfStation}
    />
  );
}
