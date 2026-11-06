import { notFound } from "next/navigation";
import { moduleMetadata } from "../module-screen";
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
// week, the team's answers and approvals, and next week's draft.
export default async function SchedulePage() {
  const [week, team, build, data] = await Promise.all([
    currentAvailabilityWeek(),
    currentTeamAvailability(),
    currentScheduleBuild(),
    currentPublishedSchedule(),
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
    />
  );
}
