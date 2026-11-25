import {
  type Availability,
  getWeek,
  getWeekAvailability,
  type OpenScheduleWeek,
} from "@db/availability";
import { basisOf, getWeekSchedule, type WeekScheduleShift } from "@db/schedule";
import type { MemberBusiness } from "@db/session";
import { getEndedSwaps, getLiveSwaps } from "@db/swaps";
import { type Colleague, getColleagues } from "@db/team";
import { type AwaySpan, awayWindow } from "@domain/absences";
import {
  type AvailabilityAnswer,
  addDays,
  availabilityDueAt,
  dateIn,
  nextWeekStart,
  type TeamAvailability,
  teamAvailability,
  weekDates,
  weekStartOf,
} from "@domain/availability";
import {
  fridayOf,
  type ShabbatLimits,
  type ShiftHours,
  shabbatLimits,
  shiftHoursOf,
} from "@domain/availability-form";
import { type CopySource, copySourceOf } from "@domain/copy-week";
import { canOpenModule, isStaff } from "@domain/modules";
import { type BuildWeeks, draftAhead, weekBuilt } from "@domain/running-week";
import {
  buildsSchedule,
  publishesSchedule,
  type ScheduledShift,
  type ShiftAsNow,
  type ShiftBasis,
  withKnownPositions,
} from "@domain/schedule";
import { shabbatPlaceOf } from "@domain/shabbat";
import { shabbatTimes } from "@domain/shabbat-times";
import type { Position, ShiftPattern } from "@domain/staffing";
import type { EndedSwap, ShiftSwap } from "@domain/swaps";
import type { TeamMember } from "@domain/team";
import { overnightDay } from "@domain/today";
import { manifestFor } from "@modules/registry";
import { unstable_rethrow } from "next/navigation";
import { cache } from "react";
import { teamAwayFor } from "../clock/absences";
import { currentMember } from "../member";
import { currentModuleSettings, currentModules } from "../modules";
import { currentScheduleTeam } from "../team";

export type AvailabilityWeek = {
  /** The week people answer for: the one after this week. */
  start: string;
  dates: string[];
  /** ISO timestamp. */
  dueAt: string;
  timeZone: string;
  /** Set when the business is closed on Shabbat. */
  shabbat: ShabbatLimits | null;
  /**
   * The hours of the business's regular shifts and the days they run, from
   * the shift pattern the builder draws a week from (the scheduling settings'
   * `shifts`): an empty day in the form opens with that day's
   * (`suggestedDay`). Hours only, never a shift's name or how many it needs.
   */
  shiftHours: ShiftHours[];
  /** What the signed-in person sent for the week, if anything. */
  mine: Availability | null;
};

/**
 * Where Shabbat cuts the week starting on `start`, by the city the business
 * chose, with its custom. Until it chooses one, Tel Aviv's times.
 */
function shabbatOf(
  place: MemberBusiness["place"],
  start: string,
): ShabbatLimits {
  return shabbatLimits(
    shabbatTimes(shabbatPlaceOf(place), fridayOf(start)),
    place.timeZone,
  );
}

/**
 * The moment this request reads the schedule at, once per request, so every
 * read of it agrees on which week is running and what has begun in it.
 */
const requestMoment = cache(() => new Date());

/**
 * Scheduling for the signed-in person, once per request: their business, its
 * settings and which weeks are this one and the next at the request's moment.
 * Null when scheduling is off for them.
 */
const schedulingContext = cache(async () => {
  const [member, enabled] = await Promise.all([
    currentMember(),
    currentModules(),
  ]);
  const membership = member?.membership;
  if (
    !member ||
    !membership ||
    !canOpenModule(manifestFor("scheduling"), enabled, membership)
  ) {
    return null;
  }
  const settings = await currentModuleSettings("scheduling");
  const now = requestMoment();
  const nextWeek = nextWeekStart(
    now,
    membership.business.place.timeZone,
    settings.weekStartsOn,
  );
  const weeks: BuildWeeks = { thisWeek: addDays(nextWeek, -7), nextWeek };
  return {
    member,
    business: membership.business,
    enabled,
    settings,
    now,
    weeks,
  };
});

/**
 * One of the two weeks and every answer the signed-in person may read for it
 * (RLS: their own, or everyone's for whoever builds the schedule), read once
 * per request and week: next week, which people answer for, or the week
 * running now, whose answers were all sent before it began.
 */
const weekContext = cache(
  async (
    start: string,
  ): Promise<{
    week: AvailabilityWeek;
    answers: Availability[];
    /** The week in the database, once someone has opened it. */
    open: OpenScheduleWeek | null;
    positions: Position[];
    patterns: ShiftPattern[];
  } | null> => {
    const scheduling = await schedulingContext();
    if (!scheduling) return null;
    const { member, business, settings } = scheduling;
    const businessId = business.id;
    const { place } = business;
    const { timeZone } = place;
    const open = await getWeek(businessId, start);
    const answers = open ? await getWeekAvailability(open.id) : [];
    const shabbat = settings.closedOnShabbat ? shabbatOf(place, start) : null;

    const week: AvailabilityWeek = {
      start,
      dates: weekDates(start),
      // From the settings, not the week's stored row: a manager who moves the
      // deadline moves it for the week people are answering now.
      dueAt: availabilityDueAt(
        start,
        {
          day: settings.availabilityDueDay,
          time: settings.availabilityDueTime,
        },
        timeZone,
      ).toISOString(),
      timeZone,
      shabbat,
      shiftHours: shiftHoursOf(settings.shifts),
      mine: answers.find((a) => a.userId === member.userId) ?? null,
    };
    return {
      week,
      answers,
      open,
      positions: settings.positions,
      patterns: settings.shifts,
    };
  },
);

/** Next week, which people answer for: see `weekContext`. */
const availabilityContext = cache(async () => {
  const scheduling = await schedulingContext();
  return scheduling ? await weekContext(scheduling.weeks.nextWeek) : null;
});

/**
 * The week the signed-in person submits availability for. Null when
 * scheduling is off for them. The week may not be open in the database
 * yet; it opens with the first answer.
 */
export const currentAvailabilityWeek = cache(
  async (): Promise<AvailabilityWeek | null> =>
    (await availabilityContext())?.week ?? null,
);

/**
 * Whether next week's schedule is out: once it is, a reminder to send
 * availability for it no longer helps. Read from the week already read for
 * the answers, so it costs no query of its own.
 */
export const currentNextWeekPublished = cache(
  async (): Promise<boolean> =>
    Boolean((await availabilityContext())?.open?.schedulePublishedAt),
);

export type TeamAvailabilityWeek = {
  week: AvailabilityWeek;
  team: TeamAvailability<TeamMember, AvailabilityAnswer>;
};

/**
 * Next week's availability for the whole team: who has not sent it and
 * what everyone else sent. Null unless the signed-in person builds the
 * schedule (`buildsSchedule`, or views as a role that does) with scheduling
 * on.
 */
export const currentTeamAvailability = cache(
  async (): Promise<TeamAvailabilityWeek | null> => {
    const member = await currentMember();
    const membership = member?.membership;
    if (!membership || !buildsSchedule(membership)) return null;
    const [context, team] = await Promise.all([
      availabilityContext(),
      currentScheduleTeam(),
    ]);
    if (!context || !team) return null;
    // An accountant is off the staff: they owe no availability.
    const staff = team.members.filter((m) => isStaff(m.role));
    return {
      week: context.week,
      team: teamAvailability(staff, context.answers, context.week.dueAt),
    };
  },
);

export type ScheduleBuildWeek = {
  /**
   * The week being built: next week, or the week running now, whose answers
   * were all sent before it began. Its dates, deadline and Shabbat are its
   * own.
   */
  week: AvailabilityWeek;
  /** ISO timestamp of the last save, or null while it is a draft. */
  savedAt: string | null;
  /** ISO timestamp of the last publish, or null until it is published. */
  publishedAt: string | null;
  /**
   * The saved shifts with their ids, or the week drawn from the shift pattern
   * (no ids).
   */
  shifts: ScheduledShift[];
  /**
   * What was seen of each saved shift, sent back with the week so a change
   * made meanwhile is never undone; null for a week drawn from the pattern,
   * which replaces what is there.
   */
  basis: ShiftBasis | null;
  /** The staff: who can be put on a shift (never an accountant). */
  team: TeamMember[];
  /**
   * Everyone on the team, by name and photo: what has begun keeps whoever was
   * on it, the accountant included, and only someone missing here is no
   * longer on the team.
   */
  people: Pick<TeamMember, "userId" | "name" | "photo">[];
  /** The business has regular shifts, which a week not saved is drawn from. */
  hasPattern: boolean;
  answers: Pick<Availability, "userId" | "ranges">[];
  positions: Position[];
  /**
   * The most hours a week the fill from availability gives anyone, what is
   * on the screen counted: the business's scheduling setting
   * `fillWeekHours` (42 unless it chose otherwise, 4 to 58).
   */
  fillWeekHours: number;
  /**
   * Who on the staff is away on the week's days and the day after it
   * (`awayWindow`: a night on its last day runs into that day; known issue
   * 19), and when: never why. Empty while the time clock is off.
   */
  away: AwaySpan[];
};

export type BuildWeeksNow = BuildWeeks & {
  /** The request's moment (ISO): the builder's clock goes on from it. */
  now: string;
  timeZone: string;
  /** The time clock is on: the hours of a shift that is over are kept there. */
  clock: boolean;
  /**
   * The person publishes the schedule too (`publishesSchedule`): without it
   * they save drafts only, and a published week is theirs to read.
   */
  publishes: boolean;
};

/**
 * The builder's two weeks for whoever builds the schedule (`buildsSchedule`,
 * or someone viewing as a role that does) with scheduling on: the one running
 * now and the next, at the request's moment, with that moment, the
 * business's zone, whether its time clock is on and whether they publish.
 * Null for anyone else.
 */
export const currentBuildWeeks = cache(
  async (): Promise<BuildWeeksNow | null> => {
    const [member, scheduling] = await Promise.all([
      currentMember(),
      schedulingContext(),
    ]);
    const membership = member?.membership;
    if (!membership || !buildsSchedule(membership) || !scheduling) return null;
    return {
      ...scheduling.weeks,
      now: scheduling.now.toISOString(),
      timeZone: scheduling.business.place.timeZone,
      clock: scheduling.enabled.includes("time_clock"),
      publishes: publishesSchedule(membership),
    };
  },
);

/**
 * A week's schedule as its builder builds it, next week unless `start`
 * names the week running now: what was saved, or a draft from the
 * business's shift pattern with nobody on it yet (in the running week only
 * the shifts still to start), and the team with its availability. Null
 * unless the signed-in person builds the schedule (`buildsSchedule`, or
 * views as a role that does) with scheduling on, and for any other week.
 * Memoised per week for the request.
 */
export const currentScheduleBuild = cache(
  async (start?: string): Promise<ScheduleBuildWeek | null> => {
    const [member, scheduling] = await Promise.all([
      currentMember(),
      schedulingContext(),
    ]);
    const membership = member?.membership;
    if (!membership || !buildsSchedule(membership) || !scheduling) return null;
    const { weeks, now, settings } = scheduling;
    const at = start ?? weeks.nextWeek;
    if (at !== weeks.thisWeek && at !== weeks.nextWeek) return null;
    // To the day after the week: a night on its last day runs into it.
    const days = awayWindow(at);
    const [context, team, away] = await Promise.all([
      weekContext(at),
      currentScheduleTeam(),
      teamAwayFor(membership, scheduling.business.id, days.from, days.to),
    ]);
    if (!context || !team) return null;
    const { week, open } = context;
    const savedAt = open?.scheduleSavedAt ?? null;
    const saved = open && savedAt ? await getWeekSchedule(open.id) : null;
    return {
      week,
      savedAt,
      publishedAt: open?.schedulePublishedAt ?? null,
      // Each with its id, so it is written in place.
      shifts: saved
        ? withKnownPositions(
            saved.map(({ seen: _, ...shift }) => shift),
            context.positions.map((p) => p.key),
          )
        : draftAhead(week.start, context.patterns, now, week.timeZone),
      basis: saved ? basisOf(saved) : null,
      // Only people on the staff are put on a shift (never an accountant).
      team: team.members.filter((m) => isStaff(m.role)),
      people: team.members.map(({ userId, name, photo }) => ({
        userId,
        name,
        photo,
      })),
      hasPattern: context.patterns.length > 0,
      answers: context.answers.map(({ userId, ranges }) => ({
        userId,
        ranges,
      })),
      positions: context.positions,
      // As `readModuleSettings` read it: a stored value out of range is the
      // default.
      fillWeekHours: settings.fillWeekHours,
      away,
    };
  },
);

/**
 * The week before the one being built, for "העתקה מהשבוע שעבר": its shifts
 * as stored, once someone built it (`copySourceOf`), for whoever builds the
 * schedule, and only for the builder's two weeks. Building next week, it is
 * the week running now, which the page reads anyway; building the week
 * running now, the one before it, a draft included (RLS: its builders read
 * drafts). Null when there is nothing to copy, and when it can't be read:
 * the builder then offers no copy, and works as before. Memoised per week
 * for the request.
 */
export const currentCopySource = cache(
  async (start: string): Promise<CopySource | null> => {
    const [member, scheduling] = await Promise.all([
      currentMember(),
      schedulingContext(),
    ]);
    const membership = member?.membership;
    if (!membership || !buildsSchedule(membership) || !scheduling) return null;
    const { weeks, business, settings } = scheduling;
    if (start !== weeks.thisWeek && start !== weeks.nextWeek) return null;
    const from = addDays(start, -7);
    const keys = settings.positions.map((p) => p.key);
    try {
      if (from === weeks.thisWeek) {
        const build = await currentScheduleBuild(from);
        return build
          ? copySourceOf(
              {
                start: from,
                savedAt: build.savedAt,
                publishedAt: build.publishedAt,
                shifts: build.shifts,
              },
              keys,
            )
          : null;
      }
      const open = await getWeek(business.id, from);
      if (
        !open ||
        !weekBuilt({
          savedAt: open.scheduleSavedAt,
          publishedAt: open.schedulePublishedAt,
        })
      ) {
        return null;
      }
      const stored = await getWeekSchedule(open.id);
      return copySourceOf(
        {
          start: from,
          savedAt: open.scheduleSavedAt,
          publishedAt: open.schedulePublishedAt,
          shifts: stored.map(({ seen: _, ...shift }) => shift),
        },
        keys,
      );
    } catch (error) {
      unstable_rethrow(error);
      console.error(
        "reading last week to copy failed",
        (error as Error).message,
      );
      return null;
    }
  },
);

/**
 * The week running now as the manager builds it, once someone has built it
 * (saved or published; `weekBuilt`): what the ways into its builder read
 * (the running-week plan's R4, Orel's answer 6 of 15 November 2026), the
 * schedule tab's row and Today's tile and hero, and what the tab's "השבוע"
 * shows managers while it is a draft, as it does next week's. Null for
 * anyone else, and while nobody has built it: a week under way that nobody
 * built is drawn from the shift pattern in the builder alone.
 */
export const currentRunningBuild = cache(
  async (): Promise<ScheduleBuildWeek | null> => {
    const weeks = await currentBuildWeeks();
    if (!weeks) return null;
    const build = await currentScheduleBuild(weeks.thisWeek);
    return build && weekBuilt(build) ? build : null;
  },
);

/** The requests on the given shifts only. */
const onShifts = (
  swaps: readonly ShiftSwap[],
  shifts: readonly Pick<ScheduledShift, "id">[],
): ShiftSwap[] => {
  const ids = new Set(shifts.flatMap((s) => (s.id ? [s.id] : [])));
  return swaps.filter((swap) => ids.has(swap.shiftId));
};

/**
 * The waiting swap requests (open, or taken and waiting for a manager) on
 * the week being built (next week unless `start` names the running one),
 * for the warning before publishing: how many the changes on the screen
 * would end (`swapsEndedBy`). Only a published week has any. Read for the
 * builder's page alone, not for the counts that `currentScheduleBuild` gives
 * Today and the schedule tab.
 */
export const currentBuildSwaps = cache(
  async (start?: string): Promise<ShiftSwap[]> => {
    const [member, build] = await Promise.all([
      currentMember(),
      currentScheduleBuild(start),
    ]);
    const businessId = member?.membership?.business.id;
    if (!businessId || !build?.publishedAt) return [];
    return onShifts(await getLiveSwaps(businessId), build.shifts);
  },
);

/**
 * A week's shifts as they are now, each with what is seen of it, and the
 * waiting requests on them: read again, uncached, after a save or publish
 * was refused because shifts changed meanwhile (`weekMoved`), so the builder
 * puts those shifts back as they are. A position the business no longer has
 * shows as none, as everywhere in the builder (`withKnownPositions`).
 */
export async function weekAsNow(
  businessId: string,
  weekId: string,
  positionKeys: readonly string[],
): Promise<{ shifts: ShiftAsNow[]; swaps: ShiftSwap[] }> {
  const [stored, swaps] = await Promise.all([
    getWeekSchedule(weekId),
    getLiveSwaps(businessId),
  ]);
  const shifts = withKnownPositions(
    stored.flatMap(({ seen, ...shift }) =>
      seen === null ? [] : [{ ...shift, seen }],
    ),
    positionKeys,
  );
  return { shifts, swaps: onShifts(swaps, shifts) };
}

export type PublishedWeek = {
  start: string;
  dates: string[];
  /** ISO timestamp of the last publish, or null while not published. */
  publishedAt: string | null;
  /** The published shifts, with their ids; empty until published. */
  shifts: WeekScheduleShift[];
  /** Set when the business is closed on Shabbat. */
  shabbat: ShabbatLimits | null;
};

export type PublishedSchedule = {
  /** The signed-in person, to find their own shifts. */
  userId: string;
  /** Today in the business's zone. */
  today: string;
  /**
   * The moment the server read it (ISO), for what depends on the hour: a
   * shift that has begun is no longer given away or taken (`shiftStarted`).
   */
  now: string;
  timeZone: string;
  thisWeek: PublishedWeek;
  nextWeek: PublishedWeek;
  /**
   * On the week's first day, the published shifts of the day before, since
   * one past midnight may still be on; empty on any other day.
   */
  overnight: WeekScheduleShift[];
  people: Colleague[];
  positions: Position[];
  /** Live shift swaps of the business (open, or waiting for a manager). */
  swaps: ShiftSwap[];
  /**
   * Requests that no longer wait, on shifts from today on (`getEndedSwaps`):
   * what became of them, for whoever asked or took one and for the board.
   */
  endedSwaps: EndedSwap[];
  /**
   * Who is away over the two weeks and the day after them (`awayWindow`: a
   * night on next week's last day runs into that day; known issue 107), and
   * when (known issue 19), for whoever builds the schedule: never why. Null
   * for everyone else.
   */
  away: AwaySpan[] | null;
};

/**
 * This week's and next week's schedule as the team reads it: published
 * weeks only (RLS keeps drafts with its builders). For everyone in the
 * business with scheduling on; null otherwise.
 */
export const currentPublishedSchedule = cache(
  async (): Promise<PublishedSchedule | null> => {
    const [member, enabled] = await Promise.all([
      currentMember(),
      currentModules(),
    ]);
    const membership = member?.membership;
    if (
      !member ||
      !membership ||
      !canOpenModule(manifestFor("scheduling"), enabled, membership)
    ) {
      return null;
    }
    const businessId = membership.business.id;
    const settings = await currentModuleSettings("scheduling");
    const { place } = membership.business;
    const { timeZone } = place;
    const now = new Date();
    const today = dateIn(now, timeZone);
    const thisStart = weekStartOf(today, settings.weekStartsOn);

    const published = async (start: string): Promise<PublishedWeek> => {
      const open = await getWeek(businessId, start);
      const publishedAt = open?.schedulePublishedAt ?? null;
      const shifts =
        open && publishedAt
          ? withKnownPositions(
              // What was seen is the builder's alone.
              (await getWeekSchedule(open.id)).map(
                ({ seen: _, ...shift }) => shift,
              ),
              settings.positions.map((p) => p.key),
            )
          : [];
      return {
        start,
        dates: weekDates(start),
        publishedAt,
        shifts,
        shabbat: settings.closedOnShabbat ? shabbatOf(place, start) : null,
      };
    };
    const yesterday = overnightDay(today, thisStart);
    // To the day after next week: a night on its last day runs into it.
    const awayDays = awayWindow(thisStart, 2);
    const [thisWeek, nextWeek, overnight, swaps, endedSwaps, people, away] =
      await Promise.all([
        published(thisStart),
        published(addDays(thisStart, 7)),
        yesterday
          ? published(addDays(thisStart, -7)).then((week) =>
              week.shifts.filter((shift) => shift.day === yesterday),
            )
          : [],
        getLiveSwaps(businessId),
        getEndedSwaps(businessId, today),
        getColleagues(businessId),
        buildsSchedule(membership)
          ? teamAwayFor(membership, businessId, awayDays.from, awayDays.to)
          : null,
      ]);
    return {
      userId: member.userId,
      today,
      now: now.toISOString(),
      timeZone,
      thisWeek,
      nextWeek,
      overnight,
      people,
      positions: settings.positions,
      swaps,
      endedSwaps,
      away,
    };
  },
);
