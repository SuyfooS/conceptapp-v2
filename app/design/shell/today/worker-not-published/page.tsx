import { TodayDemo } from "../demo";
import { todayScenarios } from "../scenarios";

export default function ShellTodayWorkerNotPublished() {
  return <TodayDemo data={todayScenarios.workerNotPublished()} />;
}
