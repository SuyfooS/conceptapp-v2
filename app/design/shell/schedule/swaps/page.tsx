import { SwapApprovalsView } from "../../../../(app)/schedule/swaps/swap-approvals-view";
import { baseWording } from "../../../../(app)/wording";
import { demoPublished, demoRequest } from "../shifts/published";
import { demoDecide } from "./actions";

// The real swap approvals screen as Shiran, the shift manager, sees it on
// Tuesday 3 November: Noa took Yoav's Saturday night and Itay took Maya's
// Wednesday morning. Noa's Friday is still open, so it is not listed.
export default function ShellSwapApprovals() {
  const data = demoPublished("shiran", [
    demoRequest("1", "2026-11-06/friday", "noa"),
    demoRequest("2", "2026-11-04/morning", "maya", "itay"),
    demoRequest("3", "2026-11-07/saturday-night", "yoav", "noa"),
  ]);
  return (
    <SwapApprovalsView data={data} decide={demoDecide} wording={baseWording} />
  );
}
