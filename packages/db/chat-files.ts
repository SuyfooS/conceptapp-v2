import "server-only";
import { isUuid } from "@domain/activity";
import { checkMessage } from "@domain/chat";
import {
  CHAT_FILE_BUCKET,
  type ChatImageProblem,
  type ChatImageType,
  chatFileSrc,
  chatImageTypeOf,
  checkChatImage,
  checkChatThumb,
  isChatFilePath,
  parseChatFilePath,
} from "@domain/chat-files";
import { sniffPhotoType } from "@domain/profile-photos";
import { z } from "zod";
import { type ChatFailure, type ChatTarget, chatFailureOf } from "./chat";
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
 * A chat file's bytes as the signed-in person may read them, for the
 * /chat-files route: its message read under their own session (RLS: a message
 * they read, so a private chat's files for its two people alone), not removed
 * and its file still kept, pointing at the path, and the file downloaded under
 * the same session, so the bucket's policy decides too. Its type comes from
 * its bytes and must be the path's and the message's (a picture, in C4). Null
 * for anything else, the same whether or not a file is there.
 */
export async function chatFileBytes(
  path: string,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; type: ChatImageType } | null> {
  const parts = parseChatFilePath(path);
  if (!parts) return null;
  const wanted = chatImageTypeOf(parts.extension);
  // PDFs come with C5, always as a download.
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

/** How many files one clean-up removes at most, a batch at a time. */
const CLEAN_BATCH = 500;
const CLEAN_BATCHES = 20;

/**
 * The chat job's clean-up (`/cron/chat-files`): the files due to go
 * (`public.expired_files`: past their days, the oldest past a business's
 * space, removed messages' after their undo, reservations never sent, what
 * nothing points at) are removed from Storage, a bucket at a time, and marked
 * (`public.forget_files`), a batch at a time. Returns how many went. A batch
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
    // Only files in the app's own shape are asked of Storage, a bucket at a
    // time; every path listed is marked, so none is listed again.
    const byBucket = new Map<string, string[]>();
    for (const row of rows) {
      if (row.bucket !== CHAT_FILE_BUCKET || !isChatFilePath(row.path))
        continue;
      byBucket.set(row.bucket, [...(byBucket.get(row.bucket) ?? []), row.path]);
    }
    for (const [bucket, paths] of byBucket) {
      const gone = await admin.storage.from(bucket).remove(paths);
      if (gone.error) {
        console.error("chat files stayed", gone.error.name);
        return removed;
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
