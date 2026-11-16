import type { Role } from "@domain/modules";
import type { LeftCounts, TeamChangeFailure } from "@domain/team";

/**
 * Why a team change from the screens was not made: the database's refusal
 * (`TeamChangeFailure`), `notYet` before its migration reaches the project,
 * or the screen's own: `noAccess` (no longer editing the team here),
 * `viewOnly` (viewing as someone), `businessChanged` (the person switched
 * business since the screen was drawn, payroll P3b) and `invalid`.
 */
export type TeamChangeActionFailure =
  | TeamChangeFailure
  | "notYet"
  | "noAccess"
  | "viewOnly"
  | "businessChanged"
  | "invalid";

/** Taking someone off the team, or changing their role. */
export type MemberChangeResult =
  | { ok: true; left: LeftCounts }
  | { ok: false; failure: TeamChangeActionFailure };

/** Cancelling an invite nobody claimed. */
export type InviteCancelResult =
  | { ok: true }
  | { ok: false; failure: TeamChangeActionFailure };

/**
 * What the person's page can change, bound by the page to the business it
 * was drawn for: the server refuses them in any other. The demo passes
 * stand-ins that store nothing.
 */
export type MemberChangeActions = {
  remove: (personId: string) => Promise<MemberChangeResult>;
  /** `seenRole`: the role the screen showed, so a change made meanwhile stays. */
  setRole: (
    personId: string,
    role: Role,
    seenRole: Role,
  ) => Promise<MemberChangeResult>;
};

/** Cancelling an invite from the Team screen, bound the same way. */
export type CancelInvite = (inviteId: string) => Promise<InviteCancelResult>;

/** No shifts came off. */
export const NOTHING_LEFT: LeftCounts = {
  shifts: 0,
  drafts: 0,
  swaps: 0,
  reopened: 0,
};
