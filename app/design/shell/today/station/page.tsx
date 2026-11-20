import { Suspense } from "react";
import { TodayDemo } from "../demo";
import { todayScenarios } from "../scenarios";

type Props = { searchParams: Promise<{ state?: string }> };

// Home on the business's clock station, signed in again by a manager: the
// reminder that the device is the station, and "נעילת המכשיר", which locks it
// again as the same station (to the station's twin, nobody signed out).
// ?state=worker is Noa signed in on it: the card says the device is the
// business's tablet, and "יציאה מהחשבון" goes to the station's twin, as the
// device goes back to its code.
export default function ShellTodayStation({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { state } = await searchParams;
  return (
    <TodayDemo
      data={todayScenarios.station(state === "worker" ? state : undefined)}
    />
  );
}
