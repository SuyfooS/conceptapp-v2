import { Suspense } from "react";
import { HistoryView } from "../../../../(app)/clock/history/history-view";
import { baseWording } from "../../../../(app)/wording";
import { demoOwnPay } from "../pay/data";
import { demoNoaAbsences, demoNoaRecords } from "../team/data";

type Props = {
  searchParams: Promise<{
    state?: string;
    estimate?: string;
    absences?: string;
  }>;
};

// The real history with mock data, a shift cancelled by a manager among them
// (it says who, when and why, and counts for nothing). ?state=empty shows a
// month with no shifts: only its empty state, no estimate card. The month's
// estimate of Noa's pay under it (payroll P7); ?estimate=off is a business
// that shows none. ?absences=1 lists her days away of the month, as she
// reads them (known issue 19).
export default function ShellClockHistory({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { state, estimate, absences } = await searchParams;
  const records = state === "empty" ? [] : demoNoaRecords;
  return (
    <HistoryView
      ownPay={demoOwnPay(records, "2026-11", estimate)}
      data={{
        month: "2026-11",
        currentMonth: "2026-11",
        minutes: records.reduce((sum, record) => sum + record.minutes, 0),
        records,
        absences:
          absences === "1"
            ? demoNoaAbsences.map(
                ({ id, kind, from, to, note, days, inMonth }) => ({
                  id,
                  kind,
                  from,
                  to,
                  note,
                  days,
                  inMonth,
                }),
              )
            : [],
        // None of Noa's mock shifts needs fixing.
        askFix: null,
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
