import type { LockAction } from "../../../(app)/clock/station/station-types";
import { type TodayData, TodayView } from "../../../(app)/home/today-view";
import { baseWording } from "../../../(app)/wording";
import { demoLockDevice, demoSignOutOfStation } from "../station/actions";
import { demoDisputeBankChange } from "./actions";

/**
 * The real Today screen on the demo: its links stay in the demo, and locking
 * the station again or signing out from its card leads to the station's twin.
 * Its lock locks nothing, so the device's own orders are neither read nor
 * cleared. A bank change's "לא שיניתי" keeps nothing and goes on to the
 * worker's twin, disputed, as it would be drawn again; "אני שיניתי" and
 * "הבנתי" hide the card with its undo, as in the app, and keep nothing. The
 * file's card and row lead to the file's twin in the state they tell
 * (`fileQuery`), since the twin keeps nothing.
 */
export function TodayDemo({
  data,
  lockStation = demoLockDevice,
  fileQuery,
}: {
  data: TodayData;
  /** The kitchen's screen locks again to its own twin. */
  lockStation?: LockAction;
  /** The file twin's state the file's card or row tells, such as `state=later`. */
  fileQuery?: string;
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
      fileActions={{
        dispute: demoDisputeBankChange,
        seenUrl: "/design/shell/home/bank-seen",
      }}
      fileQuery={fileQuery}
    />
  );
}
