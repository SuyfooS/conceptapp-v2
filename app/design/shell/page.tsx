import { TodayDemo } from "./today/demo";
import { managerToday } from "./today/scenarios";

// The real Today screen as Shiran, the shift manager, sees it. The other
// people and states are under /design/shell/today.
export default function ShellHome() {
  return <TodayDemo data={managerToday()} />;
}
