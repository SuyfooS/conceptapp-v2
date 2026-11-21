import { CodeScreen } from "../../../../(app)/clock/code/code-screen";
import { business } from "../../data";
import { demoLockDevice } from "../../station/actions";
import { demoStations } from "../team/data";

// The real code screen, as a manager sees it, asking a stand-in route for
// codes that nothing stores. Locking the device leads to the station's twin,
// with nothing stored and nobody signed out.
export default function ShellClockCode() {
  return (
    <CodeScreen
      data={{
        businessName: business.name,
        required: true,
        owner: false,
        viewOnly: false,
        stationsOnly: false,
      }}
      issueUrl="/design/shell/clock/code/issue"
      paths={{
        clock: "/design/shell/clock",
        team: "/design/shell/clock/team",
        settings: "/design/shell/manage/time_clock",
      }}
      lock={{
        offer: {
          current: null,
          running: demoStations.rows.map((station) => station.name),
        },
        action: demoLockDevice,
        clearsDevice: false,
      }}
    />
  );
}
