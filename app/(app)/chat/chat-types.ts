import type { ChatFailure } from "@db/chat";

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

/** Someone of a group, named, and when they confirmed an announcement (null: not yet). */
export type ReaderShown = {
  person: string;
  ackedAt: string | null;
  name: string | null;
  photo: string | null;
};

/** Who confirmed an announcement, in the order they did, and who not yet, by name. */
export type ChatReaders = { confirmed: ReaderShown[]; waiting: ReaderShown[] };
