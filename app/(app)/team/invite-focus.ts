/**
 * Where the keyboard's focus goes around a deleted invite on the Team
 * screen (accessibility, part 6), with no React: back on its "מחיקת ההזמנה"
 * once "ביטול" brought it back, else on the title of the invites' section,
 * else the page's own title.
 */

/** The attribute each "מחיקת ההזמנה" carries: its invite's id. */
export const INVITE_CANCEL = "data-invite-cancel";

/** A CSS string's own characters, so any id reads as itself in a selector. */
const cssString = (text: string) =>
  text.replace(/["\\]/g, "\\$&").replace(/\n/g, "\\a ");

/**
 * Every shape's "מחיקת ההזמנה" for this invite: the lists' and the
 * table's. The one on screen takes the focus back after "ביטול".
 */
export function inviteCancelTarget(inviteId: string): string {
  return `[${INVITE_CANCEL}="${cssString(inviteId)}"]`;
}

/** The title of the section an element is in, if it has one. */
export function sectionTitle(
  inside: Pick<Element, "closest"> | null | undefined,
): Element | null {
  return inside?.closest("section")?.querySelector("h2, h3") ?? null;
}

/**
 * Whether any of the section's invites is still on screen, `gone` aside:
 * while one is, the section stays where it is once the screen is read
 * again, and its title can keep the focus. With none left, a phone's and a
 * tablet's lists put the invites after the team, drawing their section
 * anew, so the page's title takes it instead.
 */
export function invitesLeft(
  ids: readonly string[],
  gone: ReadonlySet<string>,
): boolean {
  return ids.some((id) => !gone.has(id));
}
