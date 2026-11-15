import { instantIn } from "./availability";
import { atLeast, isStaff, ROLES, type Role } from "./modules";
import { normalizeIsraeliMobile } from "./phone";
import type { AddressForm } from "./profile";

/**
 * The Team screen's rules, free of React and the database: who may open
 * it, and how the people in a business are grouped and counted.
 */

/** Owners and managers see the team; workers do not. */
export function canSeeTeam(role: Role): boolean {
  return atLeast(role, "manager");
}

export type TeamMember = {
  userId: string;
  /** Null when nobody wrote one down. */
  name: string | null;
  phone: string | null;
  role: Role;
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
 * The roles only an owner gives: another owner, and an accountant, who sees
 * everyone's hours and pay (Orel, 8 November 2026). The ConceptApp team gives
 * them from the console too.
 */
const OWNER_ONLY_ROLES: readonly Role[] = ["owner", "accountant"];

/**
 * The roles an owner or manager may give someone they invite. A manager
 * invites managers and workers; an owner also invites an owner or an
 * accountant. The database checks the same rule (team_invite).
 */
export function invitableRoles(role: Role): Role[] {
  if (!canSeeTeam(role)) return [];
  return ROLES.filter((r) => role === "owner" || !OWNER_ONLY_ROLES.includes(r));
}

/** May someone in `role` send a link for an invite with `inviteRole`? */
export function canResendInvite(role: Role, inviteRole: Role): boolean {
  return invitableRoles(role).includes(inviteRole);
}

/**
 * May someone in `role` cancel an invite with `inviteRole`? The same rule as
 * sending its link (`public.team_invite_cancel`).
 */
export function canCancelInvite(role: Role, inviteRole: Role): boolean {
  return canResendInvite(role, inviteRole);
}

/** Someone on the team, as the rules for changing it see them. */
export type TeamPlace = { userId: string; role: Role };

/**
 * Whoever may invite to a role may take someone off the team from it, and
 * change someone from it and to it (Orel, 14 November 2026): an owner acts on
 * everyone, a manager on managers and workers. Never on oneself, which the
 * person's own profile is for. The database checks the same
 * (`public.remove_member`, `private.gives_role`), and also that the business
 * keeps an owner (`leavesNoOwner`).
 */
export function canRemoveMember(viewer: TeamPlace, person: TeamPlace): boolean {
  return (
    viewer.userId !== person.userId &&
    invitableRoles(viewer.role).includes(person.role)
  );
}

/**
 * May someone in `viewerRole` change someone's role from `from` to `to`?
 * Both must be roles they invite to. The same role changes nothing, and is
 * allowed (`public.set_member_role` returns `changed: false`).
 */
export function mayChangeRole(viewerRole: Role, from: Role, to: Role): boolean {
  const mine = invitableRoles(viewerRole);
  return mine.includes(from) && mine.includes(to);
}

/**
 * The roles the viewer may give the person instead of theirs, in the usual
 * order; none when they may not change it at all (`canRemoveMember`).
 */
export function roleChoices(viewer: TeamPlace, person: TeamPlace): Role[] {
  if (!canRemoveMember(viewer, person)) return [];
  return invitableRoles(viewer.role).filter((role) => role !== person.role);
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
 *   notAllowed  42501: the viewer may not act on this role, or is no longer
 *               an owner or manager of the business
 *   gone        P0002: the person is no longer on the team, or the invite is
 *               no longer open (claimed, cancelled)
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
  "gone",
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
      return "notAllowed";
    case "P0002":
      return "gone";
    case "22023":
      return "yourself";
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

export type TeamInviteInput = {
  name: string;
  /** Canonical E.164. */
  phone: string;
  role: Role;
};

export type TeamInviteErrors = {
  name?: "required" | "tooLong";
  phone?: "required" | "invalid";
  role?: "required" | "notAllowed";
};

/**
 * Checks the Team screen's invite form for someone in `actorRole`: a name,
 * an Israeli mobile (any format; `PhoneField` already submits E.164) and a
 * role they may give.
 */
export function parseTeamInvite(
  input: Partial<Record<keyof TeamInviteInput, unknown>>,
  actorRole: Role,
):
  | { ok: true; value: TeamInviteInput }
  | { ok: false; errors: TeamInviteErrors } {
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  const name = text(input.name).trim().replace(/\s+/g, " ");
  const rawPhone = text(input.phone).trim();
  const phone = normalizeIsraeliMobile(rawPhone);
  const role = text(input.role) as Role;
  const errors: TeamInviteErrors = {};

  if (!name) errors.name = "required";
  else if (name.length > TEAM_NAME_MAX) errors.name = "tooLong";

  if (!rawPhone) errors.phone = "required";
  else if (!phone) errors.phone = "invalid";

  if (!role) errors.role = "required";
  else if (!invitableRoles(actorRole).includes(role)) {
    errors.role = "notAllowed";
  }

  if (errors.name || errors.phone || errors.role || !phone) {
    return { ok: false, errors };
  }
  return { ok: true, value: { name, phone, role } };
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
