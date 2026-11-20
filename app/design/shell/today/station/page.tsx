import { TodayDemo } from "../demo";
import { todayScenarios } from "../scenarios";

// Home on the business's clock station, signed in again by a manager: the
// reminder that the device is the station, and "נעילת המכשיר", which locks it
// again as the same station (to the station's twin, nobody signed out).
export default function ShellTodayStation() {
  return <TodayDemo data={todayScenarios.station()} />;
}
