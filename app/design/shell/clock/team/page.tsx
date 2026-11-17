import { TeamHoursView } from "../../../../(app)/clock/team/team-view";
import { baseWording } from "../../../../(app)/wording";
import {
  demoConfirmEntry,
  demoRestartStation,
  demoStopStation,
} from "./actions";
import { demoTeamHours, demoTeamPaths } from "./data";

// The real team hours with mock data: two entries to approve, one shift to
// fix, two at work, the clock's code to show, and three clock stations.
export default function ShellClockTeam() {
  return (
    <TeamHoursView
      data={demoTeamHours}
      actions={{
        confirm: demoConfirmEntry,
        stopStation: demoStopStation,
        restartStation: demoRestartStation,
      }}
      paths={demoTeamPaths}
      wording={baseWording}
    />
  );
}
