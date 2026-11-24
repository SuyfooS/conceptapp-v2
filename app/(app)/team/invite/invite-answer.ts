/**
 * What the invite form does with a refusal of its action, for a screen
 * reader as much as for the eye (accessibility, part 6): which field takes
 * the focus, and where the focus is as the refusal arrives, for
 * `answerHeard` (`app/(auth)/step-results.ts`), as sign-in's number does.
 */

import type { TeamInviteErrors } from "@domain/team";
import { type DocLike, focusLost } from "@ui/focus-after";
import type { FocusAt } from "../../../(auth)/step-results";

/**
 * The fields whose refusal is their own, in the form's order: marked
 * invalid, read with why. The role's is its list's own line, an alert, and
 * every other refusal one above the press.
 */
export const OWN_FIELDS = ["name", "phone"] as const;

export type OwnField = (typeof OWN_FIELDS)[number];

/** The first field refused, in the form's order, if any was. */
export function firstRefused(
  errors: TeamInviteErrors | undefined,
): OwnField | null {
  return OWN_FIELDS.find((field) => errors?.[field] !== undefined) ?? null;
}

/**
 * Where the focus is as a refusal arrives, for `field`, the first refused:
 * on it; lost (`focusLost`: on the page, on the press disabled while it
 * waited), or anywhere else in the same form (another field the form was
 * sent from, the press that waited), where the first refused takes it;
 * else elsewhere, outside the form (the way back to the team), where it
 * stays.
 */
export function refusedAt(
  field: Element,
  doc: DocLike | undefined = globalThis.document as DocLike | undefined,
): FocusAt {
  const active = doc?.activeElement ?? null;
  if (active === field) return "field";
  if (active === null || focusLost(doc)) return "lost";
  const form = field.closest("form");
  return form !== null && active.closest("form") === form
    ? "lost"
    : "elsewhere";
}
