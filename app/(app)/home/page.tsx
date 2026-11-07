import { moduleWidgets } from "@domain/modules";
import { manifests } from "@modules/registry";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { signOut } from "../../(auth)/actions";
import { currentClockLine } from "../clock/clock";
import { renewDemoWeek } from "../demo";
import { currentMember } from "../member";
import { currentModules } from "../modules";
import {
  currentAvailabilityWeek,
  currentPublishedSchedule,
  currentScheduleBuild,
  currentTeamAvailability,
} from "../schedule/week";
import { currentTeam } from "../team";
import { TodayView } from "./today-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.home");
  return { title: t("metaTitle") };
}

// Today: what is next for the person and what needs them, from the enabled
// modules. Each read below is null when its module is off or the person's
// role does not reach it.
export default async function HomePage() {
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
  ] = await Promise.all([
    currentMember(),
    currentModules(),
    currentTeam(),
    currentPublishedSchedule(),
    currentAvailabilityWeek(),
    currentTeamAvailability(),
    currentScheduleBuild(),
    currentClockLine(),
  ]);
  const membership = member?.membership;
  // The layout has already sent these people elsewhere.
  if (!member || !membership) return null;

  return (
    <TodayView
      signOut={signOut}
      data={{
        now: new Date().toISOString(),
        timeZone: published?.timeZone ?? membership.business.place.timeZone,
        name: member.name,
        role: membership.role,
        businessName: membership.business.name,
        widgets: moduleWidgets(manifests, enabled, membership.role),
        clockLine,
        schedule:
          published && availability
            ? { published, availability, teamAvailability, build }
            : null,
        team,
      }}
    />
  );
}
