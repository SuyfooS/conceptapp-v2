import { isStaff, moduleWidgets } from "@domain/modules";
import { profilePhotoSrc } from "@domain/profile-photos";
import { manifests } from "@modules/registry";
import type { Metadata } from "next";
import { currentClockLine } from "../clock/clock";
import { currentPayHome } from "../clock/pay/pay";
import { currentWording } from "../current-wording";
import { renewDemoWeek } from "../demo";
import { currentListsHome } from "../lists/lists";
import { currentMember } from "../member";
import { currentModules } from "../modules";
import {
  currentAvailabilityWeek,
  currentPublishedSchedule,
  currentScheduleBuild,
  currentTeamAvailability,
} from "../schedule/week";
import { currentTeam } from "../team";
import { baseWording, translator } from "../wording";
import { AccountantHome } from "./accountant-home";
import { TodayView } from "./today-view";

export async function generateMetadata(): Promise<Metadata> {
  // Page titles stay in the app's own words.
  const t = translator(baseWording, "app.home");
  return { title: t("metaTitle") };
}

// Today: what is next for the person and what needs them, from the enabled
// modules. Each read below is null when its module is off or the person's
// role does not reach it. Someone off the staff (an accountant) has a Home of
// their own: the month to pay, with nothing to punch and no schedule.
export default async function HomePage() {
  const viewer = await currentMember();
  const role = viewer?.membership?.role;
  if (viewer?.membership && role && !isStaff(role)) {
    return <OutsideStaffHome />;
  }
  await renewDemoWeek();
  const [
    member,
    enabled,
    team,
    published,
    availability,
    teamAvailability,
    build,
    clockLine,
    lists,
    wording,
  ] = await Promise.all([
    currentMember(),
    currentModules(),
    currentTeam(),
    currentPublishedSchedule(),
    currentAvailabilityWeek(),
    currentTeamAvailability(),
    currentScheduleBuild(),
    currentClockLine(),
    currentListsHome(),
    currentWording(),
  ]);
  const membership = member?.membership;
  // The layout has already sent these people elsewhere.
  if (!member || !membership) return null;

  return (
    <TodayView
      wording={wording}
      data={{
        now: new Date().toISOString(),
        timeZone: published?.timeZone ?? membership.business.place.timeZone,
        name: member.name,
        photo: profilePhotoSrc(member.photoPath),
        role: membership.role,
        businessName: membership.business.name,
        widgets: moduleWidgets(manifests, enabled, membership),
        clockLine,
        schedule:
          published && availability
            ? { published, availability, teamAvailability, build }
            : null,
        team,
        // The bell, while notifications are on and the person is themselves.
        bell:
          enabled.includes("notifications") && !member.viewing
            ? { unread: member.unread.all }
            : null,
        lists,
      }}
    />
  );
}

/**
 * The accountant's Home. Without pay access in this business (the clock is
 * off) it says the hours come once the clock is on, rather than Today's line
 * about modules, which other modules being on would make untrue.
 */
async function OutsideStaffHome() {
  const [member, enabled, pay, wording] = await Promise.all([
    currentMember(),
    currentModules(),
    currentPayHome(),
    currentWording(),
  ]);
  const membership = member?.membership;
  if (!member || !membership) return null;
  return (
    <AccountantHome
      wording={wording}
      data={{
        now: new Date().toISOString(),
        timeZone: membership.business.place.timeZone,
        name: member.name,
        photo: profilePhotoSrc(member.photoPath),
        businessName: membership.business.name,
        pay,
        bell:
          enabled.includes("notifications") && !member.viewing
            ? { unread: member.unread.all }
            : null,
      }}
    />
  );
}
