import { type TodayData, TodayView } from "../../../(app)/home/today-view";
import { baseWording } from "../../../(app)/wording";

/** The real Today screen on the demo: its links stay in the demo. */
export function TodayDemo({ data }: { data: TodayData }) {
  return <TodayView data={data} wording={baseWording} base="/design/shell" />;
}
