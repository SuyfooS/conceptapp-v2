import { notFound } from "next/navigation";
import { currentWording } from "../current-wording";
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

export const generateMetadata = () => moduleMetadata("time_clock");

export default async function ClockPage() {
  const data = await currentClock();
  if (!data) notFound();
  return (
    <ClockView
      data={data}
      actions={{
        clockIn: clockInAction,
        clockOut: clockOutAction,
        startBreak: startBreakAction,
        endBreak: endBreakAction,
        undoClockOut: undoClockOutAction,
      }}
      paths={clockPaths}
      wording={await currentWording()}
    />
  );
}
