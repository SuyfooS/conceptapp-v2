import { TodayDemo } from "../demo";
import { todayScenarios } from "../scenarios";

export default function ShellTodayOnShift() {
  return <TodayDemo data={todayScenarios.onShift()} />;
}
