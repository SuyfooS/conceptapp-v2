import { atLeast, ROLES, type Role } from "./modules";
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
