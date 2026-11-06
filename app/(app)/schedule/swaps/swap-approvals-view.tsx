import type { WeekScheduleShift } from "@db/schedule";
import { type Approval, approvalsFor } from "@domain/swaps";
import { PageBody, PageHeader } from "@ui/page";
import { getTranslations } from "next-intl/server";
import type { PublishedSchedule } from "../week";
import type { DecideState } from "./actions";
import { ApprovalsBoard } from "./approvals-board";

type DecideAction = (
  state: DecideState,
  form: FormData,
) => Promise<DecideState>;
type Row = Approval<WeekScheduleShift>;

/** The requests waiting for a manager, from today on, in both weeks. */
export function pendingApprovals(data: PublishedSchedule): Row[] {
  return approvalsFor(
    data.swaps,
    [...data.thisWeek.shifts, ...data.nextWeek.shifts],
    data.today,
  );
}

/**
 * The manager's list of shifts colleagues took, to approve or decline.
 * Phone: one request under the other; tablet: two columns of cards;
 * desktop: one table with the people in columns. `decide` is
 * `decideSwapAction`, or the demo's stand-in. Also rendered with mock
 * data on /design/shell/schedule/swaps.
 */
export async function SwapApprovalsView({
  data,
  decide,
}: {
  data: PublishedSchedule;
  decide: DecideAction;
}) {
  const [t, tm] = await Promise.all([
    getTranslations("app"),
    getTranslations("modules.scheduling"),
  ]);
  return (
    <PageBody>
      <PageHeader
        back={{ href: "/schedule", label: tm("name") }}
        title={t("swaps.title")}
        subtitle={t("swaps.subtitle")}
      />
      <ApprovalsBoard
        rows={pendingApprovals(data)}
        people={data.people}
        positions={data.positions}
        decide={decide}
      />
    </PageBody>
  );
}
