/**
 * Where the keyboard's focus goes around a deleted invite on the Team
 * screen (accessibility, part 6), with no React: back on its "מחיקת ההזמנה"
 * once "ביטול" brought it back, brought into view, else on the title of the
 * invites' section, else the page's own title.
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

/** What is read and asked of an element brought into view as it is focused. */
export type Viewed = Pick<EventTarget, "addEventListener"> & {
  getBoundingClientRect(): { top: number; bottom: number };
  scrollIntoView(options?: ScrollIntoViewOptions): void;
};

/**
 * `element`, brought into view the next time it takes the focus, when any
 * of it is out of view then: "ביטול" brings the invite's row back where it
 * was, which on a phone's or a tablet's list can be far above "ביטול" under
 * it, and the focus is put there without moving the page
 * (`focusWhenGone`), so its ring would be out of sight. Centred, clear of
 * what floats over the page's edges (the title, the tab bar). Once.
 */
export function inViewWhenFocused<T extends Viewed>(
  element: T | null,
  view: { innerHeight: number } = globalThis as unknown as {
    innerHeight: number;
  },
): T | null {
  element?.addEventListener(
    "focus",
    () => {
      const { top, bottom } = element.getBoundingClientRect();
      if (top < 0 || bottom > view.innerHeight) {
        element.scrollIntoView({ block: "center" });
      }
    },
    { once: true },
  );
  return element;
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
