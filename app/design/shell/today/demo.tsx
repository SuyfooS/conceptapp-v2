import { type TodayData, TodayView } from "../../../(app)/home/today-view";
import { demoSignOut } from "../actions";

/** The real Today screen on the demo: its links stay in the demo. */
export function TodayDemo({ data }: { data: TodayData }) {
  return <TodayView data={data} signOut={demoSignOut} base="/design/shell" />;
}
