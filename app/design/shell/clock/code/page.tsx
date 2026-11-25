import { Suspense } from "react";
import type { CodeScreenData } from "../../../../(app)/clock/code/code";
import { CodeScreen } from "../../../../(app)/clock/code/code-screen";
import { business } from "../../data";
import { demoLockDevice } from "../../station/actions";
import { demoOtherStation, demoStations } from "../team/data";
import { OtherStationCode } from "./other-station";

type Props = {
  searchParams: Promise<{ other?: string; restart?: string }>;
};

const data: CodeScreenData = {
  businessName: business.name,
  required: true,
  owner: false,
  viewOnly: false,
  stationsOnly: false,
};
const issueUrl = "/design/shell/clock/code/issue";
const paths = {
  clock: "/design/shell/clock",
  team: "/design/shell/clock/team",
  settings: "/design/shell/manage/time_clock",
};
const running = demoStations.rows.map((station) => station.name);

// The real code screen, as a manager sees it, asking a stand-in route for
// codes that nothing stores. Locking the device leads to the station's twin,
// with nothing stored and nobody signed out. `?other=prep`: the device is
// already the business's kitchen's screen, which the lock stops first, with
// "ביטול" in the toast to start it again (kept in the page, nothing stored);
// `&restart=off` as for someone who can't start it again, so the toast has
// no "ביטול".
export default function ShellClockCode({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { other, restart } = await searchParams;
  if (other === "prep") {
    return (
      <OtherStationCode
        data={data}
        issueUrl={issueUrl}
        paths={paths}
        running={running}
        station={demoOtherStation}
        lock={demoLockDevice}
        restarts={restart !== "off"}
      />
    );
  }
  return (
    <CodeScreen
      data={data}
      issueUrl={issueUrl}
      paths={paths}
      lock={{
        offer: { current: null, running },
        action: demoLockDevice,
        clearsDevice: false,
      }}
    />
  );
}
