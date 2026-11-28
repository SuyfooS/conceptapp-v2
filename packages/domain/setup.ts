import type { TeamProgress } from "./first-steps";
import { isStaff, type ModuleKey, type Role } from "./modules";
import { coveredByRole, type PayRole } from "./payroll-access";
import type { NamedRole } from "./role-access";

/**
 * The checklist the admin console shows once a business is open: what the
 * team has set up and what is still missing before the business runs
 * (closing the pilot, PR 16). Each item is worked out from the business as
 * stored, never ticked by hand. An item that belongs to a module is offered
 * only while that module is on, as the owner's first steps on Today offer
 * theirs (`@domain/first-steps`), and nothing here assumes a kind of
 * business.
 */

/** Where the clock's code is shown: the time clock's `codeDisplay`. */
export type CodeDisplay = "station" | "manager" | "both";

/** The roles given pay, and how many more were given it on their own. */
export type SetupPay = { roles: readonly PayRole[]; personal: number };

export type SetupFacts = {
  /** Active members plus open invites, by role. */
  people: { owner: number; manager: number; worker: number };
  hasAddress: boolean;
  /**
   * The staff who joined, were sent a link or whose link ran out, and
   * everyone still waiting for a link (`setupTeam`), as the owner's first
   * steps count them.
   */
  team: TeamProgress;
  /** Null while scheduling is off: its items aren't offered. */
  scheduling: {
    /** Job roles in its settings. */
    positions: number;
    /** Regular shifts in its settings. */
    patterns: number;
    /** Any week of the business was ever published. */
    published: boolean;
    /**
     * The answer stored for `closedOnShabbat` (`storedShabbatAnswer`), or
     * null where none is: a business opened before the wizard asked (PR 3),
     * closed by the manifest's default.
     */
    closedOnShabbat: boolean | null;
  } | null;
  /** Null while the time clock is off. */
  timeClock: {
    requirePunchCode: boolean;
    codeDisplay: CodeDisplay;
    /** Clock stations running, never the kitchen's screens or the till. */
    stations: number;
  } | null;
  /**
   * Who sees pay besides the owners and accountants, who always do
   * (`setupPay`). Null where no module that is on uses it, or where the
   * person reading the page may not see who does.
   */
  pay: SetupPay | null;
};

/** What the console reads from a business's modules for its checklist. */
export type SetupModuleFacts = Pick<
  SetupFacts,
  "scheduling" | "timeClock" | "pay"
>;

/**
 * In the order the team goes through them: the business opened, its people
 * invited, its details and settings set, then what the business does itself
 * once its people have their links: joining, and publishing a first week.
 */
export const SETUP_ITEMS = [
  "opened",
  "owner",
  "staff",
  "address",
  "shabbat",
  "shifts",
  "clockCode",
  "pay",
  "joined",
  "publish",
] as const;
export type SetupItemKey = (typeof SETUP_ITEMS)[number];

/**
 * Each item's module: offered only while it is on, and fixed in its section
 * of the console's settings page. Null for the business itself, offered
 * whatever is on; who sees pay is offered where any module that is on uses
 * it (`SetupFacts.pay`).
 */
export const SETUP_ITEM_MODULE: Record<SetupItemKey, ModuleKey | null> = {
  opened: null,
  owner: null,
  staff: null,
  address: null,
  shabbat: "scheduling",
  shifts: "scheduling",
  clockCode: "time_clock",
  pay: null,
  joined: null,
  publish: "scheduling",
};

/**
 * Where the clock's code stands: off; on and shown on the phone of whoever
 * approves hours, at clock stations, or both; or on and shown only at a
 * station while none runs, so nobody sees it (`noStation`).
 */
export type ClockCodeState = "off" | "phone" | "station" | "both" | "noStation";

export type SetupItem =
  | { key: "opened" | "owner" | "staff" | "address" | "publish"; done: boolean }
  | {
      key: "shabbat";
      done: boolean;
      /** The answer stored; null when the question was never asked. */
      answer: "open" | "closed" | null;
    }
  | { key: "shifts"; done: boolean; positions: number; patterns: number }
  | { key: "clockCode"; done: boolean; code: ClockCodeState; stations: number }
  | {
      key: "pay";
      done: boolean;
      roles: readonly PayRole[];
      personal: number;
    }
  | { key: "joined"; done: boolean; team: TeamProgress };

/**
 * Who counts when asking whether a business has its staff yet: its managers
 * and workers. Owners are counted on their own, and an accountant keeps the
 * books from outside. The console's checklist and the owner's first steps on
 * Today (`@domain/first-steps`) ask the same.
 */
export const SETUP_STAFF_ROLES = [
  "manager",
  "worker",
] as const satisfies readonly Role[];

export type SetupStaffRole = (typeof SETUP_STAFF_ROLES)[number];

/** Whether someone in this role counts as staff (`SETUP_STAFF_ROLES`). */
export function isSetupStaff(role: Role): role is SetupStaffRole {
  return (SETUP_STAFF_ROLES as readonly Role[]).includes(role);
}

/** Whether there is any staff, owners and accountants apart. */
export function hasStaff(people: Record<SetupStaffRole, number>): boolean {
  return SETUP_STAFF_ROLES.some((role) => people[role] > 0);
}

/**
 * Someone on the console's list of a business's people: a member, an invite
 * whose link is still good, one nobody got a link for yet, or one whose link
 * ran out.
 */
export type SetupPersonStatus = "member" | "invited" | "pending" | "expired";

/**
 * Where the team stands, from the console's list of people, counted as
 * `teamProgress` counts the Team screen's: the staff (`isSetupStaff`) who
 * joined, were sent a link still good, or whose link ran out, and everyone
 * still waiting for a link, whatever their role, as the list marks them.
 * Another owner and an accountant otherwise never count.
 */
export function setupTeam(
  people: readonly { role: Role; status: SetupPersonStatus }[],
): TeamProgress {
  const staff = people.filter((person) => isSetupStaff(person.role));
  const of = (status: SetupPersonStatus) =>
    staff.filter((person) => person.status === status).length;
  return {
    joined: of("member"),
    invited: of("invited"),
    expired: of("expired"),
    pending: people.filter((person) => person.status === "pending").length,
  };
}

/**
 * The answer to the wizard's Shabbat question, from scheduling's settings as
 * the database holds them, before any default: a stored `closedOnShabbat`
 * means it was answered, since the wizard saves it even when it is the
 * template's (PR 3), the settings forms save a setting only when it is
 * changed, and no template sets it. Null when none is stored, or what is
 * stored is no answer.
 */
export function storedShabbatAnswer(settings: unknown): boolean | null {
  if (typeof settings !== "object" || settings === null) return null;
  const value = (settings as Record<string, unknown>).closedOnShabbat;
  return typeof value === "boolean" ? value : null;
}

/**
 * Who sees pay, from the roles given it and the business's active people:
 * the roles, and how many more see it on their own, each once. Owners and
 * accountants always see it, so they are never counted here, and nor is
 * anyone whose role already gives it (`coveredByRole`).
 */
export function setupPay(
  roles: readonly PayRole[],
  people: readonly {
    role: Role;
    namedRole: Pick<NamedRole, "id"> | null;
    personal: boolean;
  }[],
): SetupPay {
  return {
    roles,
    personal: people.filter(
      (person) =>
        person.personal &&
        person.role !== "owner" &&
        isStaff(person.role) &&
        !coveredByRole(person, roles),
    ).length,
  };
}

/** Where the clock's code stands (`ClockCodeState`). */
export function clockCodeState(
  clock: NonNullable<SetupFacts["timeClock"]>,
): ClockCodeState {
  if (!clock.requirePunchCode) return "off";
  if (clock.codeDisplay === "manager") return "phone";
  if (clock.stations > 0) return clock.codeDisplay;
  // With no station running, "both" is the phone's alone.
  return clock.codeDisplay === "station" ? "noStation" : "phone";
}

export function setupChecklist(facts: SetupFacts): SetupItem[] {
  const { scheduling, timeClock, pay } = facts;
  const items: SetupItem[] = [
    // The checklist only exists for a business that was opened.
    { key: "opened", done: true },
    { key: "owner", done: facts.people.owner > 0 },
    { key: "staff", done: hasStaff(facts.people) },
    { key: "address", done: facts.hasAddress },
  ];
  if (scheduling) {
    const answer =
      scheduling.closedOnShabbat === null
        ? null
        : scheduling.closedOnShabbat
          ? "closed"
          : "open";
    items.push(
      { key: "shabbat", done: answer !== null, answer },
      {
        key: "shifts",
        done: scheduling.positions > 0 && scheduling.patterns > 0,
        positions: scheduling.positions,
        patterns: scheduling.patterns,
      },
    );
  }
  if (timeClock) {
    const code = clockCodeState(timeClock);
    items.push({
      key: "clockCode",
      done: code !== "off" && code !== "noStation",
      code,
      stations: timeClock.stations,
    });
  }
  if (pay) {
    // Owners and accountants always see it, so there is always an answer.
    items.push({
      key: "pay",
      done: true,
      roles: pay.roles,
      personal: pay.personal,
    });
  }
  items.push({ key: "joined", done: facts.team.joined > 0, team: facts.team });
  if (scheduling) {
    items.push({ key: "publish", done: scheduling.published });
  }
  return items;
}

/**
 * Whether an item counts toward what is left. Who sees pay never does: it
 * is there to be checked. Nor does the clock's code, a choice a business
 * does well without, unless it is on where nobody can see it.
 */
export function countsInSetup(item: SetupItem): boolean {
  if (item.key === "pay") return false;
  if (item.key === "clockCode") return item.code === "noStation";
  return true;
}

/** How many items count (`countsInSetup`). */
export function setupCounted(items: readonly SetupItem[]): number {
  return items.filter(countsInSetup).length;
}

/** How many of the items that count are done. */
export function setupDone(items: readonly SetupItem[]): number {
  return items.filter((item) => countsInSetup(item) && item.done).length;
}

/** How many of the items that count are still open. */
export function setupRemaining(items: readonly SetupItem[]): number {
  return setupCounted(items) - setupDone(items);
}
