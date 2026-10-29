import {
  type Availability,
  getBusinessPlace,
  getWeek,
  getWeekAvailability,
} from "@db/availability";
import {
  type AvailabilityAnswer,
  availabilityDueAt,
  nextWeekStart,
  type TeamAvailability,
  teamAvailability,
  weekDates,
} from "@domain/availability";
import {
  fridayOf,
  type ShabbatLimits,
  shabbatLimits,
} from "@domain/availability-form";
import { canOpenModule } from "@domain/modules";
import { ISRAELI_CITIES, shabbatTimes } from "@domain/shabbat";
import { canSeeTeam, type TeamMember } from "@domain/team";
import { manifestFor } from "@modules/registry";
import { cache } from "react";
import { currentMember } from "../member";
import { currentModuleSettings, currentModules } from "../modules";
import { currentTeam } from "../team";

export type AvailabilityWeek = {
  /** The week people answer for: the one after this week. */
  start: string;
  dates: string[];
  /** ISO timestamp. */
  dueAt: string;
  timeZone: string;
  /** Set when the business is closed on Shabbat. */
  shabbat: ShabbatLimits | null;
  /** What the signed-in person sent for the week, if anything. */
  mine: Availability | null;
};

/**
 * Next week and every answer the signed-in person may read for it (RLS:
 * their own, or everyone's for a manager or owner), read once per request.
 */
const availabilityContext = cache(
  async (): Promise<{
    week: AvailabilityWeek;
    answers: Availability[];
  } | null> => {
    const [member, enabled] = await Promise.all([
      currentMember(),
      currentModules(),
    ]);
    const membership = member?.membership;
    if (
      !member ||
      !membership ||
      !canOpenModule(manifestFor("scheduling"), enabled, membership.role)
    ) {
      return null;
    }
    const businessId = membership.business.id;
    const [settings, place] = await Promise.all([
      currentModuleSettings("scheduling"),
      getBusinessPlace(businessId),
    ]);
    const { timeZone } = place;
    const start = nextWeekStart(new Date(), timeZone, settings.weekStartsOn);
    const open = await getWeek(businessId, start);
    const answers = open ? await getWeekAvailability(open.id) : [];

    // A business without coordinates yet gets Tel Aviv's times.
    const coordinates =
      place.latitude !== null && place.longitude !== null
        ? { latitude: place.latitude, longitude: place.longitude }
        : ISRAELI_CITIES.telAviv;
    const shabbat = settings.closedOnShabbat
      ? shabbatLimits(
          shabbatTimes({ ...coordinates, timeZone }, fridayOf(start)),
          timeZone,
        )
      : null;

    const week: AvailabilityWeek = {
      start,
      dates: weekDates(start),
      dueAt:
        open?.dueAt ??
        availabilityDueAt(
          start,
          {
            day: settings.availabilityDueDay,
            time: settings.availabilityDueTime,
          },
          timeZone,
        ).toISOString(),
      timeZone,
      shabbat,
      mine: answers.find((a) => a.userId === member.userId) ?? null,
    };
    return { week, answers };
  },
);

/**
 * The week the signed-in person submits availability for. Null when
 * scheduling is off for them. The week may not be open in the database
 * yet; it opens with the first answer.
 */
export const currentAvailabilityWeek = cache(
  async (): Promise<AvailabilityWeek | null> =>
    (await availabilityContext())?.week ?? null,
);

export type TeamAvailabilityWeek = {
  week: AvailabilityWeek;
  team: TeamAvailability<TeamMember, AvailabilityAnswer>;
};

/**
 * Next week's availability for the whole team: who has not sent it and
 * what everyone else sent. Null unless the signed-in person is a manager
 * or owner (or views as one) with scheduling on.
 */
export const currentTeamAvailability = cache(
  async (): Promise<TeamAvailabilityWeek | null> => {
    const member = await currentMember();
    const role = member?.membership?.role;
    if (!role || !canSeeTeam(role)) return null;
    const [context, team] = await Promise.all([
      availabilityContext(),
      currentTeam(),
    ]);
    if (!context || !team) return null;
    return {
      week: context.week,
      team: teamAvailability(team.members, context.answers, context.week.dueAt),
    };
  },
);
