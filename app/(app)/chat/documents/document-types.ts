import type {
  DocumentFailure,
  DocumentFileFailure,
  DocumentPdfStart,
} from "@db/documents";

/**
 * Why a documents action was refused (chat C7), for the screens' words: the
 * database's reasons (`DocumentFailure` in @db/documents: noAccess, invalid,
 * closed, demo, tooFast, full, noRoom, tooMany, notYet, failed), the app's own
 * two, and with a file of its own a photo's (empty, tooBig, type, metadata,
 * pixels) and a PDF's (notPdf, notUploaded, expired). Their words are
 * `app.chat.documents.failure.<failure>`.
 */
export type DocumentActionFailure =
  | DocumentFailure
  | DocumentFileFailure
  /** Viewing the business as someone: the ConceptApp team reads no document. */
  | "viewOnly"
  /**
   * The person switched business after the screen was drawn: refused, never
   * written in the other one.
   */
  | "businessChanged";

export type DocumentActionResult<T = null> =
  | { ok: true; value: T }
  | { ok: false; failure: DocumentActionFailure };

/** A document sent: its id, for its page (`/chat/documents/<id>`) and its "ביטול". */
export type DocumentSentResult = DocumentActionResult<{ document: string }>;

/** What the browser gets to put a document's PDF in Storage. */
export type DocumentPdfStartResult = DocumentActionResult<DocumentPdfStart>;

/** A stop: whether the PDF was sent after all, and then its document. */
export type DocumentPdfCancelResult = DocumentActionResult<{
  sent: boolean;
  document: string | null;
}>;
