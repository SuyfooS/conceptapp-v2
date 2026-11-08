import { type TodayData, TodayView } from "../../../(app)/home/today-view";
import { baseWording } from "../../../(app)/wording";
import { demoSignOut } from "../actions";

/** The real Today screen on the demo: its links stay in the demo. */
export function TodayDemo({ data }: { data: TodayData }) {
  return (
    <TodayView
      data={data}
      wording={baseWording}
      signOut={demoSignOut}
      base="/design/shell"
    />
  );
}
