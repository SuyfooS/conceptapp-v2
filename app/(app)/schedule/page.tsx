import { publishesSchedule } from "@domain/schedule";
import { SCHEDULE_PATH, scheduleWeekOf } from "@domain/share";
import { canWrite } from "@domain/view-as";
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

type Props = { searchParams: Promise<{ week?: string | string[] }> };

// The schedule tab: the published week and the person's own shifts first,
// then the screens around it. Whoever builds the schedule also gets building
// the week (this week's first, while it lacks someone), the team's answers
// and approvals, and each week's draft; someone who builds without publishing,
// none of a published week's short shifts to fill, nor their own requests to
// approve. After giving a shift away here, once, the offer of notifications
// on the phone. `?week=<its first day>` (the link in a shared schedule) opens
// that week while it is this one or the next; whoever builds the schedule
// may share a published week from here, unless viewing as a role.
export default async function SchedulePage(props: Props) {
  const { week: asked } = await props.searchParams;
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
      asked={scheduleWeekOf(typeof asked === "string" ? asked : null, {
        thisWeek: data.thisWeek.start,
        nextWeek: data.nextWeek.start,
      })}
      week={week}
      late={new Date(week.dueAt).getTime() < Date.now()}
      team={team}
      build={build}
      running={running}
      publishes={membership ? publishesSchedule(membership) : false}
      swap={swapAction}
      share={
        team !== null && member && membership && canWrite(member.viewing)
          ? { business: membership.business.name, base: SCHEDULE_PATH }
          : null
      }
      wording={wording}
      ask={ask}
    />
  );
}
