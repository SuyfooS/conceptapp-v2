import { TodayDemo } from "../demo";
import { todayScenarios } from "../scenarios";

export default function ShellTodayOwner() {
  return <TodayDemo data={todayScenarios.owner()} />;
}
