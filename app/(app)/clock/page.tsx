import { notFound } from "next/navigation";
import { moduleMetadata } from "../module-screen";
import {
  clockInAction,
  clockOutAction,
  endBreakAction,
  saveClockSettingsAction,
  startBreakAction,
  undoClockOutAction,
} from "./actions";
import { currentClock } from "./clock";
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
        saveSettings: saveClockSettingsAction,
      }}
      paths={{ clock: "/clock", history: "/clock/history" }}
    />
  );
}
