import { teamAvailability } from "@domain/availability";
import { buildTeam } from "@domain/team";
import { Suspense } from "react";
import { TeamAvailabilityView } from "../../../../../(app)/schedule/availability/team/team-availability-view";
import {
  teamAnswers,
  teamInvites,
  teamMembers,
  teamToday,
} from "../../../data";
import { demoWeek } from "../week";

type Props = { searchParams: Promise<{ state?: string }> };

// The real team availability screen with mock answers for the demo week:
// five sent (one late, one with no hours), two missing. ?state=none shows
// nobody sent yet, ?state=all everyone sent, ?state=empty a team of no one.
export default function ShellTeamAvailability({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { state } = await searchParams;
  const { members } = buildTeam(teamMembers, teamInvites, teamToday);
  const answered = new Set(teamAnswers.map((answer) => answer.userId));
  const team =
    state === "empty"
      ? []
      : state === "all"
        ? members.filter((member) => answered.has(member.userId))
        : members;
  return (
    <TeamAvailabilityView
      data={{
        week: demoWeek,
        team: teamAvailability(
          team,
          state === "none" ? [] : teamAnswers,
          demoWeek.dueAt,
        ),
      }}
      backHref="/design/shell/schedule"
    />
  );
}
