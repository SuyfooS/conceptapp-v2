import { z } from "zod";
import { checkStillPhoto, type ListPhotoCheck } from "./list-photos";
import { tidyLine } from "./typed-text";

/**
 * Official documents (C6 of the chat plan; Orel's answers of 11 November 2026
 * on issue #1), in the database since supabase/migrations/
 * 20261111000700_documents.sql, on screen from C7. They go two ways:
 *
 * - **to the business** (`from_person`): anyone on the staff sends a sick
 *   note, a form or another document. Its person and the office read it.
 * - **to people** (`to_people`): an owner, a holder of `chat.send_documents`
 *   (managers by default) or someone in the office sends a payslip, a
 *   contract, a procedure, a form or another document to people the screen
 *   picks (one, a department or everyone, at most 200), asking them for
 *   "קראתי" or not. Its recipients, its sender and the office read it.
 *
 * The office is the business's active members who hold `clock.payroll`:
 * owners and accountants always, managers when the owner gives it. A manager
 * without pay access reads no worker's document and learns nothing of one,
 * and a view session reads none. Someone who left keeps reading their own and
 * those sent to them.
 *
 * Kept forever: nothing deletes a row. A document's FILE can be removed, never
 * its row: by its sender in their first 10 minutes ("taken back"), or by the
 * office with a reason from a list, never free text (a reason typed there
 * could carry the very health details it removes). Whoever removed it puts it
 * back within 10 minutes; then the chat job removes the file and the row stays,
 * saying its file is gone. A business's documents are never deleted for space:
 * past its `documentSpaceMb` (50 MB unless the team chose 100 or 200) new ones
 * are refused.
 *
 * Nothing about a document's category, title, note or file ever reaches a
 * notification's params, a push, the activity log's details or a log line: a
 * sick note is health data. Lines and log rows hold ids and codes only.
 */

/** The two ways a document goes, as the database keeps them. */
export const DOCUMENT_DIRECTIONS = ["to_people", "from_person"] as const;
export type DocumentDirection = (typeof DOCUMENT_DIRECTIONS)[number];

/** Every category, in the database's own order (its check on `category`). */
export const DOCUMENT_CATEGORY_KEYS = [
  "sick_note",
  "payslip",
  "contract",
  "procedure",
  "form",
  "other",
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORY_KEYS)[number];

/**
 * The categories each way takes, in the order the send screen offers them:
 * to the business a sick note, a form or another document; to people anything
 * but a sick note (public.send_document, 22023 otherwise).
 */
export const DOCUMENT_CATEGORIES = {
  from_person: ["sick_note", "form", "other"],
  to_people: ["payslip", "contract", "procedure", "form", "other"],
} as const satisfies Record<DocumentDirection, readonly DocumentCategory[]>;

/** Whether a category goes this way. */
export function takesCategory(
  direction: DocumentDirection,
  category: DocumentCategory,
): boolean {
  return (DOCUMENT_CATEGORIES[direction] as readonly string[]).includes(
    category,
  );
}

export function isDocumentDirection(
  value: unknown,
): value is DocumentDirection {
  return DOCUMENT_DIRECTIONS.some((direction) => direction === value);
}

export function isDocumentCategory(value: unknown): value is DocumentCategory {
  return DOCUMENT_CATEGORY_KEYS.some((category) => category === value);
}

/**
 * A demo business's samples (plan §13): its documents take no uploaded file
 * (unless its definition says "chatFiles": true, the local seed's restaurant),
 * only one of these, of its own category, served from the app's own files
 * (`public/demo-documents/`, with the /document-files route, in C7).
 */
export const DOCUMENT_SAMPLES = ["payslip", "procedure", "sick_note"] as const;
export type DocumentSample = (typeof DOCUMENT_SAMPLES)[number];

export function isDocumentSample(value: unknown): value is DocumentSample {
  return DOCUMENT_SAMPLES.some((sample) => sample === value);
}

/**
 * Why a document's file was removed, as the database keeps it (its check on
 * `removed_reason`; modules/chat/documents.db.test.ts and tooling/documents
 * keep the two the same). Never free text.
 */
export const DOCUMENT_REMOVE_REASONS = [
  "taken_back",
  "wrong_person",
  "wrong_file",
  "duplicate",
  "other",
] as const;
export type DocumentRemoveReason = (typeof DOCUMENT_REMOVE_REASONS)[number];

/** The reasons the office chooses from; "taken_back" is the sender's alone. */
export const OFFICE_REMOVE_REASONS = [
  "wrong_person",
  "wrong_file",
  "duplicate",
  "other",
] as const satisfies readonly DocumentRemoveReason[];
export type OfficeRemoveReason = (typeof OFFICE_REMOVE_REASONS)[number];

export function isDocumentRemoveReason(
  value: unknown,
): value is DocumentRemoveReason {
  return DOCUMENT_REMOVE_REASONS.some((reason) => reason === value);
}

/** How long after sending its sender may take a document back ("ביטול"). */
export const DOCUMENT_TAKE_BACK_MINUTES = 10;
/** How long a removed document's file waits for its undo (`file_gone_after`). */
export const DOCUMENT_UNDO_MINUTES = 10;

/** A document's title, in characters, as the database keeps it. */
export const DOCUMENT_TITLE_MAX = 80;
/** Its note, in characters. */
export const DOCUMENT_NOTE_MAX = 300;
/** People one document goes to, at most. */
export const DOCUMENT_RECIPIENTS_MAX = 200;

/** The private bucket documents' files are kept in. */
export const DOCUMENT_BUCKET = "documents";

/**
 * A photo of a page (C7's `encodeDocumentPhoto`): larger than a chat
 * picture, so a sick note stays legible. At most 1600 px on its long side
 * (about 136 dpi for an A4 page), aimed at 500 KB, never over 700 KB, and
 * one file, with no thumbnail.
 */
export const DOCUMENT_PHOTO_PIXELS = 1600;
export const DOCUMENT_PHOTO_TARGET_BYTES = 500 * 1024;
export const DOCUMENT_PHOTO_MAX_BYTES = 700 * 1024;
/** A PDF, as in chat (Orel's 10 MB), through a signed upload. */
export const DOCUMENT_PDF_MAX_BYTES = 10 * 1024 * 1024;

/** A business's space for documents, in MB (a setting for the team). */
export const DOCUMENT_SPACE_MB = [50, 100, 200] as const;
export const DEFAULT_DOCUMENT_SPACE_MB = 50;

/**
 * Past this much in Storage, across the project, no new document is taken
 * (private.documents_guard_bytes): 980 MB of the free plan's 1 GB. Chat files
 * stop at 900 MB, so documents, which are never deleted for space, get the
 * last of it.
 */
export const DOCUMENTS_GUARD_BYTES = 980 * 1024 * 1024;

/**
 * A photo of a page as the server checks it before it uploads it (C7): a JPEG
 * or WebP by its bytes (and as the browser says), at most 700 KB, nothing from
 * the camera inside, still, its longest side at most 1600 px. A chat
 * picture's checks with a document's sizes.
 */
export function checkDocumentPhoto(file: {
  type: string;
  size: number;
  bytes: Uint8Array;
}): ListPhotoCheck {
  return checkStillPhoto(file, {
    maxBytes: DOCUMENT_PHOTO_MAX_BYTES,
    maxPixels: DOCUMENT_PHOTO_PIXELS,
  });
}

/** A line break or any other control character. */
const CONTROL = /[\p{Cc}\u2028\u2029]/u;

/** A document's title ready to send, or why it isn't. */
export type CheckedDocumentTitle =
  | { ok: true; title: string }
  | { ok: false; reason: "empty" | "tooLong" | "control" };

/**
 * Cleans a title and checks it as public.send_document will: one line
 * (`tidyLine`), 1 to 80 characters, no control character. In a demo business
 * the database writes the category's own words instead, whatever was typed.
 */
export function checkDocumentTitle(text: string): CheckedDocumentTitle {
  const title = tidyLine(text);
  if (!title) return { ok: false, reason: "empty" };
  if (CONTROL.test(title)) return { ok: false, reason: "control" };
  if ([...title].length > DOCUMENT_TITLE_MAX) {
    return { ok: false, reason: "tooLong" };
  }
  return { ok: true, title };
}

/** A note ready to send (null for none), or why it isn't. */
export type CheckedDocumentNote =
  | { ok: true; note: string | null }
  | { ok: false; reason: "tooLong" };

/** Any control character but a line break. */
const CONTROL_BUT_BREAK = /[^\P{Cc}\n]/gu;

/**
 * Cleans a note and checks it as public.send_document will: line breaks kept
 * (as "\n"), a tab as a space, any other control character dropped, trimmed;
 * nothing left is none, else at most 300 characters. A demo business takes
 * none (22023).
 */
export function checkDocumentNote(
  text: string | null | undefined,
): CheckedDocumentNote {
  const note = (text ?? "")
    .normalize("NFC")
    .replace(/\r\n?|[\u2028\u2029]/g, "\n")
    .replace(/\t/g, " ")
    .replace(CONTROL_BUT_BREAK, "")
    .trim();
  if (!note) return { ok: true, note: null };
  if ([...note].length > DOCUMENT_NOTE_MAX) {
    return { ok: false, reason: "tooLong" };
  }
  return { ok: true, note };
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const KEY = "[0-9a-f]{32}";
const PATH = new RegExp(`^(${UUID})/(${KEY})\\.(pdf|webp|jpg)$`);

/** A stored document file's type, by its path's extension. */
export type DocumentFileExtension = "pdf" | "webp" | "jpg";

/**
 * Where a document's file goes: `<business>/<32 hex>.<pdf|webp|jpg>`, a path
 * that names neither the person nor the category. The database makes these
 * (public.reserve_document_upload, with a random key); this is its rule.
 */
export function documentFilePath(
  businessId: string,
  key: string,
  extension: DocumentFileExtension,
): string {
  return `${businessId}/${key}.${extension}`;
}

/** A document file's path, read: its business, key and type. */
export type DocumentFilePath = {
  businessId: string;
  key: string;
  extension: DocumentFileExtension;
};

/** The path's parts, or null for anything not in the database's shape. */
export function parseDocumentFilePath(path: string): DocumentFilePath | null {
  const match = PATH.exec(path);
  if (!match) return null;
  const [, businessId = "", key = "", extension] = match;
  if (extension !== "pdf" && extension !== "webp" && extension !== "jpg") {
    return null;
  }
  return { businessId, key, extension };
}

/**
 * The database's rule (`private.can_read_document`, and the paths
 * public.reserve_document_upload makes): `<business>/<32 hex>.<pdf|webp|jpg>`,
 * lower case, and, when `businessId` is given, in that business's folder.
 */
export function isDocumentFilePath(path: string, businessId?: string): boolean {
  const parts = parseDocumentFilePath(path);
  if (!parts) return false;
  return businessId === undefined || parts.businessId === businessId;
}

/** A stored document file's kind, by its extension: a photo of a page or a PDF. */
export function documentFileKindOf(
  extension: DocumentFileExtension,
): "image" | "pdf" {
  return extension === "pdf" ? "pdf" : "image";
}

/**
 * Where the app serves a document's file: its own route (C7's
 * /document-files), which opens it through public.open_document under the
 * reader's own session, so the database decides and logs the opening.
 */
export function documentFileSrc(
  path: string | null | undefined,
): string | null {
  return path && isDocumentFilePath(path) ? `/document-files/${path}` : null;
}

/** Whether `src` is one `documentFileSrc` made. */
export function isDocumentFileSrc(src: string): boolean {
  return (
    src.startsWith("/document-files/") &&
    isDocumentFilePath(src.slice("/document-files/".length))
  );
}

/** A document as its readers see it, from the database's row. */
export type DocumentRow = {
  id: string;
  direction: DocumentDirection;
  /** To the business: whose document it is (its sender). Null to people. */
  personId: string | null;
  /** Who sent it; null once their account is gone. */
  authorId: string | null;
  category: DocumentCategory;
  /** As its sender wrote it; a demo's is its category's words. */
  title: string;
  note: string | null;
  asksConfirmation: boolean;
  /** ISO instants. */
  sentAt: string;
  /** To the business: the office's first opening, and by whom. */
  openedAt: string | null;
  openedBy: string | null;
  removedAt: string | null;
  removedBy: string | null;
  removedReason: DocumentRemoveReason | null;
  /** Until when a removal can be undone; the file goes after it. */
  fileGoneAfter: string | null;
  /** Whether it has a file in Storage (a sample has none, nor one whose file went). */
  hasFile: boolean;
  /** A photo of a page or a PDF, while it has a file. */
  fileKind: "image" | "pdf" | null;
  /** A PDF's name as kept (`cleanFileName`), and the file's size in bytes. */
  fileName: string | null;
  fileSize: number | null;
  /** Where the app serves its file (`documentFileSrc`), while it has one. */
  fileSrc: string | null;
  sample: DocumentSample | null;
};

/** The reader's own mark on a document sent to them: when they opened and confirmed it. */
export type DocumentMark = {
  openedAt: string | null;
  confirmedAt: string | null;
};

/** Who is looking: the signed-in person, and whether they are in the office. */
export type DocumentReader = {
  id: string;
  /** Holds clock.payroll in the business (owners and accountants always). */
  office: boolean;
};

/**
 * Where a document stands for its reader, what its row on screen says:
 *
 * - `removed`: its file was removed (only the office and its sender still read it);
 * - `sent`: the reader sent it, and nothing came back yet: a document to the
 *   business nobody in the office opened, or, for its sender or the office,
 *   any document to people (each recipient's own mark is beside it);
 * - `received`: it reached whom it was for: a document to the business the
 *   office opened ("התקבל בעסק", with its date), or one to people its reader
 *   opened;
 * - `waiting`: it waits for its reader to open it: a document to the business
 *   nobody in the office opened yet, for the office ("עוד לא נפתח"), or one
 *   sent to the reader that they haven't opened;
 * - `toConfirm`: sent to the reader, asking for "קראתי", which they haven't
 *   given;
 * - `confirmed`: they did ("אישרת", with its date).
 *
 * `mark` is the reader's own (`document_recipients`), null when it wasn't
 * sent to them. A reader it was sent to sees their own task first, whoever
 * else they are.
 */
export type DocumentState =
  | "sent"
  | "received"
  | "waiting"
  | "toConfirm"
  | "confirmed"
  | "removed";

export function documentState(
  row: Pick<
    DocumentRow,
    "direction" | "personId" | "asksConfirmation" | "openedAt" | "removedAt"
  >,
  reader: DocumentReader,
  mark: DocumentMark | null = null,
): DocumentState {
  if (row.removedAt !== null) return "removed";
  if (row.direction === "from_person") {
    if (row.openedAt !== null) return "received";
    return row.personId === reader.id ? "sent" : "waiting";
  }
  if (mark) {
    if (row.asksConfirmation) {
      return mark.confirmedAt !== null ? "confirmed" : "toConfirm";
    }
    return mark.openedAt !== null ? "received" : "waiting";
  }
  return "sent";
}

const MINUTE = 60_000;

/**
 * The reasons the reader may remove a document's file with, now, as
 * public.remove_document allows them: its sender, within 10 minutes of
 * sending, takes it back ("taken_back"); the office chooses a reason from the
 * list, at any time. Empty for anyone else, and for one already removed. The
 * reader is the signed-in person, an active member of the business.
 */
export function canRemoveDocument(
  row: Pick<DocumentRow, "authorId" | "sentAt" | "removedAt">,
  reader: DocumentReader,
  now: Date,
): DocumentRemoveReason[] {
  if (row.removedAt !== null) return [];
  const reasons: DocumentRemoveReason[] = [];
  const sent = Date.parse(row.sentAt);
  if (
    row.authorId === reader.id &&
    Number.isFinite(sent) &&
    now.getTime() <= sent + DOCUMENT_TAKE_BACK_MINUTES * MINUTE
  ) {
    reasons.push("taken_back");
  }
  if (reader.office) reasons.push(...OFFICE_REMOVE_REASONS);
  return reasons;
}

/**
 * Whether the reader may put a removed document's file back now
 * (public.restore_document): whoever removed it, before its `file_gone_after`,
 * while the file (or its sample) is still there.
 */
export function canRestoreDocument(
  row: Pick<
    DocumentRow,
    "removedAt" | "removedBy" | "fileGoneAfter" | "hasFile" | "sample"
  >,
  reader: DocumentReader,
  now: Date,
): boolean {
  if (row.removedAt === null || row.removedBy !== reader.id) return false;
  const gone = row.fileGoneAfter ? Date.parse(row.fileGoneAfter) : Number.NaN;
  return (
    Number.isFinite(gone) &&
    now.getTime() < gone &&
    (row.hasFile || row.sample !== null)
  );
}

const ID = new RegExp(`^${UUID}$`, "i");
const id = z
  .string()
  .regex(ID)
  .transform((value) => value.toLowerCase());
const instant = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "not a time");

/**
 * A row of `public.documents` as the database gives it, read leniently into a
 * `DocumentRow`: a category, a sample or a reason it doesn't know never
 * becomes one of its own.
 */
export const documentRowSchema = z
  .object({
    id,
    direction: z.enum(DOCUMENT_DIRECTIONS),
    person_id: id.nullable(),
    author_id: id.nullable(),
    category: z.enum(DOCUMENT_CATEGORY_KEYS),
    title: z.string(),
    note: z.string().nullable(),
    asks_confirmation: z.boolean(),
    sent_at: instant,
    opened_at: instant.nullable(),
    opened_by: id.nullable(),
    removed_at: instant.nullable(),
    removed_by: id.nullable(),
    removed_reason: z.enum(DOCUMENT_REMOVE_REASONS).nullable().catch(null),
    file_gone_after: instant.nullable(),
    file_kind: z.enum(["image", "pdf"]).nullable().catch(null),
    file_path: z.string().nullable(),
    file_name: z.string().nullable(),
    file_size: z.number().int().nonnegative().nullable().catch(null),
    sample: z.enum(DOCUMENT_SAMPLES).nullable().catch(null),
  })
  .transform(
    (row): DocumentRow => ({
      id: row.id,
      direction: row.direction,
      personId: row.person_id,
      authorId: row.author_id,
      category: row.category,
      title: row.title,
      note: row.note,
      asksConfirmation: row.asks_confirmation,
      sentAt: row.sent_at,
      openedAt: row.opened_at,
      openedBy: row.opened_by,
      removedAt: row.removed_at,
      removedBy: row.removed_by,
      removedReason: row.removed_reason,
      fileGoneAfter: row.file_gone_after,
      hasFile: row.file_path !== null,
      fileKind: row.file_path !== null ? row.file_kind : null,
      fileName: row.file_name,
      fileSize: row.file_size,
      fileSrc: documentFileSrc(row.file_path),
      sample: row.sample,
    }),
  );

/** One recipient's marks, as the sender and the office see them. */
export const documentMarkSchema = z
  .object({
    document_id: id,
    person_id: id,
    opened_at: instant.nullable(),
    confirmed_at: instant.nullable(),
  })
  .transform((row) => ({
    documentId: row.document_id,
    personId: row.person_id,
    openedAt: row.opened_at,
    confirmedAt: row.confirmed_at,
  }));
export type DocumentRecipientMark = z.output<typeof documentMarkSchema>;

/** What public.open_document gives the route that serves a document. */
export const openedDocumentSchema = z.object({
  document: id,
  business: id,
  /** Null once its file is gone, or removed more than 10 minutes before. */
  path: z.string().nullable(),
  kind: z.enum(["image", "pdf"]).nullable(),
  name: z.string().nullable(),
  sample: z.enum(DOCUMENT_SAMPLES).nullable(),
});
export type OpenedDocument = z.infer<typeof openedDocumentSchema>;
