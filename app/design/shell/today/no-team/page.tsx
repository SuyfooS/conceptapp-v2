import { TodayDemo } from "../demo";
import { todayScenarios } from "../scenarios";

export default function ShellTodayNoTeam() {
  return <TodayDemo data={todayScenarios.managerNoTeam()} />;
}
