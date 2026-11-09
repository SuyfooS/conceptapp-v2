import { addDays, teamAvailability, weekDates } from "@domain/availability";
import { fridayOf, shabbatLimits } from "@domain/availability-form";
import { draftWeek } from "@domain/schedule";
import { ISRAEL_TIME_ZONE, ISRAELI_CITIES } from "@domain/shabbat";
import { shabbatTimes } from "@domain/shabbat-times";
import type { ShiftSwap } from "@domain/swaps";
import { buildTeam } from "@domain/team";
import type { ScheduleViewProps } from "../../../../(app)/schedule/schedule-view";
import type {
  AvailabilityWeek,
  PublishedSchedule,
  ScheduleBuildWeek,
} from "../../../../(app)/schedule/week";
import {
  demoPositions,
  demoShiftPatterns,
  teamAnswers,
  teamInvites,
  teamMembers,
  teamToday,
} from "../../data";
import { demoWeek } from "../availability/week";

// Who works which shift in the demo's published week (by day and pattern),
// and in which position.
const placed: Record<string, [string, string | null][]> = {
  "2026-11-01/morning": [
    ["noa", "waiter"],
    ["itay", "cook"],
    ["maya", "waiter"],
  ],
  "2026-11-01/evening": [
    ["shiran", null],
    ["yoav", "bartender"],
    ["omer", "cook"],
  ],
  "2026-11-02/morning": [
    ["maya", "waiter"],
    ["itay", "cook"],
    ["shira", "host"],
  ],
  "2026-11-02/evening": [
    ["yoav", "bartender"],
    ["omer", "cook"],
    ["shiran", null],
  ],
  "2026-11-03/morning": [
    ["shira", "host"],
    ["omer", "cook"],
    ["shiran", null],
  ],
  "2026-11-03/evening": [
    ["noa", "waiter"],
    ["yoav", "bartender"],
    ["itay", "cook"],
  ],
  "2026-11-04/morning": [
    ["maya", "waiter"],
    ["omer", "cook"],
  ],
  "2026-11-04/evening": [
    ["yoav", "bartender"],
    ["itay", "cook"],
    ["shira", "host"],
    ["shiran", null],
  ],
  "2026-11-05/morning": [
    ["maya", "waiter"],
    ["itay", "cook"],
    ["shira", "host"],
  ],
  "2026-11-05/evening": [
    ["yoav", "bartender"],
    ["omer", "cook"],
    ["noa", "waiter"],
    ["shiran", null],
  ],
  "2026-11-06/friday": [
    ["noa", null],
    ["shira", "host"],
    ["maya", "waiter"],
    ["itay", "cook"],
  ],
  "2026-11-07/saturday-night": [
    ["yoav", "bartender"],
    ["omer", "cook"],
    ["shiran", null],
  ],
};

// Next week's draft, while the manager builds it: only Sunday has people yet.
const drafted: Record<string, [string, string | null][]> = {
  "2026-11-08/morning": [
    ["noa", "waiter"],
    ["itay", "cook"],
  ],
  "2026-11-08/evening": [["shiran", null]],
};

/** A demo swap request; taken when someone took it. */
export const demoRequest = (
  id: string,
  shiftId: string,
  requestedBy: string,
  takenBy: string | null = null,
): ShiftSwap => ({
  id: `00000000-0000-4000-a000-00000000000${id}`,
  shiftId,
  requestedBy,
  takenBy,
  status: takenBy ? "taken" : "open",
});

const limitsOf = (start: string) =>
  shabbatLimits(
    shabbatTimes(ISRAELI_CITIES.telAviv, fridayOf(start)),
    ISRAEL_TIME_ZONE,
  );

const NEXT_WEEK = addDays(demoWeek.start, 7);

/**
 * The demo restaurant's schedule as `userId` reads it on Tuesday
 * 3 November: this week published, next week not yet.
 */
export function demoPublished(
  userId: string,
  swaps: ShiftSwap[],
): PublishedSchedule {
  const start = demoWeek.start;
  return {
    userId,
    today: "2026-11-03",
    timeZone: ISRAEL_TIME_ZONE,
    thisWeek: {
      start,
      dates: weekDates(start),
      publishedAt: "2026-10-29T15:40:00.000Z",
      shifts: draftWeek(start, demoShiftPatterns).map((s) => ({
        ...s,
        id: `${s.day}/${s.pattern}`,
        assignees: (placed[`${s.day}/${s.pattern}`] ?? []).map(
          ([user, position]) => ({ user, position }),
        ),
      })),
      shabbat: limitsOf(start),
    },
    nextWeek: {
      start: NEXT_WEEK,
      dates: weekDates(NEXT_WEEK),
      publishedAt: null,
      shifts: [],
      shabbat: limitsOf(NEXT_WEEK),
    },
    overnight: [],
    people: teamMembers.map(({ userId, name, photo, addressForm }) => ({
      userId,
      name,
      photo,
      addressForm,
    })),
    positions: demoPositions,
    swaps,
  };
}

/** Next week, for the demo's availability rows: due Wednesday at 18:00. */
const demoNextWeek = (mine: AvailabilityWeek["mine"]): AvailabilityWeek => ({
  ...demoWeek,
  start: NEXT_WEEK,
  dates: weekDates(NEXT_WEEK),
  dueAt: "2026-11-04T16:00:00.000Z",
  shabbat: limitsOf(NEXT_WEEK),
  mine,
});

/** The demo's schedule tab as Noa, a worker, who has not sent availability. */
export const demoWorkerSchedule = (
  swaps: ShiftSwap[],
): Omit<ScheduleViewProps, "swap"> => ({
  data: demoPublished("noa", swaps),
  week: demoNextWeek(null),
  late: false,
  team: null,
  build: null,
});

/** The demo's schedule tab as Shiran, the shift manager, with next week's draft. */
export function demoManagerSchedule(
  swaps: ShiftSwap[],
): Omit<ScheduleViewProps, "swap"> {
  const { members } = buildTeam(teamMembers, teamInvites, teamToday);
  const week = demoNextWeek(demoWeek.mine);
  const build: ScheduleBuildWeek = {
    week,
    savedAt: null,
    publishedAt: null,
    shifts: draftWeek(NEXT_WEEK, demoShiftPatterns).map((s) => ({
      ...s,
      assignees: (drafted[`${s.day}/${s.pattern}`] ?? []).map(
        ([user, position]) => ({ user, position }),
      ),
    })),
    team: members,
    answers: teamAnswers,
    positions: demoPositions,
  };
  return {
    data: demoPublished("shiran", swaps),
    week,
    late: false,
    team: {
      week,
      team: teamAvailability(members, teamAnswers, demoWeek.dueAt),
    },
    build,
  };
}
