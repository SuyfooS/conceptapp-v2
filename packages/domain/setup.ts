import type { Role } from "./modules";

/**
 * The checklist the admin console shows once a business is open: what the
 * onboarder has done and what is left before the business can start. Each
 * item is worked out from the business as stored, never ticked by hand.
 */

export type SetupFacts = {
  /** Active members plus open invites, by role. */
  people: { owner: number; manager: number; worker: number };
  hasAddress: boolean;
};

export const SETUP_ITEMS = ["opened", "owner", "staff", "address"] as const;
export type SetupItemKey = (typeof SETUP_ITEMS)[number];

export type SetupItem = { key: SetupItemKey; done: boolean };

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

export function setupChecklist(facts: SetupFacts): SetupItem[] {
  const done: Record<SetupItemKey, boolean> = {
    // The checklist only exists for a business that was opened.
    opened: true,
    owner: facts.people.owner > 0,
    staff: hasStaff(facts.people),
    address: facts.hasAddress,
  };
  return SETUP_ITEMS.map((key) => ({ key, done: done[key] }));
}

/** How many items are still open. */
export function setupRemaining(items: readonly SetupItem[]): number {
  return items.filter((item) => !item.done).length;
}
