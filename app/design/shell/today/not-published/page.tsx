import { TodayDemo } from "../demo";
import { todayScenarios } from "../scenarios";

export default function ShellTodayNotPublished() {
  return <TodayDemo data={todayScenarios.notPublished()} />;
}
