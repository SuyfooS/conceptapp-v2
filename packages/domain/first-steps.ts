import type { ModuleKey, Role } from "./modules";
import { BUILDER_PATH } from "./running-week";
import { isSetupStaff } from "./setup";
import type { Team } from "./team";
import { canWrite, type ViewSession } from "./view-as";

/**
 * The owner's first steps on Today: what to do first in a business the team
 * just opened, and what is already done. Each step is worked out from the
 * business as stored, never ticked by hand, so a step the template already
 * filled shows as done with what is there, and one undone later (a
 * department emptied) is open again. Each belongs to a module and is offered
 * only while that module is on; nothing here assumes a kind of business.
 */

/**
 * The cookie that keeps, on this device, the businesses whose owner hid
 * their first steps: their ids, comma-separated, the latest last. Kept as
 * long as the business cookie, and forgotten with it on signing out.
 */
export const FIRST_STEPS_HIDDEN_COOKIE = "ca_first_steps_hidden";

/** How many businesses the cookie remembers; the oldest goes first. */
export const FIRST_STEPS_HIDDEN_MOST = 20;

/** In the order to do them. */
export const FIRST_STEP_KEYS = [
  "team",
  "shifts",
  "departments",
  "publish",
  "details",
  "clockCode",
] as const;

export type FirstStepKey = (typeof FIRST_STEP_KEYS)[number];

/** Each step's module; null for the business itself, offered whatever is on. */
export const FIRST_STEP_MODULE: Record<FirstStepKey, ModuleKey | null> = {
  team: null,
  shifts: "scheduling",
  departments: "lists",
  publish: "scheduling",
  details: null,
  clockCode: "time_clock",
};

/**
 * Shown and marked, never counted: a business does well without them, so
 * they never hold the card open.
 */
export const OPTIONAL_STEPS: readonly FirstStepKey[] = ["clockCode"];

/** The staff (`isSetupStaff`): joined, and invited with no one joined yet. */
export type TeamProgress = {
  joined: number;
  /** Open invites. */
  invited: number;
  /** Invites that ran out before anyone joined through them. */
  expired: number;
};

export type FirstStepsFacts = {
  team: TeamProgress;
  details: {
    address: string | null;
    /** The Shabbat city is asked for (closed on Shabbat) and not chosen. */
    cityMissing: boolean;
  };
  /** Null while the module is off: its steps aren't offered. */
  scheduling: {
    /** Job roles in its settings. */
    positions: number;
    /** Regular shifts in its settings. */
    patterns: number;
    /** Any week of the business was ever published. */
    published: boolean;
  } | null;
  /** Live departments, and how many of them have nobody in them. */
  lists: { departments: number; empty: number } | null;
  timeClock: { requirePunchCode: boolean } | null;
};

export type FirstStep =
  | { key: "team"; done: boolean; progress: TeamProgress }
  | { key: "shifts"; done: boolean; positions: number; patterns: number }
  | { key: "departments"; done: boolean; departments: number; empty: number }
  | { key: "publish"; done: boolean }
  | {
      key: "details";
      done: boolean;
      /** What is still missing; null once nothing is. */
      missing: "address" | "city" | "both" | null;
      address: string | null;
    }
  | { key: "clockCode"; done: boolean };

/** What Today draws: the steps, and whether the person may hide them. */
export type FirstStepsData = {
  steps: FirstStep[];
  /** False while viewing as someone, who changes nothing. */
  hides: boolean;
};

/**
 * Where the team stands, counted as the console's checklist counts its staff
 * (`isSetupStaff`: managers and workers; a named role by the role it is
 * built on). Another owner and an accountant, joined or invited, never count.
 */
export function teamProgress(
  team: Pick<Team, "members" | "invites">,
): TeamProgress {
  const invites = team.invites.filter((invite) => isSetupStaff(invite.role));
  return {
    joined: team.members.filter((member) => isSetupStaff(member.role)).length,
    invited: invites.filter((invite) => invite.state === "open").length,
    expired: invites.filter((invite) => invite.state === "expired").length,
  };
}

const hasText = (value: string | null) =>
  value !== null && value.trim().length > 0;

/** The steps the business's modules offer, in `FIRST_STEP_KEYS` order. */
export function firstSteps(facts: FirstStepsFacts): FirstStep[] {
  const { scheduling, lists, timeClock } = facts;
  const address = hasText(facts.details.address) ? facts.details.address : null;
  const missing =
    address === null
      ? facts.details.cityMissing
        ? "both"
        : "address"
      : facts.details.cityMissing
        ? "city"
        : null;
  const steps: FirstStep[] = [
    { key: "team", done: facts.team.joined > 0, progress: facts.team },
  ];
  if (scheduling) {
    steps.push({
      key: "shifts",
      done: scheduling.positions > 0 && scheduling.patterns > 0,
      positions: scheduling.positions,
      patterns: scheduling.patterns,
    });
  }
  // Departments only matter once there are some: a business without any
  // sends its lists to roles and people.
  if (lists && lists.departments > 0) {
    steps.push({
      key: "departments",
      done: lists.empty === 0,
      departments: lists.departments,
      empty: lists.empty,
    });
  }
  if (scheduling) {
    steps.push({ key: "publish", done: scheduling.published });
  }
  steps.push({ key: "details", done: missing === null, missing, address });
  if (timeClock) {
    steps.push({ key: "clockCode", done: timeClock.requirePunchCode });
  }
  return steps;
}

export function isOptionalStep(step: Pick<FirstStep, "key">): boolean {
  return OPTIONAL_STEPS.includes(step.key);
}

/** How many steps count: the optional ones never do. */
export function stepsCounted(steps: readonly FirstStep[]): number {
  return steps.filter((step) => !isOptionalStep(step)).length;
}

/** How many of the counted steps are done. */
export function stepsDone(steps: readonly FirstStep[]): number {
  return steps.filter((step) => !isOptionalStep(step) && step.done).length;
}

/** How many counted steps are left; at none the card goes. */
export function stepsLeft(steps: readonly FirstStep[]): number {
  return stepsCounted(steps) - stepsDone(steps);
}

/** What to do next: the first counted step not done. */
export function nextStep(steps: readonly FirstStep[]): FirstStep | null {
  return steps.find((step) => !isOptionalStep(step) && !step.done) ?? null;
}

/**
 * The screen that does the step, done or not, so a done one can be checked.
 * The team's is its invite while nobody joined or was invited yet.
 */
export function firstStepHref(step: FirstStep): `/${string}` {
  switch (step.key) {
    case "team": {
      const { joined, invited, expired } = step.progress;
      return joined + invited + expired === 0 ? "/team/invite" : "/team";
    }
    case "shifts":
      return "/manage/scheduling";
    case "departments":
      return "/manage/departments";
    case "publish":
      return BUILDER_PATH;
    case "details":
      return "/manage/business";
    case "clockCode":
      return "/manage/time_clock";
  }
}

const hiddenIn = (cookie: string | null | undefined) =>
  (cookie ?? "").split(",").filter((id) => id.length > 0);

/** Whether the owner hid this business's first steps on this device. */
export function firstStepsHidden(
  cookie: string | null | undefined,
  businessId: string,
): boolean {
  return hiddenIn(cookie).includes(businessId);
}

/**
 * The cookie's value once this business's steps are hidden too: its id last,
 * and no more than `FIRST_STEPS_HIDDEN_MOST`, the oldest dropped.
 */
export function withFirstStepsHidden(
  cookie: string | null | undefined,
  businessId: string,
): string {
  return [...hiddenIn(cookie).filter((id) => id !== businessId), businessId]
    .slice(-FIRST_STEPS_HIDDEN_MOST)
    .join(",");
}

/**
 * Why hiding the first steps is refused: nobody signed in, someone viewing
 * as the owner, who changes nothing, or anyone but an owner of the business
 * open now. None of them has "הסתרה".
 */
export type FirstStepsHideRefusal = "signedOut" | "viewing" | "notOwner";

/**
 * Whether the person asking hides the first steps of the business open now
 * (`membership`, null before they are in one), or why not: only its owner
 * does, as themselves.
 */
export function firstStepsHideRefusal(
  asking: {
    viewing: ViewSession | null;
    membership: { role: Role } | null;
  } | null,
): FirstStepsHideRefusal | null {
  if (!asking) return "signedOut";
  if (!canWrite(asking.viewing)) return "viewing";
  return asking.membership?.role === "owner" ? null : "notOwner";
}
