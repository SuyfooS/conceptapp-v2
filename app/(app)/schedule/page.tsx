import { publishesSchedule } from "@domain/schedule";
import { notFound } from "next/navigation";
import { currentWording } from "../current-wording";
import { currentMember } from "../member";
import { moduleMetadata } from "../module-screen";
import { currentPushAsk } from "../notifications/push-ask-offer";
import { ScheduleView } from "./schedule-view";
import { swapAction } from "./shifts/actions";
import {
  currentAvailabilityWeek,
  currentPublishedSchedule,
  currentRunningBuild,
  currentScheduleBuild,
  currentTeamAvailability,
} from "./week";

export const generateMetadata = () => moduleMetadata("scheduling");

// The schedule tab: the published week and the person's own shifts first,
// then the screens around it. Whoever builds the schedule also gets building
// the week (this week's first, while it lacks someone), the team's answers
// and approvals, and each week's draft; someone who builds without publishing,
// none of a published week's short shifts to fill, nor their own requests to
// approve. After giving a shift away here, once, the offer of notifications
// on the phone.
export default async function SchedulePage() {
  const [member, week, team, build, running, data, wording, ask] =
    await Promise.all([
      currentMember(),
      currentAvailabilityWeek(),
      currentTeamAvailability(),
      currentScheduleBuild(),
      currentRunningBuild(),
      currentPublishedSchedule(),
      currentWording(),
      currentPushAsk(),
    ]);
  if (!week || !data) notFound();
  const membership = member?.membership;
  return (
    <ScheduleView
      data={data}
      week={week}
      late={new Date(week.dueAt).getTime() < Date.now()}
      team={team}
      build={build}
      running={running}
      publishes={membership ? publishesSchedule(membership) : false}
      swap={swapAction}
      wording={wording}
      ask={ask}
    />
  );
}
