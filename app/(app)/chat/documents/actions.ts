"use server";

import {
  cancelDocumentPdf,
  confirmDocument,
  type DocumentFields,
  finishDocumentPdf,
  removeDocument,
  restoreDocument,
  seeDocumentsNotice,
  sendDocumentPhoto,
  sendDocumentSample,
  startDocumentPdf,
} from "@db/documents";
import {
  documentIdInput,
  documentPdfCancelInput,
  documentPdfFinishInput,
  documentPdfStartInput,
  documentRemoveReasonInput,
  documentSampleInput,
  documentSendInput,
} from "@domain/document-sending";
import { DOCUMENT_PHOTO_MAX_BYTES } from "@domain/documents";
import { refresh } from "next/cache";
import type { z } from "zod";
import { pushSoon } from "../../../push/server";
import type {
  DocumentActionFailure,
  DocumentActionResult,
  DocumentPdfCancelResult,
  DocumentPdfStartResult,
  DocumentSentResult,
} from "./document-types";
import { type DocumentsAccess, documentsAccess } from "./documents-access";

/**
 * A documents write as the signed-in person (chat C7), in the business the
 * screen was drawn for (`business`, bound on the page: the business the app
 * opens is one cookie for the whole browser, so a document from a tab left
 * open may arrive after the person switched, and is refused then, never
 * written in the other), never while viewing as someone. The database holds
 * the rules of who may do what. Nothing is logged but an error's code: never
 * a document's category, title, note or file (a sick note is health data).
 */
async function asMember<T, F extends DocumentActionFailure>(
  business: unknown,
  run: (
    actorId: string,
    businessId: string,
    access: DocumentsAccess,
  ) => Promise<{ ok: true; value: T } | { ok: false; failure: F }>,
): Promise<DocumentActionResult<T>> {
  const access = await documentsAccess();
  if (!access) return { ok: false, failure: "noAccess" };
  if (business !== access.businessId) {
    return { ok: false, failure: "businessChanged" };
  }
  if (access.viewing) return { ok: false, failure: "viewOnly" };
  try {
    return await run(access.userId, access.businessId, access);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : "without a code";
    console.error("a documents action failed", code);
    return { ok: false, failure: "failed" };
  }
}

/**
 * A document's fields as they go: in a demo business no title and no note
 * (its rows outlive the visitors' hour, so nothing typed may sit in them; the
 * database writes the category's words for its title), else as typed.
 */
function fieldsOf(
  access: DocumentsAccess,
  input: z.output<typeof documentSendInput>,
): DocumentFields {
  return {
    direction: input.direction,
    category: input.category,
    title: access.demo ? input.category : input.title,
    note: access.demo ? null : (input.note ?? null),
    ...(input.to !== undefined ? { to: input.to } : {}),
    ...(input.asks !== undefined ? { asks: input.asks } : {}),
  };
}

/**
 * Sends a document with a photo of its page (C7), as the screen re-encoded it
 * (`encodeDocumentPhoto`): the form's `file` (a JPEG or WebP, at most 1600 px
 * and 700 KB, nothing from the camera inside) and `document`, a JSON
 * `DocumentSendInput` (which way, the category, the title and note as typed,
 * and to people whom and whether to ask for "קראתי"). Bound on the page to
 * the business it was drawn for. The server checks the photo again, reserves
 * its place, uploads it with the secret key and sends the document, removing
 * the photo at once on any refusal; the whole form stays under the 1 MB a
 * server action takes. Returns the document's id; the office (or each
 * recipient) is told, and the phones with the minute job.
 */
export async function sendDocumentPhotoAction(
  business: string,
  form: FormData,
): Promise<DocumentSentResult> {
  if (!(form instanceof FormData)) return { ok: false, failure: "invalid" };
  const file = form.get("file");
  if (!(file instanceof Blob)) return { ok: false, failure: "empty" };
  if (file.size > DOCUMENT_PHOTO_MAX_BYTES)
    return { ok: false, failure: "tooBig" };
  const meta = form.get("document");
  let parsed: ReturnType<typeof documentSendInput.safeParse> | null = null;
  if (typeof meta === "string" && meta.length <= 64 * 1024) {
    try {
      parsed = documentSendInput.safeParse(JSON.parse(meta));
    } catch {
      parsed = null;
    }
  }
  if (!parsed?.success) return { ok: false, failure: "invalid" };
  const input = parsed.data;
  const result = await asMember(business, (actor, businessId, access) =>
    sendDocumentPhoto(actor, businessId, { ...fieldsOf(access, input), file }),
  );
  if (result.ok) pushSoon();
  return result;
}

/**
 * Starts sending a document's PDF (C7; `documentPdfStartInput`: which way it
 * goes, and its `name` and `size` as the browser has them). The server checks
 * the name (a .pdf) and size (1 byte to 10 MiB), reserves its place with the
 * sending's own checks, and returns `DocumentPdfStart`: the place (`upload`),
 * the name as kept, and `signedUrl`, Storage's signed upload for that one
 * path, good for 2 hours. The browser then PUTs the file's bytes to it with
 * `Content-Type: application/pdf`, by itself (plain `fetch` or
 * `XMLHttpRequest`, for its progress), with no Supabase client and no
 * session, and calls `finishDocumentPdfAction`. Nothing is sent yet.
 */
export async function startDocumentPdfAction(
  business: string,
  input: unknown,
): Promise<DocumentPdfStartResult> {
  const parsed = documentPdfStartInput.safeParse(input);
  if (!parsed.success) return { ok: false, failure: "invalid" };
  const asked = parsed.data;
  return asMember(business, (actor, businessId) =>
    startDocumentPdf(actor, businessId, asked),
  );
}

/**
 * Sends the document whose PDF the browser put at its place (C7;
 * `documentPdfFinishInput`: the `upload` `startDocumentPdfAction` gave, and
 * the document's fields as for a photo). The server reads the place's file
 * (its database's path, never one the browser names), checks its first KB is
 * a PDF's and sends the document; on any refusal the file is let go (the
 * server's tombstone replaces it, so its signed upload can't write there
 * again). Finishing the same place again gives back the same document.
 */
export async function finishDocumentPdfAction(
  business: string,
  input: unknown,
): Promise<DocumentSentResult> {
  const parsed = documentPdfFinishInput.safeParse(input);
  if (!parsed.success) return { ok: false, failure: "invalid" };
  const { upload, ...fields } = parsed.data;
  const result = await asMember(business, (actor, businessId, access) =>
    finishDocumentPdf(actor, businessId, {
      ...fieldsOf(access, fields),
      upload,
    }),
  );
  if (result.ok) pushSoon();
  return result;
}

/**
 * The person stopped sending a document's PDF (C7; `documentPdfCancelInput`:
 * its `upload`): its place is let go, unless it was sent, which the answer
 * says (`sent`, with its `document`). The screen aborts its PUT first.
 */
export async function cancelDocumentPdfAction(
  business: string,
  input: unknown,
): Promise<DocumentPdfCancelResult> {
  const parsed = documentPdfCancelInput.safeParse(input);
  if (!parsed.success) return { ok: false, failure: "invalid" };
  const { upload } = parsed.data;
  return asMember(business, (actor, businessId) =>
    cancelDocumentPdf(actor, businessId, upload),
  );
}

/**
 * A demo business's document (C7, plan §13; `documentSampleInput`: which
 * way, the category, and to people whom and whether to ask for "קראתי"):
 * its category's sample, with no title, note or file typed or picked. Only
 * the categories with a sample (`DEMO_DOCUMENT_CATEGORIES` in
 * @domain/document-files); "invalid" for any other and outside a demo
 * business.
 */
export async function sendDocumentSampleAction(
  business: string,
  input: unknown,
): Promise<DocumentSentResult> {
  const parsed = documentSampleInput.safeParse(input);
  if (!parsed.success) return { ok: false, failure: "invalid" };
  const asked = parsed.data;
  const result = await asMember(business, async (actor, businessId, access) =>
    access.demo
      ? sendDocumentSample(actor, businessId, asked)
      : { ok: false as const, failure: "invalid" as const },
  );
  if (result.ok) pushSoon();
  return result;
}

/**
 * "קראתי ואישרתי": a recipient on the staff confirms a document that asks
 * for it, once; their own line is settled, and its sender and the office see
 * it. The page draws again.
 */
export async function confirmDocumentAction(
  business: string,
  document: unknown,
): Promise<DocumentActionResult> {
  const id = documentIdInput.safeParse(document);
  if (!id.success) return { ok: false, failure: "invalid" };
  const result = await asMember(business, (actor) =>
    confirmDocument(actor, id.data),
  );
  if (result.ok) refresh();
  return result;
}

/**
 * Removes a document's file, never its row ("מחיקת הקובץ"): its sender
 * within 10 minutes of sending, as `taken_back` (the "ביטול" after sending);
 * the office with a reason from the list (`wrong_person`, `wrong_file`,
 * `duplicate`, `other`). The file waits 10 minutes for
 * `restoreDocumentAction`; the page draws again with "הקובץ נמחק: {reason}".
 */
export async function removeDocumentAction(
  business: string,
  document: unknown,
  reason: unknown,
): Promise<DocumentActionResult> {
  const id = documentIdInput.safeParse(document);
  const why = documentRemoveReasonInput.safeParse(reason);
  if (!id.success || !why.success) return { ok: false, failure: "invalid" };
  const result = await asMember(business, (actor) =>
    removeDocument(actor, id.data, why.data),
  );
  if (result.ok) refresh();
  return result;
}

/**
 * "ביטול" after removing a document's file, or after sending one: whoever
 * removed it puts it back within the database's 10 minutes ("closed" after,
 * "noAccess" for anyone else). Those it still waits for are told again.
 */
export async function restoreDocumentAction(
  business: string,
  document: unknown,
): Promise<DocumentActionResult> {
  const id = documentIdInput.safeParse(document);
  if (!id.success) return { ok: false, failure: "invalid" };
  const result = await asMember(business, (actor) =>
    restoreDocument(actor, id.data),
  );
  if (result.ok) {
    pushSoon();
    refresh();
  }
  return result;
}

/**
 * Someone in the office read the notice that the business keeps its own copy
 * of its official documents ("הבנתי"): kept once, in the database, and the
 * screen draws again without it.
 */
export async function seeDocumentsNoticeAction(
  business: string,
): Promise<DocumentActionResult> {
  const result = await asMember(business, (actor, businessId) =>
    seeDocumentsNotice(actor, businessId),
  );
  if (result.ok) refresh();
  return result;
}
