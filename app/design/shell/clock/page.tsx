import { connection } from "next/server";
import { Suspense } from "react";
import { ClockView } from "../../../(app)/clock/clock-view";
import {
  demoClockIn,
  demoClockOut,
  demoEndBreak,
  demoStartBreak,
  demoUndoClockOut,
} from "./actions";
import { demoClock } from "./data";

type Props = { searchParams: Promise<{ state?: string }> };

// The real clock screen with mock data and stand-in actions. ?state=working
// and ?state=break show someone at work, and ?state=left just after leaving.
export default function ShellClock({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  await connection();
  const { state } = await searchParams;
  return (
    <ClockView
      data={demoClock(state, new Date())}
      actions={{
        clockIn: demoClockIn,
        clockOut: demoClockOut,
        startBreak: demoStartBreak,
        endBreak: demoEndBreak,
        undoClockOut: demoUndoClockOut,
      }}
      paths={{
        clock: "/design/shell/clock",
        history: "/design/shell/clock/history",
        team: "/design/shell/clock/team",
      }}
    />
  );
}
