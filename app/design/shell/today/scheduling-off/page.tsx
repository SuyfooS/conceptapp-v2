import { TodayDemo } from "../demo";
import { todayScenarios } from "../scenarios";

export default function ShellTodaySchedulingOff() {
  return <TodayDemo data={todayScenarios.schedulingOff()} />;
}
