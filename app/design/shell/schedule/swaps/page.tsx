import { SwapApprovalsView } from "../../../../(app)/schedule/swaps/swap-approvals-view";
import { baseWording } from "../../../../(app)/wording";
import { demoPublished, demoRequest } from "../shifts/published";
import { demoDecide } from "./actions";

// The real swap approvals screen as Shiran, the shift manager, sees it on
// Tuesday 3 November at noon: Noa took Yoav's Saturday night and Itay took
// Maya's Wednesday morning. Noa's Friday is still open, so it is not listed.
// Maya took Omer's Tuesday morning too, but it began at 09:00: it can only be
// declined, and it is not counted.
export default function ShellSwapApprovals() {
  const data = demoPublished("shiran", [
    demoRequest("1", "2026-11-06/friday", "noa"),
    demoRequest("2", "2026-11-04/morning", "maya", "itay"),
    demoRequest("3", "2026-11-07/saturday-night", "yoav", "noa"),
    demoRequest("4", "2026-11-03/morning", "omer", "maya"),
  ]);
  return (
    <SwapApprovalsView data={data} decide={demoDecide} wording={baseWording} />
  );
}
