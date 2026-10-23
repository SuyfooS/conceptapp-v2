import { buildTeam } from "@domain/team";
import { TeamView } from "../../../(app)/team/team-view";
import { teamInvites, teamMembers, teamToday } from "../data";

// The real Team screen with mock people: three members' worth of the demo
// staff, one open invite and one expired.
export default function ShellTeam() {
  return <TeamView team={buildTeam(teamMembers, teamInvites, teamToday)} />;
}
