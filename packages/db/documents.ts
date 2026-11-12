import "server-only";
import { isUuid } from "@domain/activity";
import {
  CHAT_PDF_HEAD_BYTES,
  CHAT_PDF_TYPE,
  type ChatImageType,
  chatImageTypeOf,
  checkChatPdf,
  isPdf,
  isPlaceTombstone,
} from "@domain/chat-files";
import {
  documentSampleKind,
  documentSampleOf,
  documentSrc,
} from "@domain/document-files";
import {
  checkDocumentNote,
  checkDocumentPhoto,
  checkDocumentTitle,
  DOCUMENT_BUCKET,
  DOCUMENT_RECIPIENTS_MAX,
  type DocumentCategory,
  type DocumentDirection,
  type DocumentReader,
  type DocumentRecipientMark,
  type DocumentRemoveReason,
  type DocumentRow,
  type DocumentSample,
  documentFileKindOf,
  documentMarkSchema,
  documentRowSchema,
  isDocumentFilePath,
  isDocumentRemoveReason,
  isDocumentSample,
  type OpenedDocument,
  openedDocumentSchema,
  parseDocumentFilePath,
  takesCategory,
} from "@domain/documents";
import type { ListPhotoProblem } from "@domain/list-photos";
import { sniffPhotoType } from "@domain/profile-photos";
import { z } from "zod";
import { readAtLeast, withStart } from "./byte-stream";
import { isSignedUploadFor, occupyPlace, storedHead } from "./chat-files";
import { isMissingFunction } from "./missing";
import { isMissingTable } from "./notifications";
import { allPages } from "./pages";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

/*
 * Official documents (supabase/migrations/20261111000700_documents.sql, chat
 * C6): the database side of what C7's screens, their server actions
 * (app/(app)/chat/documents/actions.ts) and the /document-files routes call.
 *
 * Reads run under RLS as the signed-in person (`public.documents` and
 * `public.document_recipients` are readable by `authenticated` alone; the
 * secret key reads neither, so no console page or script can): a document to
 * the business is read by its person and the office (owners and
 * clock.payroll holders), one to people by its recipients, its sender and the
 * office; a removed one by the office and its sender only; a view session
 * reads none. Someone who left still reads their own and those sent to them.
 *
 * Writes run with the secret key for `actorId`: callers make sure that is the
 * signed-in person, not someone viewing as them, in the business the screen
 * was drawn for, and call `pushSoon()` after a sending. The database checks
 * who may do what. Nothing here logs a document's category, title, note or
 * file's name: a failure is logged by its code alone (a sick note is health
 * data). Everything tolerates a project the migration hasn't reached yet
 * ("notYet").
 *
 * C7 builds on these: the photo of a page goes through the server
 * (`sendDocumentPhoto`: `checkDocumentPhoto`, `reserveDocumentUpload` with
 * kind "image", an upload to the `documents` bucket with the secret key, then
 * `sendDocument` with the place), and a PDF through a signed upload for its
 * one reserved path, as chat's PDFs do (`startDocumentPdf`: the place and
 * Storage's signed upload; `finishDocumentPdf`: `documentUploadPlace`, an
 * `isPdf` read of its first KB, then `sendDocument`); on any refusal its file
 * is let go as @db/chat-files does. A demo business sends its samples
 * (`sendDocumentSample`). The /document-files routes read first and open
 * last: `documentToServe` (the row, under the reader's own session, never a
 * removed one), then `documentFileBytes` under that session (or the sample),
 * and only with a file to give `openDocument` (which logs the office's
 * opening and marks a recipient's).
 */

/** Why a document's write was refused, for the screens' words. */
export type DocumentFailure =
  /** Not theirs to do (42501), or nothing of theirs (P0002). */
  | "noAccess"
  /** A shape the database won't keep: a category, people, a title (22023). */
  | "invalid"
  /** Documents are off, it was removed, too late to undo (55000). */
  | "closed"
  /** A demo business that takes no uploaded file (55000). */
  | "demo"
  /** Too many in a minute, or in a demo's hour (54000). */
  | "tooFast"
  /** The business's documents fill its `documentSpaceMb` (54000, 'space'). */
  | "full"
  /** The project's Storage is past 980 MB (54000, 'storage'). */
  | "noRoom"
  /** Ten PDFs unsent from the last day (54000, 'pdfs'). */
  | "tooMany"
  /** The migration isn't on this project yet. */
  | "notYet"
  | "failed";

export type DocumentWrite<T> =
  | { ok: true; value: T }
  | { ok: false; failure: DocumentFailure };

const refused = (failure: DocumentFailure) => ({ ok: false, failure }) as const;
const done = <T>(value: T) => ({ ok: true, value }) as const;

/** `at_time` for a write, when the caller says when it happened. */
const atTime = (at?: Date) => (at ? { at_time: at.toISOString() } : {});

/** A document write's refusal, by its code and hint, never its words. */
export function documentFailureOf(error: {
  code?: string;
  hint?: string | null;
}): DocumentFailure {
  if (isMissingFunction(error)) return "notYet";
  switch (error.code) {
    case "42501":
    case "P0002":
      return "noAccess";
    case "22023":
      return "invalid";
    case "55000":
      return "closed";
    case "54000":
      if (error.hint === "space") return "full";
      if (error.hint === "storage") return "noRoom";
      if (error.hint === "pdfs") return "tooMany";
      return "tooFast";
    default:
      // The code alone: a document's title or file name never reaches a log.
      console.error("a document write failed", error.code ?? "without a code");
      return "failed";
  }
}

/**
 * Whether the business takes uploaded documents (C7, before an upload): not
 * a demo business whose definition doesn't open it ("chatFiles": true, the
 * local seed's restaurant only), where documents are samples
 * (`public.documents_closed`). "notYet" before the migration reaches the
 * project, when nothing would take one.
 */
export async function documentsAllowed(
  businessId: string,
): Promise<"yes" | "demo" | "notYet"> {
  const { data, error } = await createAdminClient().rpc("documents_closed", {
    business: businessId,
  });
  if (error) {
    if (isMissingFunction(error)) return "notYet";
    throw error;
  }
  return data ? "demo" : "yes";
}

/** A document with the marks its reader may see. */
export type DocumentView = DocumentRow & {
  /**
   * Its recipients' marks, each when they opened and confirmed it: every one
   * for its sender and the office, only their own for a recipient, none for a
   * document to the business.
   */
  recipients: DocumentRecipientMark[];
  /**
   * Where the app opens its file or its sample (`documentSrc`: /document-files
   * by the document's id, which opens it through public.open_document first),
   * while there is one: null once its file is gone, and once it is removed,
   * even within its 10 minutes of undo (putting it back needs no look at it,
   * and a sick note its sender took back is seen by nobody). A plain
   * `<a download>` for a PDF and an `<img>` for a photo; never a `<Link>`,
   * which could prefetch an opening.
   */
  src: string | null;
  /** What `src` serves: a photo of a page shown inline, or a PDF to download. */
  shownKind: "image" | "pdf" | null;
};

/** Whether a document has a file or a sample to open: never a removed one. */
function opens(document: DocumentRow): boolean {
  return (
    document.removedAt === null &&
    (document.hasFile || document.sample !== null)
  );
}

const COLUMNS =
  "id, business_id, direction, person_id, author_id, category, title, note, file_kind, file_path, file_name, file_size, sample, asks_confirmation, sent_at, opened_at, opened_by, removed_at, removed_by, removed_reason, file_gone_after";

/** Documents one read gives at most. */
export const DOCUMENTS_READ_MAX = 200;

/** Ids one `in` filter takes, so a read's address stays short (about 3.7 KB). */
const IDS_PER_READ = 100;

/** `list` in parts of at most `size`. */
function inParts<T>(list: readonly T[], size = IDS_PER_READ): T[][] {
  const parts: T[][] = [];
  for (let at = 0; at < list.length; at += size) {
    parts.push(list.slice(at, at + size));
  }
  return parts;
}

/** Newest first, `id` breaking ties: the order every list of documents is in. */
function newestFirst(
  a: Pick<DocumentRow, "sentAt" | "id">,
  b: Pick<DocumentRow, "sentAt" | "id">,
): number {
  return (
    Date.parse(b.sentAt) - Date.parse(a.sentAt) ||
    (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
  );
}

/**
 * Rows of documents as read, each once (two reads, or a page read again,
 * may repeat one), newest first, with what orders them; rows in no
 * document's shape are left out, as `withMarks` would.
 */
function inOrder(
  rows: readonly unknown[],
): { id: string; sentAt: string; row: unknown }[] {
  const byId = new Map<string, { id: string; sentAt: string; row: unknown }>();
  for (const row of rows) {
    const parsed = documentRowSchema.safeParse(row);
    if (!parsed.success) continue;
    byId.set(parsed.data.id, {
      id: parsed.data.id,
      sentAt: parsed.data.sentAt,
      row,
    });
  }
  return [...byId.values()].sort(newestFirst);
}

type Session = Awaited<ReturnType<typeof createClient>>;

/** The signed-in person's own Supabase session, as `documentFileBytes` takes it. */
export type DocumentSession = Session;

/**
 * The reader's own session, made now, while the request is being answered:
 * for a download whose files are read after its answer began (the
 * documents' download streams), when the request's cookies can't be asked
 * for any more.
 */
export function documentSession(): Promise<DocumentSession> {
  return createClient();
}

/**
 * The rows read back as documents, each with the marks RLS gives the reader:
 * a hundred documents to a read, and their marks page by page (a document to
 * the whole team has one for each of them, past PostgREST's 1000 rows soon).
 */
async function withMarks(
  supabase: Session,
  businessId: string,
  rows: readonly unknown[],
): Promise<DocumentView[]> {
  const documents = rows.flatMap((row) => {
    const parsed = documentRowSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
  if (documents.length === 0) return [];
  const toPeople = documents
    .filter((document) => document.direction === "to_people")
    .map((document) => document.id);
  const byDocument = new Map<string, DocumentRecipientMark[]>();
  for (const part of inParts(toPeople)) {
    const marks = await allPages((first, last) =>
      supabase
        .from("document_recipients")
        .select("document_id, person_id, opened_at, confirmed_at")
        .eq("business_id", businessId)
        .in("document_id", part)
        .order("document_id")
        .order("person_id")
        .range(first, last),
    );
    for (const row of marks) {
      const mark = documentMarkSchema.safeParse(row);
      if (!mark.success) continue;
      const list = byDocument.get(mark.data.documentId) ?? [];
      list.push(mark.data);
      byDocument.set(mark.data.documentId, list);
    }
  }
  return documents.map((document) => ({
    ...document,
    recipients: (byDocument.get(document.id) ?? []).sort((a, b) =>
      a.personId < b.personId ? -1 : a.personId > b.personId ? 1 : 0,
    ),
    src: opens(document) ? documentSrc(businessId, document.id) : null,
    shownKind:
      document.fileKind ??
      (document.sample !== null ? documentSampleKind(document.sample) : null),
  }));
}

/** Which documents a read gives, on top of what RLS lets the reader see. */
export type DocumentsQuery = {
  /**
   * Only this person's: theirs to the business and those sent to them (a
   * person's own list, and the office's view of one person).
   */
  person?: string;
  /** Only those this person sent (the sender's "שלחת", with `direction`). */
  sentBy?: string;
  /** Only one way. */
  direction?: DocumentDirection;
  /** Only those sent from this instant on, and before that one (a month's). */
  sentFrom?: Date;
  sentBefore?: Date;
  /** At most this many: 100 unless asked, never over 200. */
  limit?: number;
};

/**
 * The documents the signed-in person reads in the business, newest first,
 * under their own session (C7's /chat/documents): for someone on the staff
 * their own both ways, for the office every one, for a sender those they
 * sent too. With `person`, only that person's: theirs to the business and
 * those sent to them (the office's view of one person). With `sentBy`, only
 * those that person sent; with `direction`, one way; with `sentFrom` and
 * `sentBefore`, a stretch of time (a month's download). At most `limit`
 * (100 unless asked, never over 200). "notYet" before the migration.
 */
export async function getDocuments(
  businessId: string,
  options: DocumentsQuery = {},
): Promise<DocumentView[] | "notYet"> {
  if (!isUuid(businessId)) return [];
  if (options.sentBy !== undefined && !isUuid(options.sentBy)) return [];
  if (options.person !== undefined && !isUuid(options.person)) return [];
  const supabase = await createClient();
  const limit = Math.min(Math.max(options.limit ?? 100, 1), DOCUMENTS_READ_MAX);
  try {
    if (options.person === undefined) {
      const { data, error } = await documentsWhere(
        supabase,
        businessId,
        options,
      )
        .order("sent_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return await withMarks(supabase, businessId, data ?? []);
    }
    // Theirs to the business, and those sent to them, each read newest first
    // as far as `limit`: the newest `limit` of both together.
    const person = options.person.toLowerCase();
    const [own, sentTo] = await Promise.all([
      documentsWhere(supabase, businessId, options)
        .eq("person_id", person)
        .order("sent_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit),
      documentsSentTo(supabase, businessId, person),
    ]);
    if (own.error) throw own.error;
    const theirs = await Promise.all(
      inParts(sentTo).map(async (part) => {
        const { data, error } = await documentsWhere(
          supabase,
          businessId,
          options,
        )
          .in("id", part)
          .order("sent_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(limit);
        if (error) throw error;
        return data ?? [];
      }),
    );
    // The newest `limit` of both, each once, and only those get their marks.
    const kept = inOrder([...(own.data ?? []), ...theirs.flat()]).slice(
      0,
      limit,
    );
    return await withMarks(
      supabase,
      businessId,
      kept.map((document) => document.row),
    );
  } catch (error) {
    if (isMissingTable(error as { code?: string })) return "notYet";
    throw error;
  }
}

/** The business's documents the reader reads, narrowed as `options` asks (not by person). */
function documentsWhere(
  supabase: Session,
  businessId: string,
  options: Omit<DocumentsQuery, "person" | "limit">,
) {
  let query = supabase
    .from("documents")
    .select(COLUMNS)
    .eq("business_id", businessId);
  if (options.sentBy !== undefined) {
    query = query.eq("author_id", options.sentBy.toLowerCase());
  }
  if (options.direction !== undefined) {
    query = query.eq("direction", options.direction);
  }
  if (options.sentFrom !== undefined) {
    query = query.gte("sent_at", options.sentFrom.toISOString());
  }
  if (options.sentBefore !== undefined) {
    query = query.lt("sent_at", options.sentBefore.toISOString());
  }
  return query;
}

/**
 * The ids of every document sent to `person`, as far as the reader sees
 * their marks, page by page (marks are only ever added: a page read again
 * repeats one, never skips one).
 */
async function documentsSentTo(
  supabase: Session,
  businessId: string,
  person: string,
): Promise<string[]> {
  const rows = await allPages((first, last) =>
    supabase
      .from("document_recipients")
      .select("document_id")
      .eq("business_id", businessId)
      .eq("person_id", person)
      .order("document_id")
      .range(first, last),
  );
  return [
    ...new Set(
      rows
        .map((row) => row.document_id.toLowerCase())
        .filter((id) => isUuid(id)),
    ),
  ];
}

/** Every document of the business the office reads, in brief (C7). */
export type DocumentsIndex = {
  /** Oldest first. */
  documents: {
    id: string;
    direction: DocumentDirection;
    personId: string | null;
    sentAt: string;
  }[];
  /** Each document to people's recipients, as far as the reader sees them. */
  recipients: { documentId: string; personId: string }[];
};

const indexDocumentSchema = z
  .object({
    id: z.string().refine(isUuid),
    direction: z.enum(["from_person", "to_people"]),
    person_id: z.string().refine(isUuid).nullable(),
    sent_at: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
  })
  .transform((row) => ({
    id: row.id.toLowerCase(),
    direction: row.direction,
    personId: row.person_id?.toLowerCase() ?? null,
    sentAt: row.sent_at,
  }));

/**
 * Every document of the business the signed-in person reads, in brief, under
 * their own session (C7, the office's /chat/documents): when each was sent,
 * which way, and whom it is about, page by page, never only the newest 200.
 * The months a download is offered for and the people the office's list
 * names come from it, so a person whose documents are all old is still
 * there. Documents are kept forever and never deleted, so a page read again
 * repeats a row, never skips one. "notYet" before the migration.
 */
export async function getDocumentsIndex(
  businessId: string,
): Promise<DocumentsIndex | "notYet"> {
  if (!isUuid(businessId)) return { documents: [], recipients: [] };
  const supabase = await createClient();
  try {
    const [documents, recipients] = await Promise.all([
      allPages((first, last) =>
        supabase
          .from("documents")
          .select("id, direction, person_id, sent_at")
          .eq("business_id", businessId)
          .order("sent_at")
          .order("id")
          .range(first, last),
      ),
      allPages((first, last) =>
        supabase
          .from("document_recipients")
          .select("document_id, person_id")
          .eq("business_id", businessId)
          .order("document_id")
          .order("person_id")
          .range(first, last),
      ),
    ]);
    const marks = new Map<string, { documentId: string; personId: string }>();
    for (const row of recipients) {
      if (!isUuid(row.document_id) || !isUuid(row.person_id)) continue;
      const documentId = row.document_id.toLowerCase();
      const personId = row.person_id.toLowerCase();
      marks.set(`${documentId}:${personId}`, { documentId, personId });
    }
    return {
      documents: [
        ...new Map(
          documents.flatMap((row) => {
            const parsed = indexDocumentSchema.safeParse(row);
            return parsed.success ? [[parsed.data.id, parsed.data]] : [];
          }),
        ).values(),
      ],
      recipients: [...marks.values()],
    };
  } catch (error) {
    if (isMissingTable(error as { code?: string })) return "notYet";
    throw error;
  }
}

/** What one download keeps (`getDocumentsToKeep`): a person's documents, or a month's. */
export type DocumentsToKeep =
  | { person: string }
  | { sentFrom: Date; sentBefore: Date };

/**
 * Every document of a download (C7's "הורדת כל המסמכים"), oldest first, as
 * the signed-in person reads them (RLS), with their marks: a person's (theirs
 * to the business and every one sent to them) or those sent in a stretch of
 * time (a month's), page by page, never only the newest 200. At most `most`;
 * `more` says there were others past it. "notYet" before the migration.
 */
export async function getDocumentsToKeep(
  businessId: string,
  of: DocumentsToKeep,
  most: number,
): Promise<{ documents: DocumentView[]; more: boolean } | "notYet"> {
  if (!isUuid(businessId)) return { documents: [], more: false };
  if ("person" in of && !isUuid(of.person)) {
    return { documents: [], more: false };
  }
  const supabase = await createClient();
  try {
    let rows: unknown[];
    if ("person" in of) {
      const person = of.person.toLowerCase();
      const [own, sentTo] = await Promise.all([
        allPages((first, last) =>
          documentsWhere(supabase, businessId, {})
            .eq("person_id", person)
            .order("sent_at")
            .order("id")
            .range(first, last),
        ),
        documentsSentTo(supabase, businessId, person),
      ]);
      const theirs: unknown[] = [];
      for (const part of inParts(sentTo)) {
        const { data, error } = await documentsWhere(supabase, businessId, {})
          .in("id", part)
          .order("sent_at")
          .order("id");
        if (error) throw error;
        theirs.push(...(data ?? []));
      }
      rows = [...own, ...theirs];
    } else {
      rows = await allPages((first, last) =>
        documentsWhere(supabase, businessId, {
          sentFrom: of.sentFrom,
          sentBefore: of.sentBefore,
        })
          .order("sent_at")
          .order("id")
          .range(first, last),
      );
    }
    // Oldest first, each once (a page read again may repeat one).
    const documents = inOrder(rows).reverse();
    const kept = documents.slice(0, Math.max(0, most));
    const views: DocumentView[] = [];
    for (const part of inParts(kept)) {
      views.push(
        ...(await withMarks(
          supabase,
          businessId,
          part.map((document) => document.row),
        )),
      );
    }
    return { documents: views, more: documents.length > kept.length };
  } catch (error) {
    if (isMissingTable(error as { code?: string })) return "notYet";
    throw error;
  }
}

/**
 * One document the signed-in person reads, with the marks they may see
 * (C7's /chat/documents/[id]), under their own session: null for one they
 * don't read, the same as for none, so ids can't be probed. Reading it marks
 * nothing; opening its file does (`openDocument`).
 */
export async function getDocument(
  businessId: string,
  documentId: string,
): Promise<DocumentView | null | "notYet"> {
  if (!isUuid(businessId) || !isUuid(documentId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select(COLUMNS)
    .eq("business_id", businessId)
    .eq("id", documentId.toLowerCase())
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return "notYet";
    throw error;
  }
  if (!data) return null;
  const [document] = await withMarks(supabase, businessId, [data]);
  return document ?? null;
}

/** What waits for the reader on Today (C7). */
export type DocumentsToday = {
  /** Sent to them asking for "קראתי", which they haven't given, newest first. */
  toConfirm: DocumentView[];
  /** How many of those there are, beyond `limit` too. */
  toConfirmCount: number;
  /**
   * For the office only: documents to the business nobody in the office has
   * opened yet (their own aside), newest first. Empty for anyone else.
   */
  waiting: DocumentView[];
  /** How many of those there are, beyond `limit` too. */
  waitingCount: number;
};

/**
 * Today's part of documents (C7), under the signed-in person's own session:
 * what they are asked to confirm, and for the office what came that nobody
 * there opened. At most `limit` of each (5 unless asked, never over 200), and
 * how many there are in all. Each is one read of the documents themselves:
 * those asking for "קראתי" joined to the reader's own mark without one (a
 * removed document is hidden from a plain recipient, its mark with it), never
 * a list of every mark they have. "notYet" before the migration.
 */
export async function getDocumentsForToday(
  businessId: string,
  reader: DocumentReader,
  limit = 5,
): Promise<DocumentsToday | "notYet"> {
  if (!isUuid(businessId) || !isUuid(reader.id)) {
    return { toConfirm: [], toConfirmCount: 0, waiting: [], waitingCount: 0 };
  }
  const supabase = await createClient();
  const most = Math.min(Math.max(limit, 1), DOCUMENTS_READ_MAX);
  const me = reader.id.toLowerCase();
  const [toConfirm, waiting] = await Promise.all([
    supabase
      .from("documents")
      .select(`${COLUMNS}, document_recipients!inner(person_id)`, {
        count: "exact",
      })
      .eq("business_id", businessId)
      .eq("document_recipients.person_id", me)
      .is("document_recipients.confirmed_at", null)
      .eq("asks_confirmation", true)
      .is("removed_at", null)
      .order("sent_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(most),
    reader.office
      ? supabase
          .from("documents")
          .select(COLUMNS, { count: "exact" })
          .eq("business_id", businessId)
          .eq("direction", "from_person")
          .is("opened_at", null)
          .is("removed_at", null)
          .neq("person_id", me)
          .order("sent_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(most)
      : null,
  ]);
  for (const read of [toConfirm, waiting]) {
    if (!read?.error) continue;
    if (isMissingTable(read.error)) return "notYet";
    throw read.error;
  }
  const [confirmViews, waitingViews] = await Promise.all([
    withMarks(supabase, businessId, toConfirm.data ?? []),
    withMarks(supabase, businessId, waiting?.data ?? []),
  ]);
  return {
    toConfirm: confirmViews,
    toConfirmCount: Math.max(toConfirm.count ?? 0, confirmViews.length),
    waiting: waitingViews,
    waitingCount: Math.max(waiting?.count ?? 0, waitingViews.length),
  };
}

/** What the /document-files routes serve for a document (`documentToServe`). */
export type DocumentToServe = {
  id: string;
  /** Its stored file, in its business's folder; null for a demo's sample. */
  path: string | null;
  /** Its demo sample, when it has no stored file. */
  sample: DocumentSample | null;
  /** Its title, a sample's name as a download. */
  title: string;
};

/**
 * A document the signed-in person reads, as the /document-files routes serve
 * it (C7), read under their own session (RLS) before anything opens it: its
 * stored file's path or its demo sample, and its title. Null for one they
 * don't read, one removed (even within its 10 minutes of undo: nobody needs
 * to see a removed file to put it back), and one with nothing left to serve,
 * the same as for none. `session` is the reader's own made while the request
 * was being answered (`documentSession`), for a download that reads after its
 * answer began; one is made here otherwise.
 */
export async function documentToServe(
  businessId: string,
  documentId: string,
  session?: DocumentSession,
): Promise<DocumentToServe | null> {
  if (!isUuid(businessId) || !isUuid(documentId)) return null;
  const business = businessId.toLowerCase();
  const supabase = session ?? (await createClient());
  const { data, error } = await supabase
    .from("documents")
    .select("id, file_path, sample, removed_at, title")
    .eq("business_id", business)
    .eq("id", documentId.toLowerCase())
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  if (!data || data.removed_at !== null || !isUuid(data.id)) return null;
  const path = data.file_path;
  if (path !== null && !isDocumentFilePath(path, business)) return null;
  const sample = isDocumentSample(data.sample) ? data.sample : null;
  if (path === null && sample === null) return null;
  return {
    id: data.id.toLowerCase(),
    path,
    sample: path === null ? sample : null,
    title: data.title,
  };
}

/**
 * The document a stored file is of, as the signed-in person reads it (RLS),
 * for the /document-files route's address by file: its id, or null for a
 * file of no document they read, the same as for none.
 */
export async function documentIdForFile(path: string): Promise<string | null> {
  const parts = parseDocumentFilePath(path);
  if (!parts) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select("id, file_path")
    .eq("business_id", parts.businessId)
    .eq("file_path", path)
    .maybeSingle();
  if (error || !data || data.file_path !== path || !isUuid(data.id)) {
    return null;
  }
  return data.id.toLowerCase();
}

/**
 * Whether the signed-in person read the office's notice that the business
 * keeps its own copy of its documents (C7, `public.document_notices`, their
 * own row under RLS): the office's screen says it until they have. False
 * before the migration reaches the project, so the notice is never skipped.
 */
export async function documentsNoticeSeen(
  businessId: string,
): Promise<boolean> {
  if (!isUuid(businessId)) return false;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("document_notices")
    .select("seen_at")
    .eq("business_id", businessId)
    .limit(1);
  if (error) {
    if (isMissingTable(error)) return false;
    throw error;
  }
  return (data ?? []).length > 0;
}

/**
 * Someone in the office read that notice ("הבנתי", or the download beside
 * it): kept once (`public.see_documents_notice`). "noAccess" for anyone not in
 * the office, "closed" while documents are off, "notYet" before the migration.
 */
export async function seeDocumentsNotice(
  actorId: string,
  businessId: string,
): Promise<DocumentWrite<null>> {
  const { error } = await createAdminClient().rpc("see_documents_notice", {
    actor: actorId,
    business: businessId,
  });
  return error ? refused(documentFailureOf(error)) : done(null);
}

const placeSchema = z.object({
  upload: z.string().refine(isUuid),
  path: z.string(),
});

/**
 * Reserves a document file's place (C7, before its upload;
 * `public.reserve_document_upload`): a photo of a page (`kind` "image", a
 * JPEG or WebP of at most 700 KB, which the server then uploads itself) or a
 * PDF (at most 10 MiB, given its `name`, through a signed upload), sent to
 * the business (`from_person`, anyone on the staff) or to people
 * (`to_people`, who sends documents). Refused as `DocumentFailure` says,
 * past the business's `documentSpaceMb` ("full") and the project's 980 MB
 * ("noRoom") included. Returns the place and its path, in the business's
 * folder under a key that names nobody.
 */
export async function reserveDocumentUpload(
  actorId: string,
  businessId: string,
  input: {
    direction: DocumentDirection;
    kind: "image" | "pdf";
    type: "image/jpeg" | "image/webp" | "application/pdf";
    size: number;
    name?: string;
  },
  at?: Date,
): Promise<DocumentWrite<{ upload: string; path: string }>> {
  if (!Number.isSafeInteger(input.size) || input.size < 1) {
    return refused("invalid");
  }
  const { data, error } = await createAdminClient().rpc(
    "reserve_document_upload",
    {
      actor: actorId,
      business: businessId,
      upload_direction: input.direction,
      upload_kind: input.kind,
      upload_type: input.type,
      upload_size: input.size,
      ...(input.name !== undefined ? { upload_name: input.name } : {}),
      ...atTime(at),
    },
  );
  if (error) return refused(documentFailureOf(error));
  const place = placeSchema.safeParse(data);
  if (!place.success) return refused("failed");
  const parts = parseDocumentFilePath(place.data.path);
  if (
    !parts ||
    !isDocumentFilePath(place.data.path, businessId) ||
    documentFileKindOf(parts.extension) !== input.kind
  ) {
    return refused("failed");
  }
  return done({
    upload: place.data.upload.toLowerCase(),
    path: place.data.path,
  });
}

const uploadPlaceSchema = z.object({
  upload: z.string().refine(isUuid),
  path: z.string(),
  kind: z.enum(["image", "pdf"]),
  size: z.number().int().positive(),
  name: z.string().nullable(),
  used: z.boolean(),
  document: z.string().refine(isUuid).nullable(),
  fresh: z.boolean(),
});

/** The signed-in person's own document place, as the database has it. */
export type DocumentUploadPlace = z.infer<typeof uploadPlaceSchema>;

/**
 * The signed-in person's own document place in the business (C7, finishing
 * a PDF; `public.document_upload_place`): its path by the database's word,
 * never one the browser names, its kind, size and name as reserved, whether
 * it was sent and to which document (a retry whose answer was lost), and
 * whether its 2 hours are still on. Null for anyone else's place, another
 * business's, a chat file's, or none.
 */
export async function documentUploadPlace(
  actorId: string,
  businessId: string,
  upload: string,
  at?: Date,
): Promise<DocumentUploadPlace | null | { failure: DocumentFailure }> {
  if (!isUuid(upload)) return null;
  const { data, error } = await createAdminClient().rpc(
    "document_upload_place",
    {
      actor: actorId,
      business: businessId,
      upload: upload.toLowerCase(),
      ...atTime(at),
    },
  );
  if (error) return { failure: documentFailureOf(error) };
  if (data === null) return null;
  const place = uploadPlaceSchema.safeParse(data);
  if (!place.success || !isDocumentFilePath(place.data.path, businessId)) {
    return { failure: "failed" };
  }
  return place.data;
}

/** A document's own fields, without its file: what the send screen fills in. */
export type DocumentFields = {
  direction: DocumentDirection;
  category: DocumentCategory;
  /** In a demo business the database writes the category's words instead. */
  title: string;
  note?: string | null;
  /** To people: whom (the screen resolves a department or everyone), 1 to 200. */
  to?: readonly string[];
  /** To people: ask each for "קראתי". */
  asks?: boolean;
};

/** A document's fields as public.send_document takes them, or null for a shape it refuses. */
function checkedFields(input: DocumentFields): {
  title: string;
  note: string | null;
  to: string[];
} | null {
  if (!takesCategory(input.direction, input.category)) return null;
  const title = checkDocumentTitle(input.title);
  const note = checkDocumentNote(input.note);
  if (!title.ok || !note.ok) return null;
  const to = [...new Set((input.to ?? []).map((id) => id.toLowerCase()))];
  if (input.direction === "to_people") {
    if (
      to.length === 0 ||
      to.length > DOCUMENT_RECIPIENTS_MAX ||
      !to.every((id) => isUuid(id))
    ) {
      return null;
    }
  } else if (to.length > 0 || input.asks === true) {
    return null;
  }
  return { title: title.title, note: note.note, to };
}

/** What a document is sent with: a reserved file's place, or a demo's sample. */
export type DocumentSending = DocumentFields &
  (
    | {
        /** The place `reserveDocumentUpload` gave, its file put there. */
        upload: string;
      }
    | {
        /** A demo business's sample, of its own category; no note there. */
        sample: DocumentSample;
      }
  );

/**
 * Sends a document (`public.send_document`), checked first as the database
 * checks it: the category its way takes, a title of 1 to 80 characters on
 * one line, a note of at most 300, and to people 1 to 200 others on the
 * staff (to the business, nobody: it goes to the office). Its file is a
 * reserved place whose file is in Storage (C7), or in a demo business a
 * sample. The office is told (documents.received), or each recipient
 * (documents.sent, or documents.to_confirm when it asks), and the office's
 * log gets document.send with codes only; the caller runs `pushSoon()` after.
 * Returns the document's id.
 */
export async function sendDocument(
  actorId: string,
  businessId: string,
  input: DocumentSending,
  at?: Date,
): Promise<DocumentWrite<{ document: string }>> {
  const fields = checkedFields(input);
  if (!fields) return refused("invalid");
  const { title, note, to } = fields;
  const file =
    "upload" in input
      ? isUuid(input.upload)
        ? { upload: input.upload.toLowerCase() }
        : null
      : isDocumentSample(input.sample)
        ? { send_sample: input.sample }
        : null;
  if (!file) return refused("invalid");

  const { data, error } = await createAdminClient().rpc("send_document", {
    actor: actorId,
    business: businessId,
    send_direction: input.direction,
    send_category: input.category,
    send_title: title,
    ...(note !== null ? { send_note: note } : {}),
    ...(input.direction === "to_people"
      ? { send_to: to, asks: input.asks === true }
      : {}),
    ...file,
    ...atTime(at),
  });
  if (error) {
    const failure = documentFailureOf(error);
    return refused(
      failure === "closed" &&
        "upload" in input &&
        (await documentsAllowed(businessId)) === "demo"
        ? "demo"
        : failure,
    );
  }
  return typeof data === "string" && isUuid(data)
    ? done({ document: data.toLowerCase() })
    : refused("failed");
}

/**
 * A demo business's document (C7, plan §13): its category's sample, with no
 * file, no note, and the category's words for its title (the database writes
 * them). Only the categories that have a sample go (`DEMO_DOCUMENT_CATEGORIES`
 * in @domain/document-files): "invalid" for any other, "closed" outside a demo
 * business.
 */
export function sendDocumentSample(
  actorId: string,
  businessId: string,
  input: Omit<DocumentFields, "title" | "note">,
  at?: Date,
): Promise<DocumentWrite<{ document: string }>> {
  const sample = documentSampleOf(input.category);
  if (!sample) return Promise.resolve(refused("invalid"));
  return sendDocument(
    actorId,
    businessId,
    // Any title will do: in a demo business the database writes the
    // category's own words instead.
    { ...input, title: input.category, note: null, sample },
    at,
  );
}

/**
 * Why a document with a file of its own was refused (C7): a write's reasons
 * (`DocumentFailure`), what the server found in a photo (`ListPhotoProblem`:
 * empty, tooBig, type, metadata, pixels: the app's own re-encoding didn't make
 * it), and a PDF's own.
 */
export type DocumentFileFailure =
  | DocumentFailure
  | ListPhotoProblem
  /** Its name isn't a `.pdf`, or its bytes aren't a PDF's (`isPdf`). */
  | "notPdf"
  /** Storage holds nothing at its place: the browser's PUT didn't arrive. */
  | "notUploaded"
  /** Its place's 2 hours are over, or it was let go: start again. */
  | "expired";

export type DocumentFileWrite<T> =
  | { ok: true; value: T }
  | { ok: false; failure: DocumentFileFailure };

const refusedFile = (failure: DocumentFileFailure) =>
  ({ ok: false, failure }) as const;

/**
 * After a refused sending: when the place was sent after all (another try of
 * the same sending a moment ahead, or this one's answer lost on its way back),
 * its document; else null, and its file is let go: a photo removed (no signed
 * upload can write its path), a PDF's place given the server's tombstone so
 * its signed upload can't write there again. When that can't be told, the
 * file stays for the chat job's clean-up a day on (an unused place).
 */
async function sentOrLetGo(
  actorId: string,
  businessId: string,
  upload: string,
): Promise<string | null> {
  const place = await documentUploadPlace(actorId, businessId, upload);
  if (place === null || "failure" in place) return null;
  if (place.used) return place.document;
  if (place.kind === "pdf") {
    await occupyPlace(place.path, DOCUMENT_BUCKET);
  } else {
    const gone = await createAdminClient()
      .storage.from(DOCUMENT_BUCKET)
      .remove([place.path]);
    if (gone.error) console.error("a document's photo stayed", gone.error.name);
  }
  return null;
}

/**
 * Sends a document with a photo of its page (C7), as the screen re-encoded
 * it (`encodeDocumentPhoto`: a JPEG or WebP, at most 1600 px on its long side
 * and 700 KB, nothing from the camera inside), through the server: its
 * fields checked as public.send_document will, the photo checked again
 * (`checkDocumentPhoto`), its place reserved with the sending's own checks,
 * uploaded with the secret key (`upsert` off) and sent. On any refusal the
 * photo goes at once, unless the document was written after all, which is
 * then the answer. Refused as `DocumentFileFailure` says: "demo" in a demo
 * business that takes no files (its samples are `sendDocumentSample`'s).
 */
export async function sendDocumentPhoto(
  actorId: string,
  businessId: string,
  input: DocumentFields & { file: Blob },
  at?: Date,
): Promise<DocumentFileWrite<{ document: string }>> {
  const { file, ...fields } = input;
  if (!checkedFields(fields)) return refusedFile("invalid");
  const allowed = await documentsAllowed(businessId);
  if (allowed !== "yes") return refusedFile(allowed);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const photo = checkDocumentPhoto({ type: file.type, size: file.size, bytes });
  if (!photo.ok) return refusedFile(photo.problem);

  const place = await reserveDocumentUpload(
    actorId,
    businessId,
    {
      direction: fields.direction,
      kind: "image",
      type: photo.type,
      size: bytes.length,
    },
    at,
  );
  if (!place.ok) return place;
  const { upload, path } = place.value;
  if (parseDocumentFilePath(path)?.extension !== photo.extension) {
    await sentOrLetGo(actorId, businessId, upload);
    return refusedFile("failed");
  }

  const uploaded = await createAdminClient()
    .storage.from(DOCUMENT_BUCKET)
    .upload(path, bytes, { contentType: photo.type, upsert: false });
  if (uploaded.error) {
    console.error("a document's photo was not uploaded", uploaded.error.name);
    await sentOrLetGo(actorId, businessId, upload);
    return refusedFile("failed");
  }

  const sent = await sendDocument(
    actorId,
    businessId,
    { ...fields, upload },
    at,
  );
  if (sent.ok) return sent;
  const written = await sentOrLetGo(actorId, businessId, upload);
  return written ? done({ document: written }) : refusedFile(sent.failure);
}

/** What `startDocumentPdf` gives the browser. */
export type DocumentPdfStart = {
  /** The place, for `finishDocumentPdf` (or `cancelDocumentPdf`). */
  upload: string;
  /**
   * Storage's signed upload for the PDF's one path in the `documents`
   * bucket, good for 2 hours: the browser PUTs the file's bytes there as they
   * are, with `Content-Type: application/pdf`, and nothing else (no session,
   * no key). Once a file is there nothing replaces it; once the place is let
   * go, its tombstone is.
   */
  signedUrl: string;
  /** Its name as it is kept (`cleanFileName`, ending in `.pdf`). */
  name: string;
  /** Its size in bytes, as the PUT must bring it. */
  size: number;
};

/**
 * Starts sending a document's PDF (C7), from what the browser says of it:
 * which way it goes (who may send it), its name (cleaned, ending in `.pdf`)
 * and size (1 byte to 10 MiB). Reserves its place with the sending's own
 * checks (`reserveDocumentUpload`: the business's space, the project's
 * Storage, ten PDFs waiting at most) and makes Storage's signed upload for
 * that one path with the secret key (`upsert` off), whose URL is all the
 * browser gets.
 */
export async function startDocumentPdf(
  actorId: string,
  businessId: string,
  input: { direction: DocumentDirection; name: string; size: number },
  at?: Date,
): Promise<DocumentFileWrite<DocumentPdfStart>> {
  const file = checkChatPdf({ name: input.name, size: input.size });
  if (!file.ok) return refusedFile(file.problem);
  const allowed = await documentsAllowed(businessId);
  if (allowed !== "yes") return refusedFile(allowed);

  const place = await reserveDocumentUpload(
    actorId,
    businessId,
    {
      direction: input.direction,
      kind: "pdf",
      type: CHAT_PDF_TYPE,
      size: file.size,
      name: file.name,
    },
    at,
  );
  if (!place.ok) return place;
  const { upload, path } = place.value;

  const signed = await createAdminClient()
    .storage.from(DOCUMENT_BUCKET)
    .createSignedUploadUrl(path, { upsert: false });
  if (
    signed.error ||
    !signed.data ||
    !isSignedUploadFor(signed.data.signedUrl, path, DOCUMENT_BUCKET)
  ) {
    // The place is let go, so it counts for nothing; the clean-up removes
    // its tombstone a day on.
    console.error(
      "a document's PDF upload was not signed for its place",
      signed.error?.name ?? "another place",
    );
    await occupyPlace(path, DOCUMENT_BUCKET);
    return refusedFile("failed");
  }
  return done({
    upload,
    signedUrl: signed.data.signedUrl,
    name: file.name,
    size: file.size,
  });
}

/**
 * Sends the document whose PDF the browser put at its place (C7). The place
 * is the signed-in person's own (`documentUploadPlace`, so the file read is
 * the reservation's, never one the browser names), within its 2 hours. Its
 * first KB is read with the secret key and must be a PDF's (`isPdf`), and
 * public.send_document checks its size and type in Storage before the
 * document is written. A place sent already (a retry whose answer was lost)
 * gives back its document. On any refusal the file is let go at once (its
 * tombstone replaces it), unless the document was written after all.
 */
export async function finishDocumentPdf(
  actorId: string,
  businessId: string,
  input: DocumentFields & { upload: string },
  at?: Date,
): Promise<DocumentFileWrite<{ document: string }>> {
  const { upload, ...fields } = input;
  if (!isUuid(upload) || !checkedFields(fields)) return refusedFile("invalid");
  const allowed = await documentsAllowed(businessId);
  if (allowed !== "yes") return refusedFile(allowed);

  const place = await documentUploadPlace(actorId, businessId, upload, at);
  if (place === null || ("kind" in place && place.kind !== "pdf")) {
    return refusedFile("noAccess");
  }
  if ("failure" in place) return refusedFile(place.failure);
  if (place.used) {
    return place.document
      ? done({ document: place.document })
      : refusedFile("failed");
  }
  if (!place.fresh) {
    await sentOrLetGo(actorId, businessId, place.upload);
    return refusedFile("expired");
  }

  const head = await storedHead(place.path, DOCUMENT_BUCKET);
  if (head === "missing") return refusedFile("notUploaded");
  if (head === "unreadable") return refusedFile("failed");
  // Let go already (a refusal before this try): a new place, a new upload.
  if (isPlaceTombstone(head)) return refusedFile("expired");
  if (!isPdf(head)) {
    await sentOrLetGo(actorId, businessId, place.upload);
    return refusedFile("notPdf");
  }

  const sent = await sendDocument(
    actorId,
    businessId,
    { ...fields, upload: place.upload },
    at,
  );
  if (sent.ok) return sent;
  const written = await sentOrLetGo(actorId, businessId, place.upload);
  return written ? done({ document: written }) : refusedFile(sent.failure);
}

/**
 * The person stopped sending a document's PDF (C7): its place is let go at
 * once (its tombstone replaces whatever the browser put there), unless it was
 * sent, which the answer says with its document. Nothing for anyone else's
 * place, the same answer as for one's own not sent.
 */
export async function cancelDocumentPdf(
  actorId: string,
  businessId: string,
  upload: string,
): Promise<DocumentFileWrite<{ sent: boolean; document: string | null }>> {
  if (!isUuid(upload)) return refusedFile("invalid");
  const place = await documentUploadPlace(actorId, businessId, upload);
  if (place === null || ("kind" in place && place.kind !== "pdf")) {
    return done({ sent: false, document: null });
  }
  if ("failure" in place) return refusedFile(place.failure);
  if (place.used) return done({ sent: true, document: place.document });
  if (!(await occupyPlace(place.path, DOCUMENT_BUCKET))) {
    return refusedFile("failed");
  }
  return done({ sent: false, document: null });
}

/**
 * The signed-in person opens a document (`public.open_document`), for C7's
 * /document-files routes once they hold the file to serve (read first under
 * the reader's own session, `documentToServe` and `documentFileBytes`, so a
 * file that can't be given marks and logs nothing): a recipient's first
 * opening is marked and their documents.sent line settled; the office's
 * first opening of a document to the business marks it received and settles
 * documents.received for all of the office; and every opening by the office
 * of someone else's document is logged (document.open, once a day per
 * reader). Returns where its file is (`path`, null once the file is gone or
 * its removal's 10 minutes passed), its kind and name, or its sample.
 * "noAccess" for a document they don't read, the same as for none.
 */
export async function openDocument(
  actorId: string,
  documentId: string,
  at?: Date,
): Promise<DocumentWrite<OpenedDocument>> {
  if (!isUuid(documentId)) return refused("noAccess");
  const { data, error } = await createAdminClient().rpc("open_document", {
    actor: actorId,
    document: documentId.toLowerCase(),
    ...atTime(at),
  });
  if (error) return refused(documentFailureOf(error));
  const opened = openedDocumentSchema.safeParse(data);
  if (!opened.success) return refused("failed");
  const { path } = opened.data;
  // Only a path in the database's shape, in the document's own business.
  if (path !== null && !isDocumentFilePath(path, opened.data.business)) {
    return refused("failed");
  }
  return done(opened.data);
}

type DocumentChange = "confirm_document" | "restore_document";

async function changeDocument(
  change: DocumentChange,
  actorId: string,
  documentId: string,
  at?: Date,
): Promise<DocumentWrite<null>> {
  if (!isUuid(documentId)) return refused("noAccess");
  const { error } = await createAdminClient().rpc(change, {
    actor: actorId,
    document: documentId.toLowerCase(),
    ...atTime(at),
  });
  return error ? refused(documentFailureOf(error)) : done(null);
}

/**
 * "קראתי ואישרתי" (C7): a recipient on the staff confirms a document that
 * asks for it, once, and their own line is settled. "invalid" for one that
 * asks nothing, "noAccess" for anyone it wasn't sent to and for someone who
 * left. A removed one is "noAccess" to a plain recipient (it is hidden from
 * them, so it is unknown, P0002: the screen says it is no longer there), and
 * "closed" only to a recipient who still reads it, one in the office.
 */
export function confirmDocument(
  actorId: string,
  documentId: string,
  at?: Date,
): Promise<DocumentWrite<null>> {
  return changeDocument("confirm_document", actorId, documentId, at);
}

/**
 * Removes a document's file, never its row (C7): its sender within 10
 * minutes of sending, as "taken_back"; the office with a reason from the
 * list. The file waits 10 minutes for `restoreDocument`, then the chat job
 * removes it; every line about the document is settled, and the office's
 * log gets document.remove with the reason's code. Removing it again changes
 * nothing.
 */
export async function removeDocument(
  actorId: string,
  documentId: string,
  reason: DocumentRemoveReason,
  at?: Date,
): Promise<DocumentWrite<null>> {
  if (!isUuid(documentId)) return refused("noAccess");
  if (!isDocumentRemoveReason(reason)) return refused("invalid");
  const { error } = await createAdminClient().rpc("remove_document", {
    actor: actorId,
    document: documentId.toLowerCase(),
    reason,
    ...atTime(at),
  });
  return error ? refused(documentFailureOf(error)) : done(null);
}

/**
 * Puts a removed document's file back (C7's "ביטול"): whoever removed it,
 * within its 10 minutes ("closed" after, "noAccess" for anyone else). Those
 * it still waits for are told again.
 */
export function restoreDocument(
  actorId: string,
  documentId: string,
  at?: Date,
): Promise<DocumentWrite<null>> {
  return changeDocument("restore_document", actorId, documentId, at);
}

/** A document's file as the reader may have it served. */
export type DocumentFile =
  | { kind: "image"; bytes: Uint8Array<ArrayBuffer>; type: ChatImageType }
  | { kind: "pdf"; body: ReadableStream<Uint8Array>; name: string | null };

/**
 * A document's file as the signed-in person may read it, for C7's
 * /document-files routes (before `openDocument`, which marks and logs only
 * once there is a file to give): its row read under their own session (RLS:
 * a document they read), pointing at the path and not removed (even within
 * its 10 minutes of undo), and the file downloaded under the same session, so
 * the bucket's policy decides too. Its type always comes from its bytes and
 * must be the path's and the row's: a photo of a page whole (at most 700 KB),
 * a PDF streamed on once its first KB proved it one (up to 10 MiB, never held
 * whole), with its name. Null for anything else, the same whether or not a
 * file is there. `session` is the reader's own, made while the request was
 * being answered (`documentSession`), for a download that reads its files
 * after its answer began streaming, when the request's cookies can no longer
 * be asked for; one is made here otherwise.
 */
export async function documentFileBytes(
  path: string,
  session?: DocumentSession,
): Promise<DocumentFile | null> {
  const parts = parseDocumentFilePath(path);
  if (!parts) return null;
  const kind = documentFileKindOf(parts.extension);
  const supabase = session ?? (await createClient());
  const row = await supabase
    .from("documents")
    .select("file_kind, file_path, file_name, removed_at")
    .eq("business_id", parts.businessId)
    .eq("file_path", path)
    .maybeSingle();
  const document = row.data;
  if (
    row.error ||
    !document ||
    document.file_path !== path ||
    document.file_kind !== kind ||
    document.removed_at !== null
  ) {
    return null;
  }
  const storage = supabase.storage.from(DOCUMENT_BUCKET);
  if (kind === "pdf") {
    const file = await storage.download(path).asStream();
    const stream = (file.data ?? null) as ReadableStream<Uint8Array> | null;
    if (!stream) return null;
    const start = await readAtLeast(stream, CHAT_PDF_HEAD_BYTES);
    if (!isPdf(start.bytes)) {
      await start.reader.cancel().catch(() => undefined);
      return null;
    }
    return { kind, body: withStart(start), name: document.file_name };
  }
  const file = await storage.download(path);
  if (file.error || !file.data) return null;
  const bytes = new Uint8Array(await file.data.arrayBuffer());
  const wanted = chatImageTypeOf(parts.extension);
  return wanted !== null && sniffPhotoType(bytes) === wanted
    ? { kind, bytes, type: wanted }
    : null;
}
