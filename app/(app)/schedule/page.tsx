import { notFound } from "next/navigation";
import { currentWording } from "../current-wording";
import { moduleMetadata } from "../module-screen";
import { currentPushAsk } from "../notifications/push-ask-offer";
import { ScheduleView } from "./schedule-view";
import { swapAction } from "./shifts/actions";
import {
  currentAvailabilityWeek,
  currentPublishedSchedule,
  currentScheduleBuild,
  currentTeamAvailability,
} from "./week";

export const generateMetadata = () => moduleMetadata("scheduling");

// The schedule tab: the published week and the person's own shifts first,
// then the screens around it. Owners and managers also get building the
// week, the team's answers and approvals, and next week's draft. After
// giving a shift away here, once, the offer of notifications on the phone.
export default async function SchedulePage() {
  const [week, team, build, data, wording, ask] = await Promise.all([
    currentAvailabilityWeek(),
    currentTeamAvailability(),
    currentScheduleBuild(),
    currentPublishedSchedule(),
    currentWording(),
    currentPushAsk(),
  ]);
  if (!week || !data) notFound();
  return (
    <ScheduleView
      data={data}
      week={week}
      late={new Date(week.dueAt).getTime() < Date.now()}
      team={team}
      build={build}
      swap={swapAction}
      wording={wording}
      ask={ask}
    />
  );
}
