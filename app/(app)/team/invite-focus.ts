/**
 * Where the keyboard's focus goes around a deleted invite on the Team
 * screen (accessibility, part 6), with no React: back on its "מחיקת ההזמנה"
 * once "ביטול" brought it back, brought into view (`inViewWhenFocused`, in
 * `@ui/focus-after`), else on the title of the invites' section, else the
 * page's own title.
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

/**
 * Whether a section says what became of deleted invite `id`
 * (`InviteCancelUndo`): its "ביטול" while it waits (`held`), or why it
 * couldn't be deleted (`refusal`). One that lists every invite (no `ids`:
 * the desktop's table) says it of any; one that lists some (`ids`: a phone's
 * and a tablet's "עוד לא קיבלו קישור" and the invites under it) of its own.
 * The line above a phone's and a tablet's lists (`strays`: every invite the
 * screen read) says only a refusal of one it reads no more, claimed or
 * deleted meanwhile ("gone"), which neither list says, so each shape says
 * every refusal once.
 */
export function cancelSaid(
  id: string,
  what: "held" | "refusal",
  where: { ids?: readonly string[]; strays?: readonly string[] },
): boolean {
  if (where.strays) return what === "refusal" && !where.strays.includes(id);
  return where.ids === undefined || where.ids.includes(id);
}
