import { addDays, teamAvailability, weekDates } from "@domain/availability";
import { type ModuleKey, moduleWidgets, type Role } from "@domain/modules";
import { draftWeek, type ShiftAssignee } from "@domain/schedule";
import type { ShiftSwap } from "@domain/swaps";
import { buildTeam } from "@domain/team";
import { manifests } from "@modules/registry";
import type { TodayData, TodaySchedule } from "../../../(app)/home/today-view";
import type {
  AvailabilityWeek,
  PublishedSchedule,
  ScheduleBuildWeek,
} from "../../../(app)/schedule/week";
import {
  business,
  demoShiftPatterns,
  teamAnswers,
  teamInvites,
  teamMembers,
  teamToday,
} from "../data";
import { demoListsHome, demoWorkerLists } from "../lists/data";
import { demoUnread } from "../notifications/data";
import { demoWeek } from "../schedule/availability/week";
import {
  demoPublished,
  demoRequest,
  demoRunningBuild,
} from "../schedule/shifts/published";

// The demo restaurant on Tuesday 3 November 2026 at 08:12 in Tel Aviv: this
// week's schedule is published, with four places still open in what is still
// to start (this evening, tomorrow morning, Friday and Saturday night), and
// next week's is being built. A manager sees this week's first.
const NOW = "2026-11-03T06:12:00.000Z";
const NEXT_WEEK = addDays(demoWeek.start, 7);

/** The modules in the demo's navigation. */
const DEMO_MODULES: ModuleKey[] = ["scheduling", "lists"];

// This morning's shift, added to the demo's published week.
const THIS_MORNING: ShiftAssignee[] = [
  { user: "shiran", position: "host" },
  { user: "maya", position: "waiter" },
  { user: "omer", position: "cook" },
];

// Noa gives Friday away and nobody took it yet; Itay took Maya's Wednesday
// morning and Noa took Yoav's Saturday night, so those two wait for a manager.
const SWAPS: ShiftSwap[] = [
  demoRequest("1", "2026-11-06/friday", "noa"),
  demoRequest("2", "2026-11-04/morning", "maya", "itay"),
  demoRequest("3", "2026-11-07/saturday-night", "yoav", "noa"),
];

// As Noa reads them: she gives Friday away, Maya's Wednesday morning is hers
// to take, and she took Yoav's Saturday night, which waits for a manager.
const NOA_SWAPS: ShiftSwap[] = [
  demoRequest("1", "2026-11-06/friday", "noa"),
  demoRequest("2", "2026-11-04/morning", "maya"),
  demoRequest("3", "2026-11-07/saturday-night", "yoav", "noa"),
];

/** Places still open in next week's draft: six in all. */
const SHORT: Record<string, number> = {
  "2026-11-08/morning": 1,
  "2026-11-09/evening": 2,
  "2026-11-11/morning": 1,
  "2026-11-13/friday": 2,
};

const team = () => buildTeam(teamMembers, teamInvites, teamToday);

function published(userId: string, swaps: ShiftSwap[]): PublishedSchedule {
  const data = demoPublished(userId, swaps);
  return {
    ...data,
    thisWeek: {
      ...data.thisWeek,
      shifts: data.thisWeek.shifts.map((shift) =>
        shift.id === "2026-11-03/morning"
          ? { ...shift, assignees: THIS_MORNING }
          : shift,
      ),
    },
  };
}

const notPublished = (data: PublishedSchedule): PublishedSchedule => ({
  ...data,
  thisWeek: { ...data.thisWeek, publishedAt: null, shifts: [] },
  swaps: [],
});

function availabilityWeek(sent: boolean): AvailabilityWeek {
  return {
    ...demoWeek,
    start: NEXT_WEEK,
    dates: weekDates(NEXT_WEEK),
    dueAt: "2026-11-04T16:00:00.000Z",
    mine: sent ? demoWeek.mine : null,
  };
}

function nextWeekBuild(
  week: AvailabilityWeek,
  fill: boolean,
): ScheduleBuildWeek {
  const { members } = team();
  return {
    week,
    savedAt: null,
    publishedAt: null,
    shifts: draftWeek(NEXT_WEEK, demoShiftPatterns).map((shift) => ({
      ...shift,
      assignees: (fill
        ? members.slice(
            0,
            shift.needed - (SHORT[`${shift.day}/${shift.pattern}`] ?? 0),
          )
        : []
      ).map(({ userId }) => ({ user: userId, position: null })),
    })),
    basis: null,
    team: members,
    people: members,
    hasPattern: true,
    answers: teamAnswers,
    positions: [],
  };
}

function scheduleFor(
  role: Role,
  data: PublishedSchedule,
  sent: boolean,
  fill: boolean,
  {
    builds = role !== "worker",
    publishes = builds,
  }: {
    /** As the database answers it: owners and managers by default. */
    builds?: boolean;
    publishes?: boolean;
  } = {},
): TodaySchedule {
  const availability = availabilityWeek(sent);
  if (!builds) {
    return {
      published: data,
      availability,
      builds: false,
      publishes: false,
      teamAvailability: null,
      build: null,
      running: null,
    };
  }
  const { members } = team();
  return {
    published: data,
    availability,
    builds: true,
    publishes,
    teamAvailability: {
      week: availability,
      team: teamAvailability(members, teamAnswers, availability.dueAt),
    },
    build: nextWeekBuild(availability, fill),
    running: demoRunningBuild(data, members),
  };
}

function today(
  userId: string,
  role: Role,
  schedule: TodaySchedule | null,
  {
    modules = DEMO_MODULES,
    now = NOW,
    perms = [],
  }: {
    modules?: ModuleKey[];
    now?: string;
    /** What the database answers the person holds. */
    perms?: string[];
  } = {},
): TodayData {
  return {
    now,
    timeZone: demoWeek.timeZone,
    name: teamMembers.find((m) => m.userId === userId)?.name ?? null,
    photo: teamMembers.find((m) => m.userId === userId)?.photo ?? null,
    role,
    businessName: business.name,
    widgets: moduleWidgets(manifests, modules, { role, perms }),
    schedule,
    team: role === "worker" ? null : team(),
    manage: role !== "worker",
    // The bell leads to /design/shell/notifications, a manager's inbox, and
    // counts what it shows. A worker's lines would be other ones, so the
    // demo's workers have no bell.
    bell: role === "worker" ? null : { unread: demoUnread.length },
    // Shiran's lists for the managers, Noa's for the workers.
    lists: role === "worker" ? demoWorkerLists() : demoListsHome(),
  };
}

/** Shiran, a shift manager: on shift this morning, with requests to decide. */
export const managerToday = () =>
  today(
    "shiran",
    "manager",
    scheduleFor("manager", published("shiran", SWAPS), true, true),
  );

/** The other people and states, each with its page under /design/shell/today. */
export const todayScenarios = {
  /** Shiran again at 10:30, in the middle of her shift. */
  onShift: () =>
    today(
      "shiran",
      "manager",
      scheduleFor("manager", published("shiran", SWAPS), true, true),
      { now: "2026-11-03T08:30:00.000Z" },
    ),
  /** Shiran before she sent her own availability: a fifth tile joins. */
  availabilityMissing: () =>
    today(
      "shiran",
      "manager",
      scheduleFor("manager", published("shiran", SWAPS), false, true),
    ),
  /** Uri, the owner: on no shift, so the hero shows the business's next one. */
  owner: () =>
    today(
      "uri",
      "owner",
      scheduleFor("owner", published("uri", SWAPS), false, true),
    ),
  /** Noa, a worker: on tonight, availability not sent, one shift she can take. */
  worker: () =>
    today(
      "noa",
      "worker",
      scheduleFor("worker", published("noa", NOA_SWAPS), false, false),
    ),
  /** A manager before anything is published: the week is still all open. */
  notPublished: () =>
    today(
      "shiran",
      "manager",
      scheduleFor(
        "manager",
        notPublished(published("shiran", [])),
        true,
        false,
      ),
    ),
  /** A worker before anything is published, with availability already sent. */
  workerNotPublished: () =>
    today(
      "noa",
      "worker",
      scheduleFor("worker", notPublished(published("noa", [])), true, false),
    ),
  /**
   * Noa again, in a business whose owner raised workers to build the
   * schedule without publishing it (the roles plan's R3): next week's open
   * places, who hasn't sent availability and the one request she decides
   * (Itay taking Maya's Wednesday morning; the one she took herself isn't
   * hers to decide). This week is published, so its open places aren't
   * hers to fill: no tile, and a short shift today has no link. Yoav's
   * Wednesday evening, which she can take, stays.
   */
  workerBuilds: () =>
    today(
      "noa",
      "worker",
      scheduleFor(
        "worker",
        published("noa", [
          demoRequest("1", "2026-11-06/friday", "noa"),
          demoRequest("2", "2026-11-04/morning", "maya", "itay"),
          demoRequest("3", "2026-11-07/saturday-night", "yoav", "noa"),
          demoRequest("4", "2026-11-04/evening", "yoav"),
        ]),
        false,
        true,
        { builds: true, publishes: false },
      ),
      { perms: ["schedule.edit"] },
    ),
  /** A business with scheduling off: its part of Today disappears. */
  schedulingOff: () =>
    today("shiran", "manager", null, { modules: ["reservations"] }),
};
