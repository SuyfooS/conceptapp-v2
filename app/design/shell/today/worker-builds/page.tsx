import { TodayDemo } from "../demo";
import { todayScenarios } from "../scenarios";

export default function ShellTodayWorkerBuilds() {
  return <TodayDemo data={todayScenarios.workerBuilds()} />;
}
