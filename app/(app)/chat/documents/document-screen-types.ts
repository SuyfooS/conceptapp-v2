import type {
  DocumentCategory,
  DocumentDirection,
  DocumentReader,
  DocumentRemoveReason,
} from "@domain/documents";
import type { DocumentPerson, DocumentShown } from "@domain/documents-screen";
import type {
  DocumentActionResult,
  DocumentPdfCancelResult,
  DocumentPdfStartResult,
  DocumentSentResult,
} from "./document-types";

/*
 * What the documents' screens (chat C7) take, for the app's pages and the
 * design demo's mock screens alike: data that crosses to the browser, and
 * the actions bound to the business the screen was drawn for (the demo's
 * store nothing). Types only.
 */

/** Names and photos by person id (lower case), for everyone the documents name. */
export type DocumentPeople = Record<
  string,
  {
    name: string | null;
    photo: string | null;
    /** No longer active in the business. */
    former: boolean;
  }
>;

/** The business's clock: its zone, today's date there, and now (ISO). */
export type DocumentClock = { timeZone: string; today: string; now: string };

/** `/chat/documents`: the office's documents, or a person's own. */
export type DocumentsScreenData = {
  business: string;
  reader: DocumentReader;
  clock: DocumentClock;
  /** The office (every document) or someone on the staff (their own). */
  mode: "office" | "staff";
  /** Sends documents to people: a manager who isn't in the office sees "שלחת". */
  sends: boolean;
  /**
   * Newest first. For the office: the newest 200, every one waiting for the
   * reader, and the chosen person's newest 200.
   */
  documents: DocumentShown[];
  /** For a sender outside the office: what they sent to people. */
  sent: DocumentShown[] | null;
  people: DocumentPeople;
  /**
   * For the office: everyone the business's documents are about, each
   * counted over every document (never only those in `documents`), with how
   * many wait for the reader. Empty for someone on the staff.
   */
  directory: DocumentPerson[];
  /** The office's one notice to keep a copy, until someone there read it. */
  notice: boolean;
  /** The office's chosen person (`?person=`), on a tablet and a phone. */
  person: string | null;
  /** Every month with documents, newest first, for a month's download. */
  months: string[];
  /** The database hasn't documents yet. */
  notYet: boolean;
};

/** `/chat/documents/[id]`. */
export type DocumentPageData = {
  business: string;
  reader: DocumentReader;
  clock: DocumentClock;
  document: DocumentShown;
  people: DocumentPeople;
  /** The reasons the reader may remove its file with now (`canRemoveDocument`). */
  removable: DocumentRemoveReason[];
  /** Whether the reader may put its file back now (`canRestoreDocument`). */
  restorable: boolean;
  demo: boolean;
};

/** Someone a document to people can go to. */
export type DocumentRecipientChoice = {
  id: string;
  name: string | null;
  photo: string | null;
};

/** `/chat/documents/send`. */
export type DocumentSendData = {
  business: string;
  me: string;
  /** A demo business: no title or note, the category's words instead. */
  demo: boolean;
  /** "demo": samples only; "notYet": nothing takes a file yet. */
  files: "yes" | "demo" | "notYet";
  /** On the staff: sends to the business. */
  toBusiness: boolean;
  /** A sender: sends to people. */
  toPeople: boolean;
  /** Everyone on the staff but the sender. */
  people: DocumentRecipientChoice[];
  /** The live departments, each with its people on the staff. */
  departments: { id: string; name: string; members: string[] }[];
};

/** Today's part. */
export type DocumentsTodayData = {
  business: string;
  reader: DocumentReader;
  clock: DocumentClock;
  /** Sent to them asking for "קראתי", newest first. */
  toConfirm: DocumentShown[];
  /** How many ask for their "קראתי" in all, past those in `toConfirm` too. */
  toConfirmCount: number;
  /** For the office: to the business, nobody there opened yet. */
  waiting: DocumentShown[];
  /** How many wait for the office in all, past those in `waiting` too. */
  waitingCount: number;
  people: DocumentPeople;
};

/** A document's fields as the send screen sends them (`DocumentSendInput`). */
export type DocumentSending = {
  direction: DocumentDirection;
  category: DocumentCategory;
  title: string;
  note?: string;
  to?: string[];
  asks?: boolean;
};

/** The writes the send screen makes, bound to its business. */
export type DocumentSendActions = {
  photo: (form: FormData) => Promise<DocumentSentResult>;
  startPdf: (input: {
    direction: DocumentDirection;
    name: string;
    size: number;
  }) => Promise<DocumentPdfStartResult>;
  finishPdf: (
    input: DocumentSending & { upload: string },
  ) => Promise<DocumentSentResult>;
  cancelPdf: (input: { upload: string }) => Promise<DocumentPdfCancelResult>;
  sample: (input: {
    direction: DocumentDirection;
    category: DocumentCategory;
    to?: string[];
    asks?: boolean;
  }) => Promise<DocumentSentResult>;
};

/** The writes a document's page makes, bound to its business. */
export type DocumentPageActions = {
  confirm: (document: string) => Promise<DocumentActionResult>;
  remove: (
    document: string,
    reason: DocumentRemoveReason,
  ) => Promise<DocumentActionResult>;
  restore: (document: string) => Promise<DocumentActionResult>;
};
