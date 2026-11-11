import type { ChatFailure } from "@db/chat";
import type { ChatFileFailure } from "@db/chat-files";

/**
 * Why a chat action was refused, for the screens' words: the database's
 * reasons (`ChatFailure` in @db/chat: noAccess, invalid, closed, tooFast,
 * notYet, failed), and the app's own two.
 */
export type ChatActionFailure =
  | ChatFailure
  /** Viewing the business as someone: the ConceptApp team reads no chat. */
  | "viewOnly"
  /**
   * The person switched business after the screen was drawn (payroll P3b):
   * refused, never written in the other one.
   */
  | "businessChanged";

export type ChatActionResult<T = null> =
  | { ok: true; value: T }
  | { ok: false; failure: ChatActionFailure };

/**
 * Why a picture was refused (`sendChatImageAction`, C4): a message's
 * reasons, what the server found in the file (empty, tooBig, type, metadata,
 * pixels: the app's own re-encoding didn't make it), a demo business that
 * takes no files ("demo"), and the project's Storage full ("noRoom": the
 * words can still go as a message). Their words are
 * `app.chat.fileFailure.<failure>`, and `tooFast` and `businessChanged` are
 * `app.chat.conversation`'s.
 */
export type ChatImageFailure = ChatActionFailure | ChatFileFailure;

export type ChatImageResult =
  | { ok: true; value: { conversation: string; message: string } }
  | { ok: false; failure: ChatImageFailure };

/** Someone of a group, named, and when they confirmed an announcement (null: not yet). */
export type ReaderShown = {
  person: string;
  ackedAt: string | null;
  name: string | null;
  photo: string | null;
};

/** Who confirmed an announcement, in the order they did, and who not yet, by name. */
export type ChatReaders = { confirmed: ReaderShown[]; waiting: ReaderShown[] };
