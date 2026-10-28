import {
  type Availability,
  getBusinessPlace,
  getWeek,
  getWeekAvailability,
} from "@db/availability";
import {
  availabilityDueAt,
  nextWeekStart,
  weekDates,
} from "@domain/availability";
import {
  fridayOf,
  type ShabbatLimits,
  shabbatLimits,
} from "@domain/availability-form";
import { canOpenModule } from "@domain/modules";
import { ISRAELI_CITIES, shabbatTimes } from "@domain/shabbat";
import { manifestFor } from "@modules/registry";
import { cache } from "react";
import { currentMember } from "../member";
import { currentModuleSettings, currentModules } from "../modules";

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
 * The week the signed-in person submits availability for, read once per
 * request. Null when scheduling is off for them. The week may not be open
 * in the database yet; it opens with the first answer.
 */
export const currentAvailabilityWeek = cache(
  async (): Promise<AvailabilityWeek | null> => {
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
    const week = await getWeek(businessId, start);
    const answers = week ? await getWeekAvailability(week.id) : [];

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

    return {
      start,
      dates: weekDates(start),
      dueAt:
        week?.dueAt ??
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
  },
);
