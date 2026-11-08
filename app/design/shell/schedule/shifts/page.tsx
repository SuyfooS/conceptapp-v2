import { MyShiftsView } from "../../../../(app)/schedule/shifts/my-shifts-view";
import { baseWording } from "../../../../(app)/wording";
import { demoSwap } from "./actions";
import { demoPublished, demoRequest } from "./published";

// The real "my shifts" screen as Noa sees it on Tuesday 3 November: this
// week published, next week not yet. Noa gives away Friday; she can take
// Maya's Wednesday morning, and she took Yoav's Saturday night, which
// waits for the manager.
export default function ShellMyShifts() {
  const data = demoPublished("noa", [
    demoRequest("1", "2026-11-06/friday", "noa"),
    demoRequest("2", "2026-11-04/morning", "maya"),
    demoRequest("3", "2026-11-07/saturday-night", "yoav", "noa"),
  ]);
  return <MyShiftsView data={data} swap={demoSwap} wording={baseWording} />;
}
