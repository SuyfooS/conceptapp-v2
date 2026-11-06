import { TodayDemo } from "../demo";
import { todayScenarios } from "../scenarios";

export default function ShellTodayWorker() {
  return <TodayDemo data={todayScenarios.worker()} />;
}
