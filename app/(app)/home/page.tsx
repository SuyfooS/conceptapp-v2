import { manageReach } from "@domain/manage-access";
import { isStaff, moduleWidgets } from "@domain/modules";
import { profilePhotoSrc } from "@domain/profile-photos";
import { buildsSchedule, publishesSchedule } from "@domain/schedule";
import { manifests } from "@modules/registry";
import type { Metadata } from "next";
import { signOut } from "../../(auth)/actions";
import { currentBusinesses } from "../businesses";
import { currentChatHome } from "../chat/chat";
import { currentDocumentsHome } from "../chat/documents/documents";
import { currentClockLine } from "../clock/clock";
import { currentPayHome } from "../clock/pay/pay";
import { lockDeviceAction } from "../clock/station/actions";
import { currentStationHome } from "../clock/station/station";
import { currentWording } from "../current-wording";
import { renewDemoWeek } from "../demo";
import { currentListsHome } from "../lists/lists";
import { currentFileToday } from "../me/file/file";
import { currentMember } from "../member";
import { currentModeRows } from "../mode-rows";
import { currentModules } from "../modules";
import {
  currentAvailabilityWeek,
  currentPublishedSchedule,
  currentRunningBuild,
  currentScheduleBuild,
  currentTeamAvailability,
} from "../schedule/week";
import { currentTeam } from "../team";
import { baseWording, translator } from "../wording";
import { AccountantHome } from "./accountant-home";
import { currentFirstSteps } from "./first-steps";
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
    running,
    clockLine,
    lists,
    chat,
    documents,
    wording,
    businesses,
    station,
    firstSteps,
    modes,
    file,
  ] = await Promise.all([
    currentMember(),
    currentModules(),
    currentTeam(),
    currentPublishedSchedule(),
    currentAvailabilityWeek(),
    currentTeamAvailability(),
    currentScheduleBuild(),
    currentRunningBuild(),
    currentClockLine(),
    currentListsHome(),
    currentChatHome(),
    currentDocumentsHome(),
    currentWording(),
    currentBusinesses(),
    currentStationHome(),
    currentFirstSteps(),
    // The modes the person is in: a card while open to them, else a row.
    currentWording().then((words) => currentModeRows("home", words)),
    // The person's own hiring file, where it is on for them (H5b).
    currentFileToday(),
  ]);
  const membership = member?.membership;
  // The layout has already sent these people elsewhere.
  if (!member || !membership) return null;

  return (
    <TodayView
      wording={wording}
      businesses={businesses}
      hideFirstStepsUrl="/home/first-steps"
      lockStation={lockDeviceAction}
      signOut={signOut}
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
            ? {
                published,
                availability,
                builds: buildsSchedule(membership),
                publishes: publishesSchedule(membership),
                teamAvailability,
                build,
                running,
              }
            : null,
        team,
        // The management page, for those who hold manage.view.
        manage: manageReach(membership) !== null,
        // The bell, while notifications are on and the person is themselves.
        bell:
          enabled.includes("notifications") && !member.viewing
            ? { unread: member.unread.all }
            : null,
        lists,
        chat,
        documents,
        // This device is the business's clock station: lock it again, or
        // sign out when done.
        station,
        // An owner's business still being set up: what to do first.
        firstSteps,
        modes,
        // What is missing of the person's own file, and an account changed.
        file,
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
  const [member, enabled, pay, documents, wording, businesses, station] =
    await Promise.all([
      currentMember(),
      currentModules(),
      currentPayHome(),
      currentDocumentsHome(),
      currentWording(),
      currentBusinesses(),
      currentStationHome(),
    ]);
  const membership = member?.membership;
  if (!member || !membership) return null;
  return (
    <AccountantHome
      wording={wording}
      businesses={businesses}
      signOut={signOut}
      data={{
        now: new Date().toISOString(),
        timeZone: membership.business.place.timeZone,
        name: member.name,
        photo: profilePhotoSrc(member.photoPath),
        businessName: membership.business.name,
        pay,
        documents,
        bell:
          enabled.includes("notifications") && !member.viewing
            ? { unread: member.unread.all }
            : null,
        // This device is the business's clock station: sign out when done.
        station,
      }}
    />
  );
}
