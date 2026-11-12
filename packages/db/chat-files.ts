import "server-only";
import { isUuid } from "@domain/activity";
import { checkMessage } from "@domain/chat";
import {
  CHAT_FILE_BUCKET,
  CHAT_PDF_HEAD_BYTES,
  CHAT_PDF_TYPE,
  type ChatImageProblem,
  type ChatImageType,
  chatFileSrc,
  chatImageTypeOf,
  chatPlaceTombstone,
  checkChatImage,
  checkChatPdf,
  checkChatThumb,
  isChatFilePath,
  isPdf,
  isPlaceTombstone,
  parseChatFilePath,
} from "@domain/chat-files";
import {
  DOCUMENT_BUCKET,
  isDocumentFilePath,
  parseDocumentFilePath,
} from "@domain/documents";
import { sniffPhotoType } from "@domain/profile-photos";
import { z } from "zod";
import { readAtLeast, withStart } from "./byte-stream";
import { type ChatFailure, type ChatTarget, chatFailureOf } from "./chat";
import { publicEnv } from "./env";
import { isMissingColumn, isMissingFunction } from "./missing";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

/*
 * Files in chat (C4, supabase/migrations/20261111000500_chat_files.sql).
 * Writes run with the secret key for `actorId`: callers make sure that is the
 * signed-in person, not someone viewing as them, in the business the screen
 * was drawn for. A picture and its thumbnail, re-encoded in the browser, are
 * checked here again (@domain/chat-files), their place reserved with the
 * sending's own checks (`public.reserve_chat_upload`), uploaded under it, and
 * sent (`public.send_chat_message` with the reservation, which checks the
 * files in Storage before the message is written); on any refusal both files
 * are removed at once, and when the sending's end is unknown (its answer
 * lost) they stay for the message that may hold them, or for the clean-up a
 * day on. The bucket takes nothing from the browser, and its
 * policy lets only the readers of a message read its files: they are served
 * by the app's /chat-files route under the reader's own session. A demo
 * business takes no files (`public.chat_files_closed`), and the database
 * refuses one too. Nothing here logs a file's name or a message's words: a
 * failure is logged by its code.
 *
 * A PDF (C5, 20261111000600_chat_pdfs.sql) is too large for the server's
 * body (Vercel refuses over 4.5 MB), so the browser puts it in Storage
 * itself, through a signed upload the server makes for its one reserved path
 * (`startChatPdf`, `upsert` off), with no Supabase client and no session.
 * Storage keeps that upload good for 2 hours and marks nothing used: it writes
 * wherever nothing is, and never replaces a file. So a place stays taken until
 * its upload can't write any more: once let go (a stop, a refusal, or the
 * job's removal of a sent file while that upload may still be good) it holds
 * the server's 1-byte tombstone (`chatPlaceTombstone`), never nothing, and the
 * clean-up removes that a day on. The server reads the path's first KB, the
 * path its database gives for the reservation and never one the browser
 * names, checks it is a PDF and sends it (`finishChatPdf`), the database
 * checking its size and type in Storage. On any refusal the file is let go,
 * unless a message holds it. The secret key never leaves the server.
 */

/**
 * Why a picture was refused, for the screens' words: a chat write's reasons
 * (`ChatFailure`), what the server found in the file (`ChatImageProblem`:
 * empty, tooBig, type, metadata, pixels), a demo business ("demo"), and the
 * project's Storage full ("noRoom": the message itself can still be sent).
 */
export type ChatFileFailure =
  | ChatFailure
  | ChatImageProblem
  | "demo"
  | "noRoom";

export type ChatFileWrite<T> =
  | { ok: true; value: T }
  | { ok: false; failure: ChatFileFailure };

const refused = (failure: ChatFileFailure) => ({ ok: false, failure }) as const;

/**
 * Whether the business takes files in chat: not a demo business whose
 * definition doesn't open it ("chatFiles": true, the local seed's restaurant
 * only). Before the migration reaches a project, nothing would stop a demo
 * upload, nor take one, so files wait until it does ("notYet").
 */
export async function chatFilesAllowed(
  businessId: string,
): Promise<"yes" | "demo" | "notYet"> {
  const { data, error } = await createAdminClient().rpc("chat_files_closed", {
    business: businessId,
  });
  if (error) {
    if (isMissingFunction(error)) return "notYet";
    throw error;
  }
  return data ? "demo" : "yes";
}

/**
 * A refusal of the reservation: the project's Storage full (54000 with hint
 * 'storage') has its own words; a 31st in a minute is "tooFast", as a
 * message's.
 */
function reserveFailureOf(error: {
  code?: string;
  hint?: string | null;
}): ChatFileFailure {
  if (error.code === "54000" && error.hint === "storage") return "noRoom";
  return chatFailureOf(error);
}

const reservedSchema = z.object({
  upload: z.string().refine(isUuid),
  path: z.string(),
  thumb: z.string().nullable(),
  conversation: z.string().refine(isUuid),
});

const sentSchema = z.object({
  conversation: z.string().refine(isUuid),
  message: z.string().refine(isUuid),
  attached: z.boolean().optional(),
});

/**
 * Sends a picture (`full`, with its thumbnail `thumb`, both as the browser
 * re-encoded them, the same type), with words or none, to a conversation or
 * to someone on the staff, whose private chat it opens. `draft` is the
 * browser's own id for the message: sending the same draft again gives back
 * the same message, and the files uploaded again for it are removed. Checked
 * here first (a JPEG or WebP by its bytes, nothing from the camera inside,
 * still, the picture at most 1280 px and 400 KB, the thumbnail 360 px and
 * 48 KB), then reserved, uploaded with the secret key (`upsert: false`) and
 * sent. Returns where it went (a new private chat's id) and the message.
 */
export async function sendChatImage(
  actorId: string,
  businessId: string,
  input: ChatTarget & {
    draft: string;
    words?: string;
    announce?: boolean;
    full: Blob;
    thumb: Blob;
  },
  at?: Date,
): Promise<ChatFileWrite<{ conversation: string; message: string }>> {
  if (!isUuid(input.draft)) return refused("invalid");
  const typed = input.words?.trim() ? checkMessage(input.words) : null;
  if (typed && !typed.ok) return refused("invalid");
  const target =
    "conversation" in input
      ? isUuid(input.conversation)
        ? { conversation: input.conversation.toLowerCase() }
        : null
      : isUuid(input.toPerson)
        ? { to_person: input.toPerson.toLowerCase() }
        : null;
  if (!target) return refused("noAccess");

  const allowed = await chatFilesAllowed(businessId);
  if (allowed !== "yes") return refused(allowed);

  const [fullBytes, thumbBytes] = await Promise.all([
    input.full.arrayBuffer().then((buffer) => new Uint8Array(buffer)),
    input.thumb.arrayBuffer().then((buffer) => new Uint8Array(buffer)),
  ]);
  const full = checkChatImage({
    type: input.full.type,
    size: input.full.size,
    bytes: fullBytes,
  });
  if (!full.ok) return refused(full.problem);
  const thumb = checkChatThumb({
    type: input.thumb.type,
    size: input.thumb.size,
    bytes: thumbBytes,
  });
  if (!thumb.ok) return refused(thumb.problem);
  // One encoder drew both: a thumbnail of another type didn't come from it.
  if (thumb.type !== full.type) return refused("type");

  const admin = createAdminClient();
  const reserved = await admin.rpc("reserve_chat_upload", {
    actor: actorId,
    business: businessId,
    upload_kind: "image",
    upload_type: full.type,
    upload_size: fullBytes.length + thumbBytes.length,
    ...target,
    ...(at ? { at_time: at.toISOString() } : {}),
  });
  if (reserved.error) return refused(reserveFailureOf(reserved.error));
  const place = reservedSchema.safeParse(reserved.data);
  if (!place.success) return refused("failed");
  const { upload, path, thumb: thumbPath, conversation } = place.data;
  const where = { businessId, conversationId: conversation.toLowerCase() };
  if (
    !thumbPath ||
    !isChatFilePath(path, where) ||
    !isChatFilePath(thumbPath, where)
  ) {
    return refused("failed");
  }

  const storage = admin.storage.from(CHAT_FILE_BUCKET);
  const removeBoth = async () => {
    const gone = await storage.remove([path, thumbPath]);
    // What stays is read by nobody, and the job's clean-up removes it a day on.
    if (gone.error) console.error("a chat file stayed", gone.error.name);
  };
  const uploads = await Promise.all([
    storage.upload(path, fullBytes, { contentType: full.type, upsert: false }),
    storage.upload(thumbPath, thumbBytes, {
      contentType: thumb.type,
      upsert: false,
    }),
  ]);
  if (uploads.some((uploaded) => uploaded.error)) {
    console.error("a chat file upload failed");
    await removeBoth();
    return refused("failed");
  }

  const sent = await admin.rpc("send_chat_message", {
    actor: actorId,
    business: businessId,
    draft: input.draft.toLowerCase(),
    ...(typed?.ok ? { words: typed.body } : {}),
    conversation,
    announce: "conversation" in input && input.announce === true,
    upload,
    ...(at ? { at_time: at.toISOString() } : {}),
  });
  if (sent.error) {
    // The database said no (a SQLSTATE): nothing holds the files. Without
    // one (the answer was lost on its way back, `code: ""`), the message
    // may have been written with them: they stay, for that message, and if
    // none was written its unused reservation takes them in a day; a retry
    // under the same draft removes only its own upload (`attached: false`).
    if (!sent.error.code) {
      console.error("a chat picture's sending ended unknown");
      return refused("failed");
    }
    await removeBoth();
    return refused(
      sent.error.code === "55000" &&
        (await chatFilesAllowed(businessId)) === "demo"
        ? "demo"
        : chatFailureOf(sent.error),
    );
  }
  const message = sentSchema.safeParse(sent.data);
  // Written, but not read back as itself: the files stay with the message
  // (as above), and the screen tries again under the same draft.
  if (!message.success) return refused("failed");
  // The draft was sent already: these files are nobody's.
  if (message.data.attached === false) await removeBoth();
  return {
    ok: true,
    value: {
      conversation: message.data.conversation,
      message: message.data.message,
    },
  };
}

/**
 * Why a PDF was refused (C5), for the screens' words: a chat write's reasons
 * (`ChatFailure`), a demo business ("demo"), the project's Storage full
 * ("noRoom": the words can still go as a message), and the PDF's own.
 */
export type ChatPdfFailure =
  | ChatFailure
  | "demo"
  | "noRoom"
  /** It is 0 bytes. */
  | "empty"
  /** Over 10 MiB (`CHAT_PDF_MAX_BYTES`). */
  | "tooBig"
  /** Its name isn't a `.pdf`, or its bytes aren't a PDF's (`isPdf`). */
  | "notPdf"
  /** Storage holds nothing at its place: the browser's PUT didn't arrive. */
  | "notUploaded"
  /**
   * Its place's 2 hours are over, and with them its signed upload, or the
   * place was let go (its tombstone): start again with a new one.
   */
  | "expired"
  /** Ten PDFs unsent from the last day (`CHAT_PDFS_WAITING_MAX`): later. */
  | "tooMany"
  /**
   * The business's PDFs of the last 10 minutes already bring its space
   * (`CHAT_PDF_BURST_MINUTES`): in a few minutes.
   */
  | "busy";

export type ChatPdfWrite<T> =
  | { ok: true; value: T }
  | { ok: false; failure: ChatPdfFailure };

const refusedPdf = (failure: ChatPdfFailure) =>
  ({ ok: false, failure }) as const;

/** `at_time` for a write, when the caller says when it happened. */
const atTime = (at?: Date) => (at ? { at_time: at.toISOString() } : {});

/** Where a file goes, as the database takes it: a conversation, or a person. */
function targetOf(
  input: ChatTarget,
): { conversation: string } | { to_person: string } | null {
  if ("conversation" in input) {
    return isUuid(input.conversation)
      ? { conversation: input.conversation.toLowerCase() }
      : null;
  }
  return isUuid(input.toPerson)
    ? { to_person: input.toPerson.toLowerCase() }
    : null;
}

/**
 * A refusal of a PDF's reservation: the project's Storage full (54000 with
 * hint 'storage'), ten unsent from the last day (hint 'pdfs'), the business's
 * 10 minutes full (hint 'busy'), and a message's reasons for the rest.
 */
function pdfReserveFailureOf(error: {
  code?: string;
  hint?: string | null;
}): ChatPdfFailure {
  if (error.code === "54000" && error.hint === "storage") return "noRoom";
  if (error.code === "54000" && error.hint === "pdfs") return "tooMany";
  if (error.code === "54000" && error.hint === "busy") return "busy";
  return chatFailureOf(error);
}

/**
 * Lets a PDF's place go while its signed upload may still be good: the
 * server's 1-byte tombstone replaces whatever is there (`upsert`, with the
 * secret key), so the upload, which writes wherever nothing is, can't write
 * there again. Nobody reads it, and the clean-up removes it a day on. False
 * when Storage refused: what was there stays, read by nobody, until the same
 * clean-up. In chat's bucket, or (C6) in `documents` for a document's PDF
 * whose file the job removes.
 */
export async function occupyPlace(
  path: string,
  bucket: typeof CHAT_FILE_BUCKET | typeof DOCUMENT_BUCKET = CHAT_FILE_BUCKET,
): Promise<boolean> {
  const { error } = await createAdminClient()
    .storage.from(bucket)
    .upload(path, chatPlaceTombstone(), {
      contentType: CHAT_PDF_TYPE,
      upsert: true,
    });
  if (error) {
    console.error("a chat PDF's place was not let go", error.name);
    return false;
  }
  return true;
}

/** A PDF's own path in its business's conversation: a `.pdf`, never a thumbnail's. */
function isPdfPathIn(
  path: string,
  businessId: string,
  conversationId: string,
): boolean {
  const parts = parseChatFilePath(path);
  return (
    parts !== null &&
    parts.extension === "pdf" &&
    !parts.thumb &&
    parts.businessId === businessId &&
    parts.conversationId === conversationId.toLowerCase()
  );
}

/**
 * Whether Storage's signed upload is for this path of the chat-files bucket
 * (or, from C7, of `documents`), on the project the app talks to: what the
 * browser is given, so it can put a file there and nowhere else.
 */
export function isSignedUploadFor(
  signedUrl: string,
  path: string,
  bucket: typeof CHAT_FILE_BUCKET | typeof DOCUMENT_BUCKET = CHAT_FILE_BUCKET,
): boolean {
  let url: URL;
  let base: URL;
  try {
    url = new URL(signedUrl);
    base = new URL(publicEnv().url);
  } catch {
    return false;
  }
  const prefix = base.pathname.replace(/\/+$/, "");
  return (
    url.origin === base.origin &&
    url.pathname ===
      `${prefix}/storage/v1/object/upload/sign/${bucket}/${path}` &&
    (url.searchParams.get("token") ?? "") !== ""
  );
}

/** What `startChatPdf` gives the browser. */
export type ChatPdfStart = {
  /** The reservation, for `finishChatPdf` (or `cancelChatPdf`). */
  upload: string;
  /** Where it goes: a new private chat's id when it opened one. */
  conversation: string;
  /**
   * Storage's signed upload for the PDF's one path, good for 2 hours: the
   * browser PUTs the file's bytes there as they are, with `Content-Type:
   * application/pdf`, and nothing else (no session, no key). Once a file is
   * there, nothing replaces it; once the place is let go, its tombstone is.
   */
  signedUrl: string;
  /** Its name as it is kept and shown (`cleanFileName`). */
  name: string;
  /** Its size in bytes, as the PUT must bring it. */
  size: number;
};

/**
 * Starts sending a PDF (C5), from what the browser says of it: its name
 * (cleaned, ending in `.pdf`) and size (at most 10 MiB), to a conversation or
 * to someone on the staff, whose private chat it opens. `draft` is the
 * browser's own id for the message, checked here and sent with
 * `finishChatPdf`. Reserves its place with the sending's own checks
 * (`public.reserve_chat_upload`, which also refuses an 11th PDF unsent from
 * the last day, and one more once the business's PDFs of the last 10 minutes
 * bring its space), and makes Storage's signed upload for that one path with
 * the secret key (`upsert` off), whose URL is all the browser gets.
 */
export async function startChatPdf(
  actorId: string,
  businessId: string,
  input: ChatTarget & { draft: string; name: string; size: number },
  at?: Date,
): Promise<ChatPdfWrite<ChatPdfStart>> {
  if (!isUuid(input.draft)) return refusedPdf("invalid");
  const target = targetOf(input);
  if (!target) return refusedPdf("noAccess");
  const file = checkChatPdf({ name: input.name, size: input.size });
  if (!file.ok) return refusedPdf(file.problem);

  const allowed = await chatFilesAllowed(businessId);
  if (allowed !== "yes") return refusedPdf(allowed);
  // C4's reservation takes a PDF already; before C5's migration reaches the
  // project nothing could finish one, so nothing is put in Storage for it.
  const finishes = await uploadPlace(actorId, businessId, crypto.randomUUID());
  if (finishes !== null && "failure" in finishes) {
    return refusedPdf(finishes.failure);
  }

  const admin = createAdminClient();
  const reserved = await admin.rpc("reserve_chat_upload", {
    actor: actorId,
    business: businessId,
    upload_kind: "pdf",
    upload_type: CHAT_PDF_TYPE,
    upload_size: file.size,
    upload_name: file.name,
    ...target,
    ...atTime(at),
  });
  if (reserved.error) return refusedPdf(pdfReserveFailureOf(reserved.error));
  const place = reservedSchema.safeParse(reserved.data);
  if (!place.success) return refusedPdf("failed");
  const { upload, path, thumb, conversation } = place.data;
  if (thumb !== null || !isPdfPathIn(path, businessId, conversation)) {
    return refusedPdf("failed");
  }

  const signed = await admin.storage
    .from(CHAT_FILE_BUCKET)
    .createSignedUploadUrl(path, { upsert: false });
  if (signed.error || !signed.data) {
    // The place is let go, so it counts for nothing; the clean-up removes
    // its tombstone a day on.
    console.error("a chat PDF's upload was not signed", signed.error?.name);
    await occupyPlace(path);
    return refusedPdf("failed");
  }
  if (!isSignedUploadFor(signed.data.signedUrl, path)) {
    console.error("a chat PDF's signed upload was not for its place");
    await occupyPlace(path);
    return refusedPdf("failed");
  }
  return {
    ok: true,
    value: {
      upload: upload.toLowerCase(),
      conversation: conversation.toLowerCase(),
      signedUrl: signed.data.signedUrl,
      name: file.name,
      size: file.size,
    },
  };
}

const placeSchema = z.object({
  upload: z.string().refine(isUuid),
  path: z.string(),
  conversation: z.string().refine(isUuid),
  kind: z.enum(["image", "pdf"]),
  used: z.boolean(),
  fresh: z.boolean(),
});

type UploadPlace = Omit<z.infer<typeof placeSchema>, "kind">;

/**
 * The signed-in person's own place for a PDF in the business
 * (`public.chat_upload_place`): where its file is, by the database's word;
 * null for anyone else's, another business's, a picture's, or none.
 */
async function uploadPlace(
  actorId: string,
  businessId: string,
  upload: string,
  at?: Date,
): Promise<UploadPlace | null | { failure: ChatPdfFailure }> {
  const asked = await createAdminClient().rpc("chat_upload_place", {
    actor: actorId,
    business: businessId,
    upload: upload.toLowerCase(),
    ...atTime(at),
  });
  if (asked.error) return { failure: chatFailureOf(asked.error) };
  if (asked.data === null) return null;
  const place = placeSchema.safeParse(asked.data);
  if (!place.success) return { failure: "failed" };
  const { kind, ...found } = place.data;
  // A picture's files are the server's own to put: nothing here.
  if (kind !== "pdf") return null;
  const conversation = found.conversation.toLowerCase();
  if (!isPdfPathIn(found.path, businessId, conversation)) {
    return { failure: "failed" };
  }
  return { ...found, conversation };
}

/**
 * The first KB of a stored chat file, read with the secret key: a
 * short-lived signed link for it, asked with `Range: bytes=0-1023`. When
 * Storage doesn't honour the range and sends the whole file, only its first
 * KB is read and the rest of the transfer is cancelled, so at most what was
 * already on its way (never more than the 10 MiB the bucket holds) is spent.
 * "missing" when Storage holds no such file, "unreadable" when it can't be
 * asked now. Chat's bucket only: a document's file is never read through a
 * signed link, not even the server's (@db/documents reads a document's PDF
 * with the secret key's own download).
 */
export async function storedHead(
  path: string,
): Promise<Uint8Array | "missing" | "unreadable"> {
  const signed = await createAdminClient()
    .storage.from(CHAT_FILE_BUCKET)
    .createSignedUrl(path, 60);
  if (signed.error || !signed.data?.signedUrl) {
    const error = signed.error;
    const notFound =
      !error ||
      error.status === 404 ||
      error.statusCode === "404" ||
      ("code" in error && error.code === "NoSuchKey");
    return notFound ? "missing" : "unreadable";
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(signed.data.signedUrl, {
      headers: { Range: `bytes=0-${CHAT_PDF_HEAD_BYTES - 1}` },
      cache: "no-store",
      signal: controller.signal,
    });
    if (response.status === 404 || response.status === 400) return "missing";
    if (
      (response.status !== 200 && response.status !== 206) ||
      !response.body
    ) {
      await response.body?.cancel().catch(() => undefined);
      return "unreadable";
    }
    // Logged each time, with nothing of the file: whether Storage honours
    // the range is what the plan left to check (§6.3), and the server's log
    // (CI's e2e job, Vercel's) shows it.
    if (response.status === 200) {
      console.warn("chat PDFs: Storage sent a whole file for its first KB");
    }
    const start = await readAtLeast(response.body, CHAT_PDF_HEAD_BYTES);
    await start.reader.cancel().catch(() => undefined);
    return start.bytes.slice(0, CHAT_PDF_HEAD_BYTES);
  } catch {
    return "unreadable";
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

/**
 * Sends a PDF the browser put at its place (C5), with words or none, under
 * the same `draft` as on screen: a retry gives back the same message. The
 * place is the signed-in person's own (`public.chat_upload_place`, so the file
 * read is the reservation's, never one the browser names), within its 2
 * hours. Its first KB is read with the secret key and must be a PDF's
 * (`isPdf`), and `public.send_chat_message` checks its size and type in
 * Storage before the message is written. On any refusal the file is let go at
 * once (its tombstone replaces it), unless a message holds it by then, and a
 * later try of the same place is told to start again ("expired"); when the
 * sending's end is unknown (its answer lost), it stays, for the message that
 * may hold it or the clean-up a day on. Returns where it went and the message.
 */
export async function finishChatPdf(
  actorId: string,
  businessId: string,
  input: { upload: string; draft: string; words?: string },
  at?: Date,
): Promise<ChatPdfWrite<{ conversation: string; message: string }>> {
  if (!isUuid(input.upload) || !isUuid(input.draft)) {
    return refusedPdf("invalid");
  }
  const typed = input.words?.trim() ? checkMessage(input.words) : null;
  if (typed && !typed.ok) return refusedPdf("invalid");

  const allowed = await chatFilesAllowed(businessId);
  if (allowed !== "yes") return refusedPdf(allowed);

  const place = await uploadPlace(actorId, businessId, input.upload, at);
  if (place === null) return refusedPdf("noAccess");
  if ("failure" in place) return refusedPdf(place.failure);

  const admin = createAdminClient();
  const send = () =>
    admin.rpc("send_chat_message", {
      actor: actorId,
      business: businessId,
      draft: input.draft.toLowerCase(),
      ...(typed?.ok ? { words: typed.body } : {}),
      conversation: place.conversation,
      upload: place.upload.toLowerCase(),
      ...atTime(at),
    });
  const sentAs = (
    data: unknown,
  ): ChatPdfWrite<{
    conversation: string;
    message: string;
  }> => {
    const message = sentSchema.safeParse(data);
    return message.success
      ? {
          ok: true,
          value: {
            conversation: message.data.conversation,
            message: message.data.message,
          },
        }
      : refusedPdf("failed");
  };
  // The place is let go (its tombstone replaces the file) unless a message
  // holds it by now (another call of the same sending, a moment ahead): when
  // that can't be told, the file stays for the clean-up a day on.
  const letGoUnlessSent = async () => {
    const now = await uploadPlace(actorId, businessId, place.upload);
    if (now === null || "failure" in now || now.used) return;
    await occupyPlace(now.path);
  };

  if (place.used) {
    // Sent already, and its answer lost: the same draft gives back its
    // message. Its file is that message's, and stays whatever this says.
    const again = await send();
    if (again.error) return refusedPdf(chatFailureOf(again.error));
    return sentAs(again.data);
  }
  if (!place.fresh) {
    await letGoUnlessSent();
    return refusedPdf("expired");
  }

  const head = await storedHead(place.path);
  if (head === "missing") return refusedPdf("notUploaded");
  if (head === "unreadable") return refusedPdf("failed");
  // Let go already (a refusal before this try): a new place, a new upload.
  if (isPlaceTombstone(head)) return refusedPdf("expired");
  if (!isPdf(head)) {
    await letGoUnlessSent();
    return refusedPdf("notPdf");
  }

  const sent = await send();
  if (sent.error) {
    // The database said no (a SQLSTATE): nothing holds the file. Without
    // one, the message may have been written with it: it stays.
    if (!sent.error.code) {
      console.error("a chat PDF's sending ended unknown");
      return refusedPdf("failed");
    }
    await letGoUnlessSent();
    return refusedPdf(
      sent.error.code === "55000" &&
        (await chatFilesAllowed(businessId)) === "demo"
        ? "demo"
        : chatFailureOf(sent.error),
    );
  }
  const message = sentSchema.safeParse(sent.data);
  // Written, but not read back as itself: the file stays with the message.
  if (!message.success) return refusedPdf("failed");
  // The draft went already with another file: this one is nobody's.
  if (message.data.attached === false) await letGoUnlessSent();
  return sentAs(sent.data);
}

/**
 * The person stopped sending a PDF (C5): its place is let go at once, unless
 * it was sent (its tombstone replaces whatever the browser put there, so its
 * signed upload can't write there any more). Says whether it was sent
 * (`sent`): then its message is there, and the stop changed nothing. Nothing
 * for anyone else's place, the same answer as for one's own not sent. The
 * place itself stays, holding nothing, until the clean-up lets it go a day
 * on; it counts for none of the ten a day.
 */
export async function cancelChatPdf(
  actorId: string,
  businessId: string,
  upload: string,
): Promise<ChatPdfWrite<{ sent: boolean }>> {
  if (!isUuid(upload)) return refusedPdf("invalid");
  const place = await uploadPlace(actorId, businessId, upload);
  if (place === null) return { ok: true, value: { sent: false } };
  if ("failure" in place) return refusedPdf(place.failure);
  if (place.used) return { ok: true, value: { sent: true } };
  if (!(await occupyPlace(place.path))) return refusedPdf("failed");
  return { ok: true, value: { sent: false } };
}

/**
 * A chat PDF as the signed-in person may download it, for the /chat-files
 * route: its message read under their own session (RLS: a message they read,
 * so a private chat's PDF for its two people alone), a PDF's, not removed and
 * its file still kept, pointing at the path, and the file downloaded under the
 * same session, so the bucket's policy decides too. Its first KB must be a
 * PDF's (`isPdf`): the type always comes from its bytes, and must be the
 * path's and the message's. The file is streamed on as Storage sends it (up to
 * 10 MiB, never held whole), with the name kept for it. Null for anything
 * else, the same whether or not a file is there.
 */
export async function chatPdfDownload(
  path: string,
): Promise<{ body: ReadableStream<Uint8Array>; name: string | null } | null> {
  const parts = parseChatFilePath(path);
  if (parts?.extension !== "pdf" || parts.thumb) return null;
  const supabase = await createClient();
  const [row, file] = await Promise.all([
    supabase
      .from("chat_messages")
      .select("file_kind, file_path, file_name, file_removed_at, removed_at")
      .eq("business_id", parts.businessId)
      .eq("conversation_id", parts.conversationId)
      .eq("file_path", path)
      .maybeSingle(),
    supabase.storage.from(CHAT_FILE_BUCKET).download(path).asStream(),
  ]);
  const stream = (file.data ?? null) as ReadableStream<Uint8Array> | null;
  const message = row.data;
  if (
    row.error ||
    !message ||
    !stream ||
    message.file_kind !== "pdf" ||
    message.removed_at !== null ||
    message.file_removed_at !== null ||
    message.file_path !== path
  ) {
    await stream?.cancel().catch(() => undefined);
    return null;
  }
  const start = await readAtLeast(stream, CHAT_PDF_HEAD_BYTES);
  if (!isPdf(start.bytes)) {
    await start.reader.cancel().catch(() => undefined);
    return null;
  }
  return { body: withStart(start), name: message.file_name };
}

/**
 * A chat file's bytes as the signed-in person may read them, for the
 * /chat-files route: its message read under their own session (RLS: a message
 * they read, so a private chat's files for its two people alone), not removed
 * and its file still kept, pointing at the path, and the file downloaded under
 * the same session, so the bucket's policy decides too. Its type comes from
 * its bytes and must be the path's and the message's (a picture; a PDF is
 * `chatPdfDownload`'s). Null for anything else, the same whether or not a
 * file is there.
 */
export async function chatFileBytes(
  path: string,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; type: ChatImageType } | null> {
  const parts = parseChatFilePath(path);
  if (!parts) return null;
  const wanted = chatImageTypeOf(parts.extension);
  // A PDF is a download of its own (`chatPdfDownload`).
  if (!wanted) return null;
  const supabase = await createClient();
  const [row, file] = await Promise.all([
    supabase
      .from("chat_messages")
      .select("file_kind, file_path, thumb_path, file_removed_at, removed_at")
      .eq("business_id", parts.businessId)
      .eq("conversation_id", parts.conversationId)
      .or(`file_path.eq."${path}",thumb_path.eq."${path}"`)
      .maybeSingle(),
    supabase.storage.from(CHAT_FILE_BUCKET).download(path),
  ]);
  if (row.error || !row.data || file.error || !file.data) return null;
  const message = row.data;
  if (
    message.file_kind !== "image" ||
    message.removed_at !== null ||
    message.file_removed_at !== null ||
    (parts.thumb ? message.thumb_path : message.file_path) !== path
  ) {
    return null;
  }
  const bytes = new Uint8Array(await file.data.arrayBuffer());
  return sniffPhotoType(bytes) === wanted ? { bytes, type: wanted } : null;
}

/** A conversation's picture, for its details: the newest first. */
export type ChatPicture = {
  id: string;
  authorId: string | null;
  /** ISO instant. */
  createdAt: string;
  /** What was written with it, if anything. */
  body: string | null;
  /** The whole picture and its thumbnail (`chatFileSrc`). */
  fileSrc: string;
  thumbSrc: string;
};

/** How many of a conversation's pictures its details show. */
export const CHAT_PICTURES_SHOWN = 12;

/**
 * A conversation's latest pictures still kept, newest first, for its details
 * (C4): read under the signed-in person's own session (RLS: a conversation
 * they read, from when they read it), so a private chat's pictures are its two
 * people's alone. A removed message's picture, and one no longer kept, isn't
 * among them. Empty before the files reach the project.
 */
export async function getConversationPictures(
  businessId: string,
  conversationId: string,
  limit = CHAT_PICTURES_SHOWN,
): Promise<ChatPicture[]> {
  if (!isUuid(businessId) || !isUuid(conversationId)) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, author_id, body, created_at, file_path, thumb_path")
    .eq("business_id", businessId)
    .eq("conversation_id", conversationId.toLowerCase())
    .eq("file_kind", "image")
    .is("file_removed_at", null)
    .is("removed_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 50));
  if (error) {
    if (isMissingColumn(error)) return [];
    throw error;
  }
  return (data ?? []).flatMap((row) => {
    const fileSrc = chatFileSrc(row.file_path);
    const thumbSrc = chatFileSrc(row.thumb_path);
    return fileSrc && thumbSrc
      ? [
          {
            id: row.id,
            authorId: row.author_id,
            createdAt: row.created_at,
            body: row.body,
            fileSrc,
            thumbSrc,
          },
        ]
      : [];
  });
}

/** A conversation's PDF, for its details: the newest first. */
export type ChatPdf = {
  id: string;
  authorId: string | null;
  /** ISO instant. */
  createdAt: string;
  /** What was written with it, if anything. */
  body: string | null;
  /** Its name as kept (`cleanFileName`); null when none was. */
  name: string | null;
  /** In bytes. */
  size: number | null;
  /** Its download (`chatFileSrc`, the app's own route). */
  fileSrc: string;
};

/** How many of a conversation's PDFs its details show. */
export const CHAT_PDFS_SHOWN = 12;

/**
 * A conversation's latest PDFs still kept, newest first, for its details
 * (C5), as `getConversationPictures` reads its pictures: under the signed-in
 * person's own session (RLS: a conversation they read, from when they read
 * it), so a private chat's PDFs are its two people's alone; never a removed
 * message's, nor one no longer kept. Empty before the files reach the
 * project.
 */
export async function getConversationPdfs(
  businessId: string,
  conversationId: string,
  limit = CHAT_PDFS_SHOWN,
): Promise<ChatPdf[]> {
  if (!isUuid(businessId) || !isUuid(conversationId)) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, author_id, body, created_at, file_path, file_name, file_size")
    .eq("business_id", businessId)
    .eq("conversation_id", conversationId.toLowerCase())
    .eq("file_kind", "pdf")
    .is("file_removed_at", null)
    .is("removed_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 50));
  if (error) {
    if (isMissingColumn(error)) return [];
    throw error;
  }
  return (data ?? []).flatMap((row) => {
    const fileSrc = chatFileSrc(row.file_path);
    return fileSrc
      ? [
          {
            id: row.id,
            authorId: row.author_id,
            createdAt: row.created_at,
            body: row.body,
            name: row.file_name,
            size: row.file_size,
            fileSrc,
          },
        ]
      : [];
  });
}

/** How many files one clean-up removes at most, a batch at a time. */
const CLEAN_BATCH = 500;
const CLEAN_BATCHES = 20;

/** A PDF's path in either bucket's shape: chat's or (C6) a document's. */
function isPdfPath(path: string): boolean {
  return (
    parseChatFilePath(path)?.extension === "pdf" ||
    parseDocumentFilePath(path)?.extension === "pdf"
  );
}

/**
 * Of these files, the PDFs whose signed upload may still be good
 * (`public.chat_paths_signed`: a place reserved less than 2 hours and 5
 * minutes ago, a chat file's or, from C6, a document's): the clean-up lets
 * them go with a tombstone rather than leaving their path empty, where that
 * upload could write again. None before the migration reaches the project:
 * no PDF could be sent there.
 */
async function signedPaths(
  paths: string[],
  when: { at_time?: string },
): Promise<Set<string>> {
  if (!paths.some(isPdfPath)) return new Set();
  const { data, error } = await createAdminClient().rpc("chat_paths_signed", {
    paths,
    ...when,
  });
  if (error) {
    if (isMissingFunction(error)) return new Set();
    throw error;
  }
  return new Set(data ?? []);
}

/**
 * The chat job's clean-up (`/cron/chat-files`): the files due to go
 * (`public.expired_files`: past their days, the oldest past a business's
 * space, removed messages' after their undo, reservations never sent, what
 * nothing points at, and from C6 a removed document's file once its undo is
 * over, with the `documents` bucket's own places and orphans) are removed
 * from Storage, a bucket at a time, each from its own bucket, and marked
 * (`public.forget_files`, which clears a document's path and keeps its row), a
 * batch at a time. A PDF whose signed upload may
 * still be good is let go with the server's tombstone instead of removed, so
 * that upload can't write its path again (`signedPaths`); the tombstone goes
 * a day on, with what nothing points at. Returns how many went. A batch
 * Storage refuses stops it; the rest wait for the next run, 10 minutes on.
 */
export async function cleanChatFiles(at?: Date): Promise<number> {
  const admin = createAdminClient();
  const when = at ? { at_time: at.toISOString() } : {};
  let removed = 0;
  for (let batch = 0; batch < CLEAN_BATCHES; batch += 1) {
    const { data, error } = await admin.rpc("expired_files", {
      max_rows: CLEAN_BATCH,
      ...when,
    });
    if (error) {
      if (isMissingFunction(error)) return removed;
      throw error;
    }
    const rows = data ?? [];
    if (rows.length === 0) return removed;
    // Only files in the app's own shape are asked of Storage, each bucket's
    // in its own shape, a bucket at a time; every path listed is marked, so
    // none is listed again. A document's file left in Storage once its path
    // was cleared would be listed every run as nothing's, so it goes from
    // its own bucket as a chat file does.
    const byBucket = new Map<
      typeof CHAT_FILE_BUCKET | typeof DOCUMENT_BUCKET,
      string[]
    >();
    for (const row of rows) {
      const bucket =
        row.bucket === CHAT_FILE_BUCKET && isChatFilePath(row.path)
          ? CHAT_FILE_BUCKET
          : row.bucket === DOCUMENT_BUCKET && isDocumentFilePath(row.path)
            ? DOCUMENT_BUCKET
            : null;
      if (!bucket) continue;
      byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), row.path]);
    }
    for (const [bucket, paths] of byBucket) {
      const signed = await signedPaths(paths, when);
      for (const path of paths) {
        // Storage said no: this batch waits for the next run, unmarked.
        if (signed.has(path) && !(await occupyPlace(path, bucket))) {
          return removed;
        }
      }
      const unsigned = paths.filter((path) => !signed.has(path));
      if (unsigned.length > 0) {
        const gone = await admin.storage.from(bucket).remove(unsigned);
        if (gone.error) {
          console.error("chat files stayed", gone.error.name);
          return removed;
        }
      }
      removed += paths.length;
    }
    const marked = await admin.rpc("forget_files", {
      paths: rows.map((row) => row.path),
      ...when,
    });
    if (marked.error) throw marked.error;
    if (rows.length < CLEAN_BATCH) return removed;
  }
  return removed;
}

const count = z.number().int().nonnegative();

const storageSchema = z.object({
  database_bytes: count,
  storage_bytes: count,
  guard_bytes: count,
  buckets: z.array(
    z.object({ bucket: z.string(), bytes: count, files: count }),
  ),
  businesses: z.array(
    z.object({
      business: z.string().refine(isUuid),
      slug: z.string(),
      name: z.string(),
      chat_bytes: count,
      files_open: z.boolean(),
      chat_cap_bytes: count,
      document_cap_bytes: count,
    }),
  ),
  chat_caps_bytes: count,
  document_caps_bytes: count,
});

/** How full the project is, for the console's storage card. Sizes only. */
export type StorageUse = {
  /** The database, as `pg_database_size` says. */
  databaseBytes: number;
  /** Every bucket together. */
  storageBytes: number;
  /** Past this, no new chat file is taken (900 MB). */
  guardBytes: number;
  buckets: { bucket: string; bytes: number; files: number }[];
  businesses: {
    id: string;
    slug: string;
    name: string;
    /** What its chat files hold now. */
    chatBytes: number;
    /** Chat is on there and files are taken (not a closed demo). */
    filesOpen: boolean;
    /** Its `fileSpaceMb` and (C6) `documentSpaceMb`, in bytes; 0 where files aren't taken. */
    chatCapBytes: number;
    documentCapBytes: number;
  }[];
  /** The caps added up: they must stay under the free plan's 1 GB with the rest. */
  chatCapsBytes: number;
  documentCapsBytes: number;
};

/**
 * The console's storage card (`public.admin_storage`, under the person's own
 * session): the database's size, Storage per bucket, each business's chat
 * space beside its caps, and the caps' sum. Never a file, conversation or
 * person. The function refuses anyone off the ConceptApp team; callers check
 * `getPlatformRole` first. Null, and the card hidden, before the migration
 * reaches the project or when it can't be read: the card is an extra, and the
 * console's list beside it still opens (only the error's code is logged).
 */
export async function getStorageUse(): Promise<StorageUse | null> {
  const unread = (code: unknown) => {
    console.error("the storage card could not be read", String(code));
    return null;
  };
  let answer: { data: unknown; error: { code?: string } | null };
  try {
    const supabase = await createClient();
    answer = await supabase.rpc("admin_storage");
  } catch (error) {
    return unread(
      error && typeof error === "object" && "code" in error
        ? error.code
        : "without a code",
    );
  }
  if (answer.error) {
    return isMissingFunction(answer.error) ? null : unread(answer.error.code);
  }
  const parsed = storageSchema.safeParse(answer.data);
  if (!parsed.success) return unread("a shape it doesn't know");
  const use = parsed.data;
  return {
    databaseBytes: use.database_bytes,
    storageBytes: use.storage_bytes,
    guardBytes: use.guard_bytes,
    buckets: use.buckets,
    businesses: use.businesses.map((row) => ({
      id: row.business,
      slug: row.slug,
      name: row.name,
      chatBytes: row.chat_bytes,
      filesOpen: row.files_open,
      chatCapBytes: row.chat_cap_bytes,
      documentCapBytes: row.document_cap_bytes,
    })),
    chatCapsBytes: use.chat_caps_bytes,
    documentCapsBytes: use.document_caps_bytes,
  };
}
