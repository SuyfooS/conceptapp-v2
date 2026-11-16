import { instantIn } from "./availability";
import {
  atLeast,
  holdsPermission,
  isStaff,
  ROLES,
  type Role,
  type Viewer,
} from "./modules";
import { normalizeIsraeliMobile } from "./phone";
import type { AddressForm } from "./profile";
import type { NamedRole } from "./role-access";

/**
 * The Team screen's rules, free of React and the database: who may open
 * it, and how the people in a business are grouped and counted.
 */

/**
 * Whether the viewer opens the team screen: everyone in the business with
 * their numbers, who is a minor, and the invites waiting (`team.view` as the
 * database answers it, `public.my_permissions`; the roles plan's R6). Owners
 * always, managers by default, and anyone whose role an owner or the team
 * raised; a manager lowered to none doesn't. Everyone in the business reads
 * everyone's name all the same, wherever the app shows one (critique 15).
 * The database asks the same at every read (`public.team_phones`,
 * `public.team_youth`, the invites' policy).
 */
export function canSeeTeam(viewer: Viewer): boolean {
  return holdsPermission(viewer, "team.view");
}

/**
 * Whether the viewer changes the team: invites, sends a new link, cancels an
 * invite, takes someone off the team, changes a role and deletes a hurtful
 * line (`team.edit`, which needs `team.view`). Whom they act on is the rank
 * rule's (`givesRole`). Someone who sees the team without it reads the
 * screen and changes nothing. The database checks the same at every write.
 */
export function canEditTeam(viewer: Viewer): boolean {
  return canSeeTeam(viewer) && holdsPermission(viewer, "team.edit");
}

export type TeamMember = {
  userId: string;
  /** Null when nobody wrote one down. */
  name: string | null;
  phone: string | null;
  role: Role;
  /**
   * The role the business named that they hold (the roles plan's R11b),
   * built on `role`; null or missing for the role itself.
   */
  namedRole?: NamedRole | null;
  /** Their photo as an image src the screens can show, or null for initials. */
  photo: string | null;
  /** How the app writes about them, or null until they choose. */
  addressForm: AddressForm | null;
};

export type TeamInvite = {
  id: string;
  name: string | null;
  phone: string;
  role: Role;
  /**
   * The role the business named that it gives, built on `role`, archived
   * since or not; null or missing for the role itself.
   */
  namedRole?: (NamedRole & { archived?: boolean }) | null;
  /** ISO timestamp. */
  expiresAt: string;
};

export type InviteState = "open" | "expired";

export type Team = {
  /** Owners, then managers, workers and accountants; by name within a role. */
  members: TeamMember[];
  /** Open invites first, then expired ones; by role and name within each. */
  invites: (TeamInvite & { state: InviteState })[];
  counts: { members: number; open: number; expired: number };
};

const ROLE_ORDER: Record<Role, number> = {
  owner: 0,
  manager: 1,
  worker: 2,
  accountant: 3,
};

const byRoleThenName = (
  a: { role: Role; name: string | null },
  b: { role: Role; name: string | null },
) =>
  ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
  // Unnamed people go last within their role.
  (a.name === null ? 1 : 0) - (b.name === null ? 1 : 0) ||
  (a.name ?? "").localeCompare(b.name ?? "", "he");

/** Group and count a business's people as of `now`. */
export function buildTeam(
  members: readonly TeamMember[],
  invites: readonly TeamInvite[],
  now: Date,
): Team {
  const withState = invites.map((invite) => ({
    ...invite,
    state: (Date.parse(invite.expiresAt) > now.getTime()
      ? "open"
      : "expired") as InviteState,
  }));
  withState.sort(
    (a, b) =>
      (a.state === "open" ? 0 : 1) - (b.state === "open" ? 0 : 1) ||
      byRoleThenName(a, b),
  );
  const open = withState.filter((i) => i.state === "open").length;
  return {
    members: [...members].sort(byRoleThenName),
    invites: withState,
    counts: {
      members: members.length,
      open,
      expired: withState.length - open,
    },
  };
}

/**
 * The rank rule, the one rule by role left on the team (the roles plan's
 * R6): an owner gives every role; anyone else a role of the staff other than
 * owner, at or below their own (a manager: managers and workers; a worker
 * raised to edit the team: workers). Another owner and an accountant, who
 * sees everyone's hours and pay, are an owner's to give (Orel, 8 November
 * 2026); the ConceptApp team gives them from the console too. The database
 * says the same (`private.gives_role`).
 */
export function givesRole(giver: Role, role: Role): boolean {
  if (giver === "owner") return true;
  return (
    isStaff(giver) && isStaff(role) && role !== "owner" && atLeast(giver, role)
  );
}

/**
 * A role to give someone: a built-in role (`namedRole` null), or a role the
 * business named itself (the roles plan's R11b), by its id, built on `role`,
 * its base, which is then the role they hold by rank.
 */
export type RoleChoice = { role: Role; namedRole: string | null };

/**
 * A role the business named, as the team's screens give it (R11a's
 * `public.business_roles`, live): its names and base, and the permissions
 * owners switch per role that it holds by its role (`private.role_holds`),
 * so whoever else gives it holds them too.
 */
export type GivableNamedRole = NamedRole & { holds: readonly string[] };

/**
 * A named role as a screen draws it: its names and its base, and nothing
 * else. What it holds stays on the server, for the giver's rule
 * (`givesNamedRole`): the rules are the owner's to read (the
 * `public.role_permissions` policy, the roles plan's R8), so they never
 * reach the browser of someone else who edits the team.
 */
export function namedRoleShown(role: NamedRole): NamedRole {
  return { id: role.id, name: role.name, nameEn: role.nameEn, base: role.base };
}

/** The same role, and the same named role or none. */
export function sameRoleChoice(a: RoleChoice, b: RoleChoice): boolean {
  return a.role === b.role && a.namedRole === b.namedRole;
}

/**
 * A choice as a form carries it: the built-in role, or the named role's id
 * (`roleChoiceOf` reads it back).
 */
export function roleChoiceKey(choice: RoleChoice): string {
  return choice.namedRole ?? choice.role;
}

/** A form's choice among `choices`, by its key; null for one not among them. */
export function roleChoiceOf(
  key: string,
  choices: readonly RoleChoice[],
): RoleChoice | null {
  return choices.find((choice) => roleChoiceKey(choice) === key) ?? null;
}

/**
 * Whether the viewer gives `role`, one the business named (Orel's answers
 * of 15 and 16 November 2026, issue #1): someone who edits the team, for a
 * role built on one they give by the rank rule (`givesRole`); an owner any
 * of them; anyone else only one that holds nothing they don't
 * (`private.role_holds_beyond`, hint `held`). None holds pay (R11a), so none
 * is an owner's alone for that. The database checks the same
 * (`public.team_invite`, `public.team_invite_link`, `public.set_member_role`).
 */
export function givesNamedRole(
  viewer: Viewer,
  role: GivableNamedRole,
): boolean {
  if (!canEditTeam(viewer) || !givesRole(viewer.role, role.base)) return false;
  return (
    viewer.role === "owner" ||
    role.holds.every((key) => holdsPermission(viewer, key))
  );
}

/**
 * The roles the viewer may give someone they invite: none unless they edit
 * the team (`canEditTeam`), then those of the rank rule (`givesRole`), each
 * followed by the business's named roles built on it that they give
 * (`givesNamedRole`, from `named`: its live ones). A manager invites
 * managers and workers; an owner also an owner or an accountant. The
 * database checks the same (`public.team_invite`), and also that nobody but
 * an owner gives a role that holds pay (hint `pay`) or more than they hold
 * (hint `held`).
 */
export function invitableRoles(
  viewer: Viewer,
  named: readonly GivableNamedRole[] = [],
): RoleChoice[] {
  if (!canEditTeam(viewer)) return [];
  return ROLES.flatMap((role): RoleChoice[] =>
    givesRole(viewer.role, role)
      ? [
          { role, namedRole: null },
          ...named
            .filter((n) => n.base === role && givesNamedRole(viewer, n))
            .map((n) => ({ role, namedRole: n.id })),
        ]
      : [],
  );
}

/**
 * The business's named roles the viewer gives by the rank rule of their base
 * but not by what they hold (`givesNamedRole` refuses each: it holds
 * something they don't), as choices, in `named`'s order. The role sheet
 * shows them, not offered, as an owner's to give, as it shows a role that
 * holds pay. None for an owner, who gives every one, nor for anyone who
 * doesn't edit the team.
 */
export function namedRolesBeyond(
  viewer: Viewer,
  named: readonly GivableNamedRole[] = [],
): RoleChoice[] {
  if (!canEditTeam(viewer)) return [];
  return named
    .filter((n) => givesRole(viewer.role, n.base) && !givesNamedRole(viewer, n))
    .map((n) => ({ role: n.base, namedRole: n.id }));
}

/** Whether the viewer edits the team and gives `role` by the rank rule. */
function givesByRank(viewer: Viewer, role: Role): boolean {
  return canEditTeam(viewer) && givesRole(viewer.role, role);
}

/**
 * The roles only an owner gives, for this viewer: those that hold pay by
 * their role in the business (`payRoles`, its rows for `clock.payroll`;
 * Orel, 8 November 2026, the roles plan's R6). None for an owner. Anyone else
 * isn't offered them to invite to, change someone to or send a new link for,
 * and a change away from one is held for its undo, since changing back would
 * give pay. The database refuses the same (42501, hint `pay`).
 */
export function ownerOnlyRoles(
  viewer: Viewer,
  payRoles: readonly Role[],
): Role[] {
  return viewer.role === "owner" ? [] : [...payRoles];
}

/**
 * May the viewer send a link for an invite to `invite`, its role and named
 * role? Only to one they would invite to now (`invitableRoles`): a named
 * role archived since, not among `named`, gets none
 * (`public.team_invite_link`).
 */
export function canResendInvite(
  viewer: Viewer,
  invite: RoleChoice,
  named: readonly GivableNamedRole[] = [],
): boolean {
  return invitableRoles(viewer, named).some((choice) =>
    sameRoleChoice(choice, invite),
  );
}

/**
 * May the viewer cancel an invite with `inviteRole`, the role it gives (a
 * named role's base)? Whoever edits the team, by the rank rule, whatever
 * named role it gives (`public.team_invite_cancel`).
 */
export function canCancelInvite(viewer: Viewer, inviteRole: Role): boolean {
  return givesByRank(viewer, inviteRole);
}

/** Someone on the team, as the rules for changing it see them. */
export type TeamPlace = {
  userId: string;
  role: Role;
  /** The id of the role the business named that they hold; null or missing for none. */
  namedRole?: string | null;
};

/** Someone's role and named role, as a choice. */
export function placeChoice(person: TeamPlace): RoleChoice {
  return { role: person.role, namedRole: person.namedRole ?? null };
}

/** The one who acts: their place, and what they hold (`Viewer`). */
export type TeamActor = TeamPlace & Viewer;

/**
 * Whoever may invite to a role may take someone off the team from it, and
 * change someone from it and to it (Orel, 14 November 2026): someone who
 * edits the team, by the rank rule, so an owner acts on everyone, a manager
 * on managers and workers, and a worker raised to edit the team on workers.
 * Never on oneself, which the person's own profile is for. A named role
 * counts as its base: whoever acts on workers acts on a shift lead built on
 * them. The database checks the same (`public.remove_member`,
 * `private.gives_role`), and also that the business keeps an owner
 * (`leavesNoOwner`).
 */
export function canRemoveMember(viewer: TeamActor, person: TeamPlace): boolean {
  return viewer.userId !== person.userId && givesByRank(viewer, person.role);
}

/**
 * May the viewer change someone's role from `from` to `to`, built-in roles
 * or the bases of named ones? Both must be roles they invite to by the rank
 * rule. The same role changes nothing, and is allowed
 * (`public.set_member_role` returns `changed: false`).
 */
export function mayChangeRole(viewer: Viewer, from: Role, to: Role): boolean {
  return givesByRank(viewer, from) && givesByRank(viewer, to);
}

/**
 * The roles the viewer may give the person instead of theirs, built-in and
 * named (`invitableRoles`, from the business's live named roles `named`), in
 * the usual order; none when they may not change it at all
 * (`canRemoveMember`).
 */
export function roleChoices(
  viewer: TeamActor,
  person: TeamPlace,
  named: readonly GivableNamedRole[] = [],
): RoleChoice[] {
  if (!canRemoveMember(viewer, person)) return [];
  const now = placeChoice(person);
  return invitableRoles(viewer, named).filter(
    (choice) => !sameRoleChoice(choice, now),
  );
}

/**
 * Taking `personId` off the team (`to` null) or giving them `to` would leave
 * the business with no owner. The screens never offer it: only an owner acts
 * on an owner, and never on themselves. The database refuses it anyway
 * (23P01), under a lock, for two owners acting at once.
 */
export function leavesNoOwner(
  members: readonly TeamPlace[],
  personId: string,
  to: Role | null,
): boolean {
  const owners = members.filter((member) => member.role === "owner");
  if (!owners.some((owner) => owner.userId === personId)) return false;
  if (to === "owner") return false;
  return owners.length <= 1;
}

/**
 * Leaving the staff takes someone off their shifts still to start: being
 * taken off the team, or becoming an accountant (Orel's decision 2 of
 * 14 November 2026). An accountant joining the staff has none.
 */
export function leavesStaff(from: Role, to: Role | null): boolean {
  return isStaff(from) && (to === null || !isStaff(to));
}

/**
 * A role change that changing back can't undo, so the screen holds it for
 * its undo before writing it, as it holds a removal: leaving the staff takes
 * the shifts still to start off the person (`leavesStaff`), and becoming an
 * owner or an accountant clears their personal permissions
 * (`public.set_member_role`). Between manager and worker, and from an
 * accountant onto the staff below owner, nothing is lost: the change is
 * written at once, and its undo is the change back.
 */
export function roleChangeClears(from: Role, to: Role): boolean {
  if (from === to) return false;
  return leavesStaff(from, to) || (to === "owner" && from !== "accountant");
}

/**
 * Why the database refused a team change, as the screens explain it:
 *
 *   notAllowed  42501: the viewer may not act on this role, or no longer
 *               edits the business's team
 *   beyondHeld  42501 with hint `held`: the new role holds by role a
 *               permission the viewer doesn't (an owner set workers above
 *               managers; the roles plan's R3), which only an owner gives
 *   givesPay    42501 with hint `pay`: the new role sees pay, which only an
 *               owner gives (Orel, 8 November 2026; the roles plan's R6),
 *               the viewer's own role included where it holds pay
 *   gone        P0002: the person is no longer on the team, or the invite is
 *               no longer open (claimed, cancelled)
 *   roleGone    22023 with hint `archived`: the role the business named was
 *               removed since the screen was drawn (the roles plan's R11b)
 *   yourself    22023: one's own place, or no role given
 *   lastOwner   23P01: the business would have no owner
 *   demo        55000 with hint `demo`: a demo business keeps its people
 *   clockedIn   55000 with hint `clocked_in`: clock them out first
 *   elsewhere   23505: an accountant on another business's staff can't join
 *               this one's (say it neutrally on the Team screen, #80)
 *   changed     40001: the role changed since the screen showed it (an undo)
 *   failed      anything else
 */
export const TEAM_CHANGE_FAILURES = [
  "notAllowed",
  "beyondHeld",
  "givesPay",
  "gone",
  "roleGone",
  "yourself",
  "lastOwner",
  "demo",
  "clockedIn",
  "elsewhere",
  "changed",
  "failed",
] as const;

export type TeamChangeFailure = (typeof TEAM_CHANGE_FAILURES)[number];

export function teamChangeFailureOf(
  code: string | undefined,
  hint?: string | null,
): TeamChangeFailure {
  switch (code) {
    case "42501":
      return hint === "held"
        ? "beyondHeld"
        : hint === "pay"
          ? "givesPay"
          : "notAllowed";
    case "P0002":
      return "gone";
    case "22023":
      return hint === "archived" ? "roleGone" : "yourself";
    case "23P01":
      return "lastOwner";
    case "55000":
      return hint === "demo"
        ? "demo"
        : hint === "clocked_in"
          ? "clockedIn"
          : "failed";
    case "23505":
      return "elsewhere";
    case "40001":
      return "changed";
    default:
      return "failed";
  }
}

/** What came off someone who left the staff, as the database says it. */
export type LeftCounts = {
  /** Shifts still to start in published weeks: these now show as missing. */
  shifts: number;
  /** Shifts still to start in drafts. */
  drafts: number;
  /** Swap requests they made on those shifts, cancelled. */
  swaps: number;
  /**
   * Colleagues' shifts they had taken, waiting for approval: the requests are
   * open again for someone else (Orel, 15 November 2026).
   */
  reopened: number;
};

/** Same limit as `profiles.full_name` in the database. */
export const TEAM_NAME_MAX = 80;

export type TeamInviteInput = RoleChoice & {
  name: string;
  /** Canonical E.164. */
  phone: string;
};

export type TeamInviteErrors = {
  name?: "required" | "tooLong";
  phone?: "required" | "invalid";
  role?: "required" | "notAllowed";
};

/**
 * Checks the Team screen's invite form for `actor`: a name, an Israeli
 * mobile (any format; `PhoneField` already submits E.164) and a role they
 * may give (`invitableRoles`), as its key (`roleChoiceKey`): a built-in
 * role, or the id of one of `named`, the business's live named roles, which
 * is then given on its base.
 */
export function parseTeamInvite(
  input: Partial<Record<"name" | "phone" | "role", unknown>>,
  actor: Viewer,
  named: readonly GivableNamedRole[] = [],
):
  | { ok: true; value: TeamInviteInput }
  | { ok: false; errors: TeamInviteErrors } {
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  const name = text(input.name).trim().replace(/\s+/g, " ");
  const rawPhone = text(input.phone).trim();
  const phone = normalizeIsraeliMobile(rawPhone);
  const key = text(input.role);
  const choice = key ? roleChoiceOf(key, invitableRoles(actor, named)) : null;
  const errors: TeamInviteErrors = {};

  if (!name) errors.name = "required";
  else if (name.length > TEAM_NAME_MAX) errors.name = "tooLong";

  if (!rawPhone) errors.phone = "required";
  else if (!phone) errors.phone = "invalid";

  if (!key) errors.role = "required";
  else if (!choice) errors.role = "notAllowed";

  if (errors.name || errors.phone || errors.role || !phone || !choice) {
    return { ok: false, errors };
  }
  return { ok: true, value: { name, phone, ...choice } };
}

/** One of someone's shifts, as the person's page counts what lies ahead. */
export type ShiftAhead = {
  /** YYYY-MM-DD, the business's own day. */
  day: string;
  /** HH:MM, the business's own clock. */
  start: string;
  /** In a published week, or a draft. */
  published: boolean;
};

/**
 * How many of someone's shifts have not started at `now`, in published weeks
 * and in drafts: what taking them off the staff takes off them, as the
 * database counts it (a shift's start in the business's time zone, later than
 * the moment). Shifts begun or past stay theirs.
 */
export function countShiftsAhead(
  shifts: readonly ShiftAhead[],
  timeZone: string,
  now: Date,
): Pick<LeftCounts, "shifts" | "drafts"> {
  let published = 0;
  let drafts = 0;
  for (const shift of shifts) {
    if (
      instantIn(shift.day, shift.start, timeZone).getTime() <= now.getTime()
    ) {
      continue;
    }
    if (shift.published) published += 1;
    else drafts += 1;
  }
  return { shifts: published, drafts };
}
