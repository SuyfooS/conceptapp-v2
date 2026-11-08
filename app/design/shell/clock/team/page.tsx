import { TeamHoursView } from "../../../../(app)/clock/team/team-view";
import { baseWording } from "../../../../(app)/wording";
import { demoConfirmEntry } from "./actions";
import { demoTeamHours, demoTeamPaths } from "./data";

// The real team hours with mock data: two entries to approve, one shift to
// fix, two at work, and the clock's code to show.
export default function ShellClockTeam() {
  return (
    <TeamHoursView
      data={demoTeamHours}
      actions={{ confirm: demoConfirmEntry }}
      paths={demoTeamPaths}
      wording={baseWording}
    />
  );
}
