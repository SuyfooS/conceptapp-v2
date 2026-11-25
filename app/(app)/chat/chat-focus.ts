import {
  type DocLike,
  focusLost as lostOnPage,
  onScreen,
  PAGE_TITLE,
} from "@ui/focus-after";

/**
 * Marks the chat list (InboxPane): on a phone the /chat screen itself, from
 * tablet up the list that stays beside every chat screen.
 */
export const CHAT_LIST = "data-chat-list";

const IN_CHAT_LIST = `[${CHAT_LIST}]`;

/** The page the code runs in, none on the server. */
function thePage(): DocLike | undefined {
  return globalThis.document as DocLike | undefined;
}

/**
 * Whether nothing holds the keyboard's focus any more (`focusLost` in
 * @ui/focus-after): it fell to the page, or it is on something no longer
 * drawn (the chat list a phone just put away, or a screen kept hidden for
 * going back), where the browser hasn't moved it yet, or in a sheet that is
 * closing (what was chosen there took the screen along). The chat screens
 * then put it somewhere that makes sense: Next leaves the focus where it was
 * on a navigation.
 */
export function focusLost(doc: DocLike | undefined = thePage()): boolean {
  return lostOnPage(doc);
}

/**
 * Whether a chat screen that just opened gives its title the keyboard's
 * focus: it is lost (on a phone the list that opened it went), or it is
 * still in the chat list beside the screen, from tablet up, on the row or
 * the "שליחת הודעה" that opened it. Every chat screen has the same page
 * title, so Next's route announcer says nothing of the move: the title
 * taking the focus is what a screen reader hears, and where the keyboard
 * goes on from.
 */
export function titleTakesFocus(doc: DocLike | undefined = thePage()): boolean {
  if (!doc) return false;
  if (lostOnPage(doc)) return true;
  return Boolean(doc.activeElement?.closest(IN_CHAT_LIST));
}

/**
 * The title of the chat screen beside the list, as drawn now: a
 * conversation's, or the announcements'. Never the list's own (a phone's
 * /chat, or the tablet's beside nothing chosen).
 */
export function screenTitle(
  doc: Pick<DocLike, "querySelectorAll"> | undefined = thePage(),
): HTMLElement | null {
  for (const title of doc?.querySelectorAll(PAGE_TITLE) ?? []) {
    if (onScreen(title) && !title.closest(IN_CHAT_LIST)) return title;
  }
  return null;
}
