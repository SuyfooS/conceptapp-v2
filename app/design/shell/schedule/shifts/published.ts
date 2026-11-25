import type { AwaySpan } from "@domain/absences";
import { addDays, teamAvailability, weekDates } from "@domain/availability";
import { fridayOf, shabbatLimits } from "@domain/availability-form";
import { FILL_WEEK_HOURS } from "@domain/fill-week";
import { draftWeek } from "@domain/schedule";
import { ISRAEL_TIME_ZONE, ISRAELI_CITIES } from "@domain/shabbat";
import { shabbatTimes } from "@domain/shabbat-times";
import type {
  EndedSwap,
  ShiftSwap,
  SwapOutcome,
  SwapShift,
} from "@domain/swaps";
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

// The demo week's shifts by id, as the published week names them.
const demoShifts = new Map(
  draftWeek(demoWeek.start, demoShiftPatterns).map((s) => [
    `${s.day}/${s.pattern}`,
    s,
  ]),
);

/** The shift a demo request asked for: the week's own, as it is. */
function askedFor(id: string): SwapShift {
  const shift = demoShifts.get(id);
  if (!shift) throw new Error(`No demo shift ${id}`);
  return {
    day: shift.day,
    name: shift.name,
    start: shift.start,
    end: shift.end,
  };
}

/**
 * A demo request that no longer waits, on `shiftId` (null once deleted),
 * with the shift it asked for: the week's own unless `shift` says otherwise.
 */
const demoEnded = (
  n: string,
  shiftId: string | null,
  requestedBy: string,
  takenBy: string | null,
  outcome: SwapOutcome,
  decidedBy: string | null,
  createdAt: string,
  shift: SwapShift = askedFor(shiftId ?? ""),
): EndedSwap => ({
  id: `00000000-0000-4000-a000-0000000001${n}`,
  shiftId,
  shift,
  requestedBy,
  takenBy,
  outcome,
  decidedBy,
  createdAt,
});

/**
 * What became of the demo's requests that no longer wait, as Noa and
 * Shiran read them on Tuesday 3 November: Noa's evening tonight, which Maya
 * took, was declined by Shiran; her Thursday evening asked for when it
 * started at 17:00, and the schedule cancelled it when it moved to 16:00;
 * Shira works her Wednesday evening, which Shiran approved; Uri declined
 * Omer's Wednesday morning, which Noa took; and Yoav cancelled his request
 * for a Thursday morning shift Noa took, deleted since. Noa's Friday, asked
 * again (`demoRequest` 1), hides the one she withdrew there, and Monday's
 * is before today.
 */
export const DEMO_ENDED: EndedSwap[] = [
  demoEnded(
    "01",
    "2026-11-03/evening",
    "noa",
    "maya",
    "declined",
    "shiran",
    "2026-11-02T09:00:00.000Z",
  ),
  demoEnded(
    "02",
    "2026-11-05/evening",
    "noa",
    null,
    "schedule",
    null,
    "2026-11-01T18:00:00.000Z",
    { ...askedFor("2026-11-05/evening"), start: "17:00" },
  ),
  demoEnded(
    "03",
    "2026-11-04/evening",
    "noa",
    "shira",
    "approved",
    "shiran",
    "2026-11-01T10:00:00.000Z",
  ),
  demoEnded(
    "04",
    "2026-11-04/morning",
    "omer",
    "noa",
    "declined",
    "uri",
    "2026-11-01T12:00:00.000Z",
  ),
  demoEnded(
    "05",
    null,
    "yoav",
    "noa",
    "withdrawn",
    null,
    "2026-10-31T16:00:00.000Z",
    { ...askedFor("2026-11-05/morning"), start: "10:00", end: "15:00" },
  ),
  demoEnded(
    "06",
    "2026-11-06/friday",
    "noa",
    null,
    "withdrawn",
    null,
    "2026-10-30T12:00:00.000Z",
  ),
  demoEnded(
    "07",
    "2026-11-02/morning",
    "noa",
    "shira",
    "approved",
    "shiran",
    "2026-10-30T09:00:00.000Z",
  ),
];

const limitsOf = (start: string) =>
  shabbatLimits(
    shabbatTimes(ISRAELI_CITIES.telAviv, fridayOf(start)),
    ISRAEL_TIME_ZONE,
  );

const NEXT_WEEK = addDays(demoWeek.start, 7);

/** Tuesday 3 November at 12:00 in Tel Aviv: the morning shift is on. */
export const DEMO_NOON = "2026-11-03T10:00:00.000Z";

/**
 * The demo restaurant's schedule as `userId` reads it on Tuesday
 * 3 November, at noon unless `now` says otherwise: this week published,
 * next week not yet. `endedSwaps`: requests that no longer wait (`DEMO_ENDED`).
 */
export function demoPublished(
  userId: string,
  swaps: ShiftSwap[],
  now: string = DEMO_NOON,
  endedSwaps: EndedSwap[] = [],
): PublishedSchedule {
  const start = demoWeek.start;
  return {
    userId,
    today: "2026-11-03",
    now,
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
    people: teamMembers.map(
      ({ userId, name, role, namedRole, photo, addressForm }) => ({
        userId,
        name,
        role,
        namedRole: namedRole?.id ?? null,
        photo,
        addressForm,
      }),
    ),
    positions: demoPositions,
    swaps,
    endedSwaps,
    // Nobody away, unless a twin says so (`demoAway`).
    away: null,
  };
}

/**
 * Noa away on Tuesday and Wednesday of the demo's week (`?away=1`, known
 * issue 19): her Tuesday evening says so to whoever builds the schedule, and
 * Today lists her among those away. Never why.
 */
export const demoAway: AwaySpan[] = [
  { userId: "noa", from: "2026-11-03", to: "2026-11-04" },
];

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
  ended: EndedSwap[] = [],
): Omit<ScheduleViewProps, "swap"> => ({
  data: demoPublished("noa", swaps, DEMO_NOON, ended),
  week: demoNextWeek(null),
  late: false,
  team: null,
  build: null,
  running: null,
});

/**
 * The demo's published week as its manager builds it, for the ways into its
 * builder: what this week still lacks among its shifts still to start.
 */
export function demoRunningBuild(
  data: PublishedSchedule,
  team: ScheduleBuildWeek["team"],
): ScheduleBuildWeek | null {
  const { thisWeek } = data;
  if (thisWeek.publishedAt === null) return null;
  return {
    week: { ...demoWeek, start: thisWeek.start, dates: thisWeek.dates },
    savedAt: thisWeek.publishedAt,
    publishedAt: thisWeek.publishedAt,
    shifts: thisWeek.shifts,
    basis: null,
    team,
    // As the app reads them: names and photos only.
    people: team.map(({ userId, name, photo }) => ({ userId, name, photo })),
    hasPattern: true,
    answers: teamAnswers,
    positions: demoPositions,
    away: [],
    fillWeekHours: FILL_WEEK_HOURS,
  };
}

/**
 * The demo's schedule tab as Shiran, the shift manager, with next week's
 * draft, and this week's shifts still to start that lack someone first.
 */
export function demoManagerSchedule(
  swaps: ShiftSwap[],
  ended: EndedSwap[] = [],
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
    basis: null,
    team: members,
    people: members,
    hasPattern: true,
    answers: teamAnswers,
    positions: demoPositions,
    away: [],
    fillWeekHours: FILL_WEEK_HOURS,
  };
  const data = demoPublished("shiran", swaps, DEMO_NOON, ended);
  return {
    data,
    week,
    late: false,
    team: {
      week,
      team: teamAvailability(members, teamAnswers, demoWeek.dueAt),
    },
    build,
    running: demoRunningBuild(data, members),
  };
}
