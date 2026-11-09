import { ScheduleView } from "../../../../(app)/schedule/schedule-view";
import { baseWording } from "../../../../(app)/wording";
import { demoSwap } from "../shifts/actions";
import { demoRequest, demoWorkerSchedule } from "../shifts/published";

// The real schedule tab as Noa, a worker, sees it on Tuesday 3 November: her
// shift tonight first. She gives away Friday and can take Maya's Wednesday
// morning; she has not sent next week's availability yet.
export default function ShellScheduleWorker() {
  return (
    <ScheduleView
      {...demoWorkerSchedule([
        demoRequest("1", "2026-11-06/friday", "noa"),
        demoRequest("2", "2026-11-04/morning", "maya"),
        demoRequest("3", "2026-11-07/saturday-night", "yoav", "noa"),
      ])}
      swap={demoSwap}
      wording={baseWording}
    />
  );
}
