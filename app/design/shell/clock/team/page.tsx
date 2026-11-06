import { TeamHoursView } from "../../../../(app)/clock/team/team-view";
import { demoTeamHours, demoTeamPaths } from "./data";

// The real team hours with mock data: one shift to fix, two at work.
export default function ShellClockTeam() {
  return <TeamHoursView data={demoTeamHours} paths={demoTeamPaths} />;
}
