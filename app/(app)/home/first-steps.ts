import "server-only";
import { getDepartments } from "@db/departments";
import { hasPublishedWeek } from "@db/schedule";
import type { MemberBusiness } from "@db/session";
import {
  FIRST_STEPS_HIDDEN_COOKIE,
  type FirstStepsData,
  type FirstStepsFacts,
  firstSteps,
  firstStepsHidden,
  NO_TEAM_PROGRESS,
  stepsLeft,
  teamProgress,
} from "@domain/first-steps";
import { isDemoBusiness } from "@domain/passive-sign-in";
import { shabbatCityOf } from "@domain/shabbat";
import { canWrite } from "@domain/view-as";
import { cookies } from "next/headers";
import { cache } from "react";
import { shabbatCityState } from "../manage/manage";
import { currentMember } from "../member";
import { currentModuleSettings, currentModules } from "../modules";
import { currentTeam } from "../team";

/**
 * The owner's first steps for Today, once per request (`@domain/first-steps`),
 * from what the business already holds, each read under the owner's own
 * session: the team, the modules' settings, the departments and whether a
 * week was ever published. Null for anyone but an owner, in a demo business
 * (shown as one already at work, and the restaurant's week isn't published
 * after each reset), once every counted step is done, and when the owner hid
 * them on this device. The ConceptApp team viewing as the owner reads them
 * whatever their own device says, with no way to hide them. A failed read
 * leaves the card out rather than Today.
 */
export const currentFirstSteps = cache(
  async (): Promise<FirstStepsData | null> => {
    const member = await currentMember();
    const membership = member?.membership;
    if (!member || membership?.role !== "owner") return null;
    const { business } = membership;
    if (isDemoBusiness(business.slug)) return null;
    const viewing = !canWrite(member.viewing);
    if (
      !viewing &&
      firstStepsHidden(
        (await cookies()).get(FIRST_STEPS_HIDDEN_COOKIE)?.value,
        business.id,
      )
    ) {
      return null;
    }
    try {
      const steps = firstSteps(await factsOf(business));
      return stepsLeft(steps) === 0 ? null : { steps, hides: !viewing };
    } catch (error) {
      console.error(
        "reading the first steps failed",
        (error as { code?: string }).code ?? "without a code",
      );
      return null;
    }
  },
);

/** What the steps are worked out from; a module that is off isn't read. */
async function factsOf(business: MemberBusiness): Promise<FirstStepsFacts> {
  const enabled = await currentModules();
  const [team, scheduling, lists, timeClock] = await Promise.all([
    currentTeam(),
    enabled.includes("scheduling")
      ? Promise.all([
          currentModuleSettings("scheduling"),
          hasPublishedWeek(business.id),
        ]).then(([settings, published]) => ({
          positions: settings.positions.length,
          patterns: settings.shifts.length,
          published,
        }))
      : null,
    enabled.includes("lists")
      ? getDepartments(business.id).then((departments) => {
          // Before the departments' migration reaches a project, none.
          const live =
            departments === "notYet"
              ? []
              : departments.filter((d) => d.archivedAt === null);
          return {
            departments: live.length,
            empty: live.filter((d) => d.members.length === 0).length,
          };
        })
      : null,
    enabled.includes("time_clock")
      ? currentModuleSettings("time_clock").then((settings) => ({
          requirePunchCode: settings.requirePunchCode,
        }))
      : null,
  ]);
  return {
    // An owner always sees the team; none would read as nobody joined.
    team: team ? teamProgress(team) : NO_TEAM_PROGRESS,
    details: {
      address: business.address,
      // As /manage asks for it: only where the schedule closes on Shabbat.
      cityMissing:
        shabbatCityState(business.modules, {
          name: business.name,
          accent: business.accent,
          address: business.address,
          shabbatCity: shabbatCityOf(business.place.shabbatCity),
        }) === "missing",
    },
    scheduling,
    lists,
    timeClock,
  };
}
