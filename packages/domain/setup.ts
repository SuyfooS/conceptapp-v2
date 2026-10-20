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

export function setupChecklist(facts: SetupFacts): SetupItem[] {
  const { owner, manager, worker } = facts.people;
  const done: Record<SetupItemKey, boolean> = {
    // The checklist only exists for a business that was opened.
    opened: true,
    owner: owner > 0,
    staff: manager + worker > 0,
    address: facts.hasAddress,
  };
  return SETUP_ITEMS.map((key) => ({ key, done: done[key] }));
}

/** How many items are still open. */
export function setupRemaining(items: readonly SetupItem[]): number {
  return items.filter((item) => !item.done).length;
}
