import { Suspense } from "react";
import { HistoryView } from "../../../../(app)/clock/history/history-view";
import { baseWording } from "../../../../(app)/wording";
import { demoRecords } from "../data";
import { demoOwnPay } from "../pay/data";

type Props = { searchParams: Promise<{ state?: string; estimate?: string }> };

// The real history with mock data. ?state=empty shows a month with no shifts:
// only its empty state, no estimate card. The month's estimate of Noa's pay
// under it (payroll P7); ?estimate=off is a business that shows none.
export default function ShellClockHistory({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { state, estimate } = await searchParams;
  const records = state === "empty" ? [] : demoRecords;
  return (
    <HistoryView
      ownPay={demoOwnPay(records, "2026-11", estimate)}
      data={{
        month: "2026-11",
        currentMonth: "2026-11",
        minutes: records.reduce((sum, record) => sum + record.minutes, 0),
        records,
      }}
      paths={{
        clock: "/design/shell/clock",
        history: "/design/shell/clock/history",
        team: "/design/shell/clock/team",
        code: "/design/shell/clock/code",
        pay: "/design/shell/clock/pay",
      }}
      wording={baseWording}
    />
  );
}
