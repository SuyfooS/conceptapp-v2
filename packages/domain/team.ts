import { atLeast, type Role } from "./modules";

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
  /** Owners first, then managers, then workers; by name within a role. */
  members: TeamMember[];
  /** Open invites first, then expired ones; by role and name within each. */
  invites: (TeamInvite & { state: InviteState })[];
  counts: { members: number; open: number; expired: number };
};

const ROLE_ORDER: Record<Role, number> = { owner: 0, manager: 1, worker: 2 };

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
