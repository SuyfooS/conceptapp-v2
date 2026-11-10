import { connection } from "next/server";
import { Suspense } from "react";
import { ClockView } from "../../../(app)/clock/clock-view";
import { baseWording } from "../../../(app)/wording";
import {
  demoClockIn,
  demoClockOut,
  demoEndBreak,
  demoStartBreak,
  demoUndoClockOut,
} from "./actions";
import { demoClock } from "./data";

type Props = { searchParams: Promise<{ state?: string; code?: string }> };

// The real clock screen with mock data and stand-in actions. ?state=working
// and ?state=break show someone at work, and ?state=left just after leaving.
// ?code=on: the business asks for the clock's code ("000000" is refused).
export default function ShellClock({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  await connection();
  const { state, code } = await searchParams;
  return (
    <ClockView
      data={demoClock(state, new Date(), code === "on")}
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
        code: "/design/shell/clock/code",
        pay: "/design/shell/clock/pay",
      }}
      wording={baseWording}
    />
  );
}
