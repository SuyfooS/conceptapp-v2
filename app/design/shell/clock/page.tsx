import { connection } from "next/server";
import { Suspense } from "react";
import { ClockView } from "../../../(app)/clock/clock-view";
import { ModeRows } from "../../../(app)/mode-rows";
import { baseWording } from "../../../(app)/wording";
import { demoOrdersMode } from "../data";
import {
  demoClockIn,
  demoClockOut,
  demoEndBreak,
  demoStartBreak,
  demoUndoClockOut,
} from "./actions";
import { demoClock, demoRecords } from "./data";
import { demoOwnPay } from "./pay/data";

type Props = {
  searchParams: Promise<{ state?: string; code?: string; estimate?: string }>;
};

// The real clock screen with mock data and stand-in actions. ?state=working
// and ?state=break show someone at work, and ?state=left just after leaving.
// ?code=on: the business asks for the clock's code ("000000" is refused).
// Noa's month in shekels is a flat card under her wage (payroll P7), the
// circle staying the screen's hero; at work, it says the shift she is in
// counts once it ends. ?estimate=off is a business whose amounts the team
// hasn't turned on, or that hides them from workers: no card.
// Each stand-in moves to its state's own address, a page of its own (Next
// keeps the one before hidden, as it does a month's), so the clock that
// noted a press is not the one drawn after it: where the focus goes after a
// press of the clock's buttons (accessibility, part 5) shows only on /clock,
// the hosted demo's included, where the screen is read again in place.
export default function ShellClock({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  await connection();
  const { state, code, estimate } = await searchParams;
  return (
    <ClockView
      data={demoClock(state, new Date(), code === "on")}
      // On a shift: waiter mode's way in, to the twin (P4).
      modes={<ModeRows rows={[{ ...demoOrdersMode }]} />}
      ownPay={demoOwnPay(
        demoRecords,
        "2026-11",
        estimate,
        state === "working" || state === "break",
      )}
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
