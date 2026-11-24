import { addDays, teamAvailability, weekDates } from "@domain/availability";
import {
  type FirstStepsFacts,
  firstSteps as firstStepsOf,
  teamProgress,
} from "@domain/first-steps";
import { type ModuleKey, moduleWidgets, type Role } from "@domain/modules";
import { declaredPermissions, permissionsByDefault } from "@domain/permissions";
import { draftWeek, type ShiftAssignee } from "@domain/schedule";
import type { ShiftSwap } from "@domain/swaps";
import { buildTeam, canSeeTeam } from "@domain/team";
import { manifests } from "@modules/registry";
import type { TodayData, TodaySchedule } from "../../../(app)/home/today-view";
import type {
  AvailabilityWeek,
  PublishedSchedule,
  ScheduleBuildWeek,
} from "../../../(app)/schedule/week";
import { orderDemoDepartments } from "../../order-taking/data";
import { demoStations } from "../clock/team/data";
import {
  business,
  demoBusinessDetails,
  demoOrdersMode,
  demoPositions,
  demoShiftPatterns,
  teamAnswers,
  teamInvites,
  teamMembers,
  teamToday,
} from "../data";
import { demoDepartments, demoListsHome, demoWorkerLists } from "../lists/data";
import { demoUnread } from "../notifications/data";
import { demoWeek } from "../schedule/availability/week";
import {
  DEMO_ENDED,
  DEMO_NOON,
  demoPublished,
  demoRequest,
  demoRunningBuild,
} from "../schedule/shifts/published";

/** The twin restaurant's kitchen, by its name: the kitchen's screen is called after it. */
const DEMO_KITCHEN =
  orderDemoDepartments.find((d) => d.key === "kitchen")?.name ?? "";

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

// What became of the requests that no longer wait (`DEMO_ENDED`): Noa's
// evening tonight wasn't approved, which her hero says.
function published(userId: string, swaps: ShiftSwap[]): PublishedSchedule {
  const data = demoPublished(userId, swaps, DEMO_NOON, DEMO_ENDED);
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
  endedSwaps: [],
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
    away: [],
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

/** What someone in `role` holds by default, as the database answers it. */
function byDefault(role: Role): string[] {
  return permissionsByDefault(declaredPermissions(manifests), {
    role,
    given: [],
    viewing: false,
  });
}

function today(
  userId: string,
  role: Role,
  schedule: TodaySchedule | null,
  {
    modules = DEMO_MODULES,
    now = NOW,
    perms = byDefault(role),
    modes,
  }: {
    modules?: ModuleKey[];
    now?: string;
    /** The modes the person is in (waiter mode, P4). */
    modes?: TodayData["modes"];
    /**
     * What the database answers the person holds: by default, what their
     * role holds with no business choosing anything for it.
     */
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
    team: canSeeTeam({ role, perms }) ? team() : null,
    manage: role !== "worker",
    // The bell leads to /design/shell/notifications, a manager's inbox, and
    // counts what it shows. A worker's lines would be other ones, so the
    // demo's workers have no bell.
    bell: role === "worker" ? null : { unread: demoUnread.length },
    // Shiran's lists for the managers, Noa's for the workers.
    lists: role === "worker" ? demoWorkerLists() : demoListsHome(),
    modes,
  };
}

/** Shiran, a shift manager: on shift this morning, with requests to decide. */
export const managerToday = () =>
  today(
    "shiran",
    "manager",
    scheduleFor("manager", published("shiran", SWAPS), true, true),
  );

/** The modules of a business the team just opened, for its first steps. */
const OPENED_MODULES: ModuleKey[] = ["scheduling", "time_clock", "lists"];

/**
 * Uri, the owner, a few days after the team opened the restaurant from its
 * template: the team joined with one invite waiting, the job roles and
 * shifts came with the template, nobody is in the storeroom yet, nothing is
 * published, the address is in and the Shabbat city isn't, and there's no
 * clock code. `new` is a business of any kind on its first day instead, the
 * owner alone with nothing set; `viewing` is the default as the ConceptApp
 * team reads it, viewing as the owner, with no way to hide it.
 */
function firstSteps(state?: "new" | "viewing"): TodayData {
  if (state === "new") return firstDay();
  const departments = demoDepartments.map((d) =>
    d.key === "storeroom" ? { ...d, members: [] } : d,
  );
  const facts: FirstStepsFacts = {
    team: teamProgress(team()),
    details: { address: demoBusinessDetails.address, cityMissing: true },
    scheduling: {
      positions: demoPositions.length,
      patterns: demoShiftPatterns.length,
      published: false,
    },
    lists: {
      departments: departments.length,
      empty: departments.filter((d) => d.members.length === 0).length,
    },
    timeClock: { requirePunchCode: false },
  };
  return {
    ...today(
      "uri",
      "owner",
      scheduleFor("owner", notPublished(published("uri", [])), false, false),
      { modules: OPENED_MODULES },
    ),
    firstSteps: { steps: firstStepsOf(facts), hides: state !== "viewing" },
  };
}

/**
 * A business of any kind on its first day: Uri alone, no job roles or
 * shifts, no departments, no address and no Shabbat city, nothing sent yet.
 */
function firstDay(): TodayData {
  const alone = buildTeam(
    teamMembers.filter((m) => m.userId === "uri"),
    [],
    teamToday,
  );
  const data = notPublished(published("uri", []));
  const availability = availabilityWeek(false);
  const build = nextWeekBuild(availability, false);
  const schedule: TodaySchedule = {
    published: {
      ...data,
      people: data.people.filter((p) => p.userId === "uri"),
    },
    availability,
    builds: true,
    publishes: true,
    teamAvailability: {
      week: availability,
      team: teamAvailability(alone.members, [], availability.dueAt),
    },
    build: {
      ...build,
      shifts: [],
      hasPattern: false,
      team: alone.members,
      people: alone.members,
      answers: [],
    },
    running: null,
  };
  const facts: FirstStepsFacts = {
    team: teamProgress(alone),
    details: { address: null, cityMissing: true },
    scheduling: { positions: 0, patterns: 0, published: false },
    lists: { departments: 0, empty: 0 },
    timeClock: { requirePunchCode: false },
  };
  return {
    ...today("uri", "owner", schedule, { modules: OPENED_MODULES }),
    team: alone,
    // Nothing sent yet: lists keep their quiet row.
    lists: null,
    firstSteps: { steps: firstStepsOf(facts), hides: true },
  };
}

/** The other people and states, each with its page under /design/shell/today. */
export const todayScenarios = {
  /** Shiran again at 10:30, in the middle of her shift. */
  onShift: () =>
    today(
      "shiran",
      "manager",
      scheduleFor("manager", published("shiran", SWAPS), true, true),
      // On a shift in the restaurant, taking orders: the mode's card (P4).
      { now: "2026-11-03T08:30:00.000Z", modes: [{ ...demoOrdersMode }] },
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
  /**
   * Shiran in a business whose owner lowered managers to team none (the
   * roles plan's R6): "ניהול העסק" keeps only the management page's row.
   */
  managerNoTeam: () =>
    today(
      "shiran",
      "manager",
      scheduleFor("manager", published("shiran", SWAPS), true, true),
      {
        perms: byDefault("manager").filter(
          (key) => key !== "team.view" && key !== "team.edit",
        ),
      },
    ),
  /** A business with scheduling off: its part of Today disappears. */
  schedulingOff: () =>
    today("shiran", "manager", null, { modules: ["reservations"] }),
  /**
   * Shiran signed in again on the entrance's clock station (#78 phase 5),
   * where the clock is on: Today says the device is the business's station,
   * to lock again when she is done, as that same station. `worker` is Noa
   * signed in on it instead: Today says the device is the business's tablet,
   * and to sign out when she is done (Orel, 20 November 2026). `prep` is
   * Shiran signed in again on the kitchen's screen (waiter mode P8a): Today
   * says it is the business's prep screen, to lock again as that screen.
   */
  station: (who?: "worker" | "prep"): TodayData =>
    who === "worker"
      ? {
          ...today(
            "noa",
            "worker",
            scheduleFor("worker", published("noa", NOA_SWAPS), false, false),
            { modules: [...DEMO_MODULES, "time_clock"] },
          ),
          station: { kind: "signOut", shows: "clock_code" },
        }
      : {
          ...today(
            "shiran",
            "manager",
            scheduleFor("manager", published("shiran", SWAPS), true, true),
            { modules: [...DEMO_MODULES, "time_clock"] },
          ),
          station:
            who === "prep"
              ? {
                  kind: "lock",
                  shows: "prep",
                  offer: { current: { name: DEMO_KITCHEN }, running: [] },
                }
              : {
                  kind: "lock",
                  shows: "clock_code",
                  offer: {
                    current: { name: demoStations.rows[0]?.name ?? "" },
                    running: [],
                  },
                },
        },
  /** The owner's first steps (`firstSteps` above). */
  firstSteps,
  /**
   * Noa in a business that uses the hiring file (H5b): `missing`, three of
   * its four parts still to give, its card; `pension`, everything in but a
   * fund she chose to pick later, its card leading to the pension; `bank`,
   * all of it in and her account changed two days ago, its card;
   * `disputed`, after she said "לא שיניתי", what follows; `complete`,
   * nothing missing and no change to tell, as Today is once the bank's card
   * is hidden: the file's quiet row says so.
   */
  workerFile: (state: WorkerFileState): TodayData => ({
    ...today(
      "noa",
      "worker",
      scheduleFor("worker", published("noa", NOA_SWAPS), false, false),
      { modules: [...DEMO_MODULES, "employee_files"] },
    ),
    file: {
      businessId: "demo-restaurant",
      businessName: business.name,
      role: "worker",
      asked: 4,
      missing: state === "missing" ? 3 : state === "pension" ? 1 : 0,
      pension:
        state === "pension" ? { kind: "open", dueOn: "2026-12-24" } : null,
      bank:
        state === "bank" || state === "disputed"
          ? {
              on: "2026-11-01",
              changedAt: "2026-11-01T08:00:00.000+00:00",
              disputed: state === "disputed",
            }
          : null,
    },
  }),
};

/** The hiring file's states on the worker's Today twin (`workerFile`). */
export const WORKER_FILE_STATES = [
  "missing",
  "pension",
  "bank",
  "disputed",
  "complete",
] as const;
export type WorkerFileState = (typeof WORKER_FILE_STATES)[number];
