import type { WeekScheduleShift } from "@db/schedule";
import {
  type Approval,
  approvalsFor,
  decidesSwap,
  noLongerWaiting,
} from "@domain/swaps";
import { PageBody, PageHeader } from "@ui/page";
import { type AppWording, translator } from "../../wording";
import type { PublishedSchedule } from "../week";
import type { DecideState } from "./actions";
import { ApprovalsBoard } from "./approvals-board";

type DecideAction = (
  state: DecideState,
  form: FormData,
) => Promise<DecideState>;
type Row = Approval<WeekScheduleShift>;

/**
 * The requests waiting for the person to decide, from today on, in both
 * weeks, at the moment the server read them: every one for whoever
 * publishes the schedule, colleagues' only for someone who builds it without
 * publishing (`decidesSwap`, as the database refuses the rest). One whose
 * shift has begun is marked `started`: it can only be declined.
 */
export function pendingApprovals(
  data: PublishedSchedule,
  publishes = true,
): Row[] {
  const decider = { userId: data.userId, publishes };
  return approvalsFor(
    data.swaps,
    [...data.thisWeek.shifts, ...data.nextWeek.shifts],
    new Date(data.now),
    data.timeZone,
  ).filter((approval) => decidesSwap(approval.swap, decider));
}

/**
 * The manager's list of shifts colleagues took, to approve or decline, and
 * under it what no longer waits for a decision, with who decided. Phone: one
 * request under the other; tablet: two columns of cards; desktop: one table
 * with the people in columns. `decide` is
 * `decideSwapAction`, or the demo's stand-in. Also rendered with mock
 * data on /design/shell/schedule/swaps.
 */
export function SwapApprovalsView({
  data,
  decide,
  publishes = true,
  wording,
}: {
  data: PublishedSchedule;
  decide: DecideAction;
  /**
   * The person publishes the schedule too (`publishesSchedule`): without it
   * their own requests, asked or taken, aren't theirs to decide. True unless
   * said otherwise.
   */
  publishes?: boolean;
  /** The business's words. */
  wording: AppWording;
}) {
  const t = translator(wording, "app");
  const tm = translator(wording, "modules.scheduling");
  return (
    <PageBody>
      <PageHeader
        back={{ href: "/schedule", label: tm("name") }}
        title={t("swaps.title")}
        subtitle={t("swaps.subtitle")}
      />
      <ApprovalsBoard
        rows={pendingApprovals(data, publishes)}
        ended={noLongerWaiting(data.endedSwaps, data.today)}
        viewer={data.userId}
        people={data.people}
        positions={data.positions}
        decide={decide}
      />
    </PageBody>
  );
}
