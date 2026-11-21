import { notFound } from "next/navigation";
import { currentWording } from "../current-wording";
import { currentModeRows, ModeRows } from "../mode-rows";
import { moduleMetadata } from "../module-screen";
import {
  clockInAction,
  clockOutAction,
  endBreakAction,
  startBreakAction,
  undoClockOutAction,
} from "./actions";
import { clockPaths, currentClock } from "./clock";
import { ClockView } from "./clock-view";
import { currentOwnPay } from "./own-pay";

export const generateMetadata = () => moduleMetadata("time_clock");

export default async function ClockPage() {
  const [data, ownPay, wording] = await Promise.all([
    currentClock(),
    // This month's estimate of their own pay, when the business shows it.
    currentOwnPay(undefined),
    currentWording(),
  ]);
  if (!data) notFound();
  // On a shift: the way into the modes it opens (waiter mode, P4).
  const modes = data.open ? await currentModeRows("clockIn", wording) : [];
  return (
    <ClockView
      data={data}
      ownPay={ownPay}
      actions={{
        clockIn: clockInAction,
        clockOut: clockOutAction,
        startBreak: startBreakAction,
        endBreak: endBreakAction,
        undoClockOut: undoClockOutAction,
      }}
      paths={clockPaths}
      wording={wording}
      modes={modes.length > 0 ? <ModeRows rows={modes} /> : null}
    />
  );
}
