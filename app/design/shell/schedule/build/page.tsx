import { buildTeam } from "@domain/team";
import { Suspense } from "react";
import { ScheduleBuildView } from "../../../../(app)/schedule/build/schedule-build-view";
import { baseWording } from "../../../../(app)/wording";
import {
  demoPositions,
  teamAnswers,
  teamInvites,
  teamMembers,
  teamToday,
} from "../../data";
import { demoWeek } from "../availability/week";
import { demoPublishMeanwhile, demoSaveSchedule } from "./actions";
import {
  demoBuildShifts,
  MEANWHILE_PUBLISHED_AT,
  meanwhileBasis,
  meanwhileShifts,
  meanwhileSwaps,
} from "./demo";

type Props = { searchParams: Promise<{ state?: string }> };

// The real "build the week" screen with the restaurant's shift pattern, one
// shift added by hand, the demo team and its answers, and a stand-in save.
// ?state=meanwhile: the same week published, with two swap requests waiting
// (Omer gives his Sunday evening away; Maya took Noa's Sunday morning). A
// change that would end a request says so above "פרסום השינויים". Another
// manager approves Maya's while the screen is open, so publishing a change to
// that morning is refused: it comes back as it is now, marked, with the rest
// of the work kept, and publishing again goes out.
export default function ShellScheduleBuild(props: Props) {
  return (
    <Suspense>
      <Demo {...props} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { state } = await searchParams;
  const { members } = buildTeam(teamMembers, teamInvites, teamToday);
  const common = {
    week: demoWeek,
    team: members,
    answers: teamAnswers,
    positions: demoPositions,
  };
  if (state === "meanwhile") {
    return (
      <ScheduleBuildView
        manageHref="/design/shell/manage/scheduling"
        data={{
          ...common,
          savedAt: MEANWHILE_PUBLISHED_AT,
          publishedAt: MEANWHILE_PUBLISHED_AT,
          shifts: meanwhileShifts,
          basis: meanwhileBasis,
        }}
        swaps={meanwhileSwaps}
        save={demoPublishMeanwhile}
        backHref="/design/shell/schedule"
        wording={baseWording}
      />
    );
  }
  return (
    <ScheduleBuildView
      manageHref="/design/shell/manage/scheduling"
      data={{
        ...common,
        savedAt: null,
        publishedAt: null,
        shifts: demoBuildShifts(),
        // Drawn from the pattern: nothing was read, as for a week not saved.
        basis: null,
      }}
      swaps={[]}
      save={demoSaveSchedule}
      backHref="/design/shell/schedule"
      wording={baseWording}
    />
  );
}
