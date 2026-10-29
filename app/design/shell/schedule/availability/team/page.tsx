import { teamAvailability } from "@domain/availability";
import { buildTeam } from "@domain/team";
import { TeamAvailabilityView } from "../../../../../(app)/schedule/availability/team/team-availability-view";
import {
  teamAnswers,
  teamInvites,
  teamMembers,
  teamToday,
} from "../../../data";
import { demoWeek } from "../week";

// The real team availability screen with mock answers for the demo week:
// five sent (one late, one with no hours), two missing.
export default function ShellTeamAvailability() {
  const { members } = buildTeam(teamMembers, teamInvites, teamToday);
  return (
    <TeamAvailabilityView
      data={{
        week: demoWeek,
        team: teamAvailability(members, teamAnswers, demoWeek.dueAt),
      }}
    />
  );
}
