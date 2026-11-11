import "server-only";
import { isUuid } from "@domain/activity";
import {
  CHAT_PDF_HEAD_BYTES,
  type ChatImageType,
  chatImageTypeOf,
  isPdf,
} from "@domain/chat-files";
import {
  checkDocumentNote,
  checkDocumentTitle,
  DOCUMENT_BUCKET,
  DOCUMENT_RECIPIENTS_MAX,
  type DocumentCategory,
  type DocumentDirection,
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
import { sniffPhotoType } from "@domain/profile-photos";
import { z } from "zod";
import { readAtLeast, withStart } from "./byte-stream";
import { isMissingFunction } from "./missing";
import { isMissingTable } from "./notifications";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

/*
 * Official documents (supabase/migrations/20261111000700_documents.sql, chat
 * C6): the database side of what C7's screens and its /document-files route
 * will call. Nothing here is on a screen yet.
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
 * For C7, which builds on these: the photo of a page goes through the server
 * (`checkDocumentPhoto`, `reserveDocumentUpload` with kind "image", an upload
 * to the `documents` bucket with the secret key, then `sendDocument` with the
 * place), and a PDF through a signed upload for its one reserved path, as
 * chat's PDFs do (`reserveDocumentUpload` with kind "pdf", Storage's signed
 * upload, `documentUploadPlace` and an `isPdf` read of its first KB on
 * finishing, then `sendDocument`); on any refusal its file is let go as
 * @db/chat-files does. The /document-files route calls `openDocument` (which
 * logs the office's opening and marks a recipient's) and then
 * `documentFileBytes` under the reader's own session.
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
};

const COLUMNS =
  "id, business_id, direction, person_id, author_id, category, title, note, file_kind, file_path, file_name, file_size, sample, asks_confirmation, sent_at, opened_at, opened_by, removed_at, removed_by, removed_reason, file_gone_after";

/** Documents one read gives at most. */
export const DOCUMENTS_READ_MAX = 200;

type Session = Awaited<ReturnType<typeof createClient>>;

/** The rows read back as documents, each with the marks RLS gives the reader. */
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
  const marks = toPeople.length
    ? await supabase
        .from("document_recipients")
        .select("document_id, person_id, opened_at, confirmed_at")
        .eq("business_id", businessId)
        .in("document_id", toPeople)
        .order("person_id")
    : null;
  if (marks?.error) throw marks.error;
  const byDocument = new Map<string, DocumentRecipientMark[]>();
  for (const row of marks?.data ?? []) {
    const mark = documentMarkSchema.safeParse(row);
    if (!mark.success) continue;
    const list = byDocument.get(mark.data.documentId) ?? [];
    list.push(mark.data);
    byDocument.set(mark.data.documentId, list);
  }
  return documents.map((document) => ({
    ...document,
    recipients: byDocument.get(document.id) ?? [],
  }));
}

/**
 * The documents the signed-in person reads in the business, newest first,
 * under their own session (C7's /chat/documents): for someone on the staff
 * their own both ways, for the office every one, for a sender those they
 * sent too. With `person`, only that person's: theirs to the business and
 * those sent to them (the office's view of one person). At most `limit`
 * (100 unless asked, never over 200). "notYet" before the migration.
 */
export async function getDocuments(
  businessId: string,
  options: { person?: string; limit?: number } = {},
): Promise<DocumentView[] | "notYet"> {
  if (!isUuid(businessId)) return [];
  const supabase = await createClient();
  const limit = Math.min(Math.max(options.limit ?? 100, 1), DOCUMENTS_READ_MAX);
  let query = supabase
    .from("documents")
    .select(COLUMNS)
    .eq("business_id", businessId);
  if (options.person !== undefined) {
    if (!isUuid(options.person)) return [];
    const person = options.person.toLowerCase();
    // The documents sent to them, as far as the reader sees their marks.
    const sentTo = await supabase
      .from("document_recipients")
      .select("document_id")
      .eq("business_id", businessId)
      .eq("person_id", person)
      .limit(DOCUMENTS_READ_MAX);
    if (sentTo.error) {
      if (isMissingTable(sentTo.error)) return "notYet";
      throw sentTo.error;
    }
    const ids = (sentTo.data ?? [])
      .map((row) => row.document_id)
      .filter((id) => isUuid(id));
    query =
      ids.length > 0
        ? query.or(`person_id.eq.${person},id.in.(${ids.join(",")})`)
        : query.eq("person_id", person);
  }
  const { data, error } = await query
    .order("sent_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingTable(error)) return "notYet";
    throw error;
  }
  return withMarks(supabase, businessId, data ?? []);
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

/** What a document is sent with: a reserved file's place, or a demo's sample. */
export type DocumentSending = {
  direction: DocumentDirection;
  category: DocumentCategory;
  /** In a demo business the database writes the category's words instead. */
  title: string;
  note?: string | null;
  /** To people: whom (the screen resolves a department or everyone), 1 to 200. */
  to?: readonly string[];
  /** To people: ask each for "קראתי". */
  asks?: boolean;
} & (
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
  if (!takesCategory(input.direction, input.category)) {
    return refused("invalid");
  }
  const title = checkDocumentTitle(input.title);
  const note = checkDocumentNote(input.note);
  if (!title.ok || !note.ok) return refused("invalid");
  const to = [...new Set((input.to ?? []).map((id) => id.toLowerCase()))];
  if (input.direction === "to_people") {
    if (
      to.length === 0 ||
      to.length > DOCUMENT_RECIPIENTS_MAX ||
      !to.every((id) => isUuid(id))
    ) {
      return refused("invalid");
    }
  } else if (to.length > 0 || input.asks === true) {
    return refused("invalid");
  }
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
    send_title: title.title,
    ...(note.note !== null ? { send_note: note.note } : {}),
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
 * The signed-in person opens a document (`public.open_document`), for C7's
 * /document-files route before it serves the file: a recipient's first
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
 * /document-files route (after `openDocument`): its row read under their own
 * session (RLS: a document they read), pointing at the path, not removed or
 * still within its removal's 10 minutes, and the file downloaded under the
 * same session, so the bucket's policy decides too. Its type always comes
 * from its bytes and must be the path's and the row's: a photo of a page
 * whole (at most 700 KB), a PDF streamed on once its first KB proved it one
 * (up to 10 MiB, never held whole), with its name. Null for anything else,
 * the same whether or not a file is there.
 */
export async function documentFileBytes(
  path: string,
  now: Date = new Date(),
): Promise<DocumentFile | null> {
  const parts = parseDocumentFilePath(path);
  if (!parts) return null;
  const kind = documentFileKindOf(parts.extension);
  const supabase = await createClient();
  const row = await supabase
    .from("documents")
    .select("file_kind, file_path, file_name, removed_at, file_gone_after")
    .eq("business_id", parts.businessId)
    .eq("file_path", path)
    .maybeSingle();
  const document = row.data;
  if (
    row.error ||
    !document ||
    document.file_path !== path ||
    document.file_kind !== kind ||
    (document.removed_at !== null &&
      !(
        document.file_gone_after !== null &&
        Date.parse(document.file_gone_after) > now.getTime()
      ))
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
