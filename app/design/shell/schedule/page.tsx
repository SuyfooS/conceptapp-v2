import { ScheduleView } from "../../../(app)/schedule/schedule-view";
import { demoSwap } from "./shifts/actions";
import { demoManagerSchedule, demoRequest } from "./shifts/published";

// The real schedule tab as Shiran, the shift manager, sees it on Tuesday
// 3 November: this week published, next week a draft, two requests waiting.
export default function ShellSchedule() {
  return (
    <ScheduleView
      {...demoManagerSchedule([
        demoRequest("1", "2026-11-06/friday", "noa"),
        demoRequest("2", "2026-11-04/morning", "maya", "itay"),
        demoRequest("3", "2026-11-07/saturday-night", "yoav", "noa"),
      ])}
      swap={demoSwap}
    />
  );
}
