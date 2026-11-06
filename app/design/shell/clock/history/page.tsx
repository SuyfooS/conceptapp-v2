import { Suspense } from "react";
import { HistoryView } from "../../../../(app)/clock/history/history-view";
import { demoRecords } from "../data";

type Props = { searchParams: Promise<{ state?: string }> };

// The real history with mock data. ?state=empty shows a month with no shifts.
export default function ShellClockHistory({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { state } = await searchParams;
  const records = state === "empty" ? [] : demoRecords;
  return (
    <HistoryView
      data={{
        month: "2026-11",
        currentMonth: "2026-11",
        minutes: records.reduce((sum, record) => sum + record.minutes, 0),
        records,
      }}
      paths={{
        clock: "/design/shell/clock",
        history: "/design/shell/clock/history",
      }}
    />
  );
}
