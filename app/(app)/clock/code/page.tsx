import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { restartOrderStationAction } from "../../orders/stations/actions";
import { baseWording, translator } from "../../wording";
import { clockPaths } from "../clock";
import { lockDeviceAction, stopDeviceStationAction } from "../station/actions";
import { currentLockOffer } from "../station/station";
import { currentCodeScreen } from "./code";
import { CodeScreen } from "./code-screen";

export async function generateMetadata(): Promise<Metadata> {
  // Page titles stay in the app's own words.
  const t = translator(baseWording, "app.clock.code");
  return { title: t("title") };
}

// The clock's code on an owner's or manager's own phone, for the team to type
// as they come and go, and the way to leave the device it is on (a tablet at
// the business) as the business's clock station. Not there for anyone else.
// On a device that is the business's kitchen's screen or till, the lock
// stops that one first, taking orders on or off (waiter mode P8a).
export default async function ClockCodePage() {
  const [data, offer] = await Promise.all([
    currentCodeScreen(),
    currentLockOffer(),
  ]);
  if (!data) notFound();
  return (
    <CodeScreen
      data={data}
      issueUrl="/clock/code/issue"
      paths={{
        clock: clockPaths.clock,
        team: clockPaths.team,
        settings: "/manage/time_clock",
      }}
      lock={
        offer
          ? {
              offer,
              action: lockDeviceAction,
              stopOther: {
                stop: stopDeviceStationAction,
                restart: restartOrderStationAction,
              },
            }
          : null
      }
    />
  );
}
