import { ScheduleView } from "../../../(app)/schedule/schedule-view";
import { baseWording } from "../../../(app)/wording";
import { demoSwap } from "./shifts/actions";
import { demoManagerSchedule, demoRequest } from "./shifts/published";

// The real schedule tab as Shiran, the shift manager, sees it on Tuesday
// 3 November at noon: this week published, with four of its shifts still to
// start lacking someone (its row leads "ניהול הסידור"), next week a draft,
// two requests waiting. Her morning shift is on, so it offers no giving away.
export default function ShellSchedule() {
  return (
    <ScheduleView
      {...demoManagerSchedule([
        demoRequest("1", "2026-11-06/friday", "noa"),
        demoRequest("2", "2026-11-04/morning", "maya", "itay"),
        demoRequest("3", "2026-11-07/saturday-night", "yoav", "noa"),
      ])}
      swap={demoSwap}
      wording={baseWording}
    />
  );
}
