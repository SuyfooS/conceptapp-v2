import { TodayDemo } from "../demo";
import { todayScenarios } from "../scenarios";

export default function ShellTodayAvailabilityMissing() {
  return <TodayDemo data={todayScenarios.availabilityMissing()} />;
}
