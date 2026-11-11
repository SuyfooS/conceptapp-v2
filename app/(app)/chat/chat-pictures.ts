import type { ChatImageFailure } from "./chat-types";

/*
 * Pictures in a conversation (chat C4), free of React: the form the
 * conversation screen sends (`sendChatImageAction`), and what it does when a
 * picture is refused. Neither a client nor a server file: the screen and its
 * tests read it.
 */

/** Why a picture couldn't be made ready on the phone (@ui/photo-encode). */
export type PickProblem = "unreadable" | "tooBig" | "type";

/** The words of a picture that didn't go or couldn't be made ready (`app.chat.fileFailure`). */
export type PictureWords =
  | "demo"
  | "noRoom"
  | "empty"
  | "tooBig"
  | "type"
  | "metadata"
  | "pixels"
  | "failed"
  | "unreadable";

/** What the screen says over the field: a message's words, or a picture's. */
export type ComposerNotice =
  | { of: "conversation"; key: "tooFast" | "businessChanged" }
  | { of: "fileFailure"; key: PictureWords };

/**
 * What the screen does next with a picture the server refused (`next`):
 * - `retry`: it stays on screen as not sent, with its way to try again (the
 *   same draft, so it never goes twice): the network, the database not ready,
 *   a file that didn't arrive whole, too many in a minute, a business
 *   switched since;
 * - `drop`: it can't go as it is (a demo business, no room in Storage, a
 *   file the server takes for no picture of the app's own): it leaves the
 *   conversation, and what was written with it goes back to the field, so
 *   the words can still be sent ("את ההודעה עצמה אפשר לשלוח");
 * `notice` is what is said over the field, and `refresh` draws the screen
 * again where the chat closed or is no longer the person's.
 */
export function pictureRefusal(failure: ChatImageFailure): {
  next: "retry" | "drop";
  notice: ComposerNotice | null;
  refresh: boolean;
} {
  switch (failure) {
    case "demo":
    case "noRoom":
    case "tooBig":
    case "type":
    case "metadata":
    case "pixels":
      return {
        next: "drop",
        notice: { of: "fileFailure", key: failure },
        refresh: false,
      };
    case "empty":
      return {
        next: "retry",
        notice: { of: "fileFailure", key: "empty" },
        refresh: false,
      };
    case "tooFast":
    case "businessChanged":
      return {
        next: "retry",
        notice: { of: "conversation", key: failure },
        refresh: false,
      };
    case "closed":
    case "noAccess":
      return { next: "retry", notice: null, refresh: true };
    case "viewOnly":
      return { next: "retry", notice: null, refresh: false };
    case "failed":
    case "notYet":
    case "invalid":
      return {
        next: "retry",
        notice: { of: "fileFailure", key: "failed" },
        refresh: false,
      };
    default: {
      const unhandled: never = failure;
      return unhandled;
    }
  }
}

/** A picture made ready on the phone, as it goes: the picture and its thumbnail. */
export type PictureFiles = { full: Blob; thumb: Blob };

/**
 * The form `sendChatImageAction` takes: both files (named for their type),
 * the draft, the words (empty when none), and where: a conversation, as an
 * announcement or not, or someone whose private chat it opens.
 */
export function pictureForm(
  files: PictureFiles,
  message: { draft: string; words: string; announce?: boolean },
  where: { conversation: string } | { toPerson: string },
): FormData {
  const extension = files.full.type === "image/jpeg" ? "jpg" : "webp";
  const form = new FormData();
  form.set("full", files.full, `photo.${extension}`);
  form.set("thumb", files.thumb, `photo-s.${extension}`);
  form.set("draft", message.draft);
  form.set("words", message.words);
  if ("conversation" in where) {
    form.set("conversation", where.conversation);
    if (message.announce) form.set("announce", "true");
  } else {
    form.set("toPerson", where.toPerson);
  }
  return form;
}
