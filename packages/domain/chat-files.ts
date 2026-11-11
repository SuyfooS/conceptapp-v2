import {
  checkStillPhoto,
  LIST_PHOTO_PIXELS,
  LIST_PHOTO_TARGET_BYTES,
  type ListPhotoCheck,
} from "./list-photos";
import type { PhotoProblem } from "./profile-photos";

/**
 * Files in chat (C4 of the chat plan; Orel's numbers on issue #1): a picture
 * is re-encoded on the phone (`encodeChatImage` in @ui/photo-encode: upright,
 * at most 1280 px, about 0.3 MB and never over 400 KB, nothing the camera
 * wrote into the file), with a thumbnail of 360 px (at most 48 KB) that the
 * conversation shows, so the full picture is fetched only when it is opened.
 * The server checks both again here and stores them in the private bucket
 * `chat-files` at `<business>/<conversation>/<32 hex>.<webp|jpg>` and
 * `…-s.<webp|jpg>` (supabase/migrations/20261111000500_chat_files.sql), read
 * back through `/chat-files/…` by those who read the message only. A file is
 * kept `fileDays` days (90, Orel's number), and when a business passes its
 * `fileSpaceMb` (100) its oldest go first, even before (Orel, 11 November
 * 2026); the message stays and says its file is no longer kept. PDFs come in
 * C5, at most 10 MiB, always served as a download.
 */

export const CHAT_FILE_BUCKET = "chat-files";

/** The longest side a picture is stored at, as a list's photo. */
export const CHAT_IMAGE_PIXELS = LIST_PHOTO_PIXELS;
/** What the browser aims a picture at. */
export const CHAT_IMAGE_TARGET_BYTES = LIST_PHOTO_TARGET_BYTES;
/** Larger than this, the server and the database refuse a picture. */
export const CHAT_IMAGE_MAX_BYTES = 400 * 1024;

/** The longest side of a picture's thumbnail, what the conversation shows. */
export const CHAT_THUMB_PIXELS = 360;
/** The thumbnail's quality, as the browser encodes it first. */
export const CHAT_THUMB_QUALITY = 0.6;
/** Larger than this, the server and the database refuse a thumbnail. */
export const CHAT_THUMB_MAX_BYTES = 48 * 1024;

/**
 * The encodings the browser tries for a thumbnail, in order, until one is at
 * most `CHAT_THUMB_MAX_BYTES`: a 360 px picture at 0.6 is about 15 to 30 KB.
 */
export const CHAT_THUMB_STEPS: readonly { pixels: number; quality: number }[] =
  [
    { pixels: CHAT_THUMB_PIXELS, quality: CHAT_THUMB_QUALITY },
    { pixels: CHAT_THUMB_PIXELS, quality: 0.45 },
    { pixels: 280, quality: 0.45 },
  ];

/**
 * What to do after the thumbnail's encodings tried so far (their sizes, in
 * the order of `CHAT_THUMB_STEPS`): keep the first one at most
 * `CHAT_THUMB_MAX_BYTES`, else try the next step while there is one, and
 * "tooBig" when even the last is over it.
 */
export function chatThumbVerdict(
  sizes: readonly number[],
): { keep: number } | "next" | "tooBig" {
  const last = sizes.length - 1;
  const size = sizes[last];
  if (size === undefined) return "next";
  if (size <= CHAT_THUMB_MAX_BYTES) return { keep: last };
  return sizes.length < CHAT_THUMB_STEPS.length ? "next" : "tooBig";
}

/** A PDF's limit (C5): Orel's 10 MB. */
export const CHAT_PDF_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Past this much in Storage, across the project, no new chat file is taken
 * (private.files_guard_bytes): 900 MB of the free plan's 1 GB, which every
 * business shares. The message itself can still be sent.
 */
export const FILES_GUARD_BYTES = 900 * 1024 * 1024;
/** The free plan's Storage, for the console's card. */
export const STORAGE_PLAN_BYTES = 1024 * 1024 * 1024;

/** A reservation is good for this long (Storage's signed upload, C5). */
export const CHAT_UPLOAD_HOURS = 2;

/** How long a business keeps its chat files, in days (a setting for the team). */
export const CHAT_FILE_DAYS = [30, 90, 180] as const;
export const DEFAULT_CHAT_FILE_DAYS = 90;
/** A business's space for chat files, in MB (a setting for the team). */
export const CHAT_FILE_SPACE_MB = [50, 100, 200] as const;
export const DEFAULT_CHAT_FILE_SPACE_MB = 100;

/** A file's name, at most (a PDF's, C5), as the database keeps it. */
export const CHAT_FILE_NAME_MAX = 120;

export const CHAT_IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;
export type ChatImageType = keyof typeof CHAT_IMAGE_TYPES;
export type ChatImageExtension = (typeof CHAT_IMAGE_TYPES)[ChatImageType];
export type ChatFileExtension = ChatImageExtension | "pdf";

/** Why the server refused a picture or its thumbnail: profile photos' reasons. */
export type ChatImageProblem = PhotoProblem;

/**
 * Whether a file can be a chat picture, and what it is: a JPEG or WebP by its
 * bytes (and as the browser says), at most 400 KB, nothing from the camera
 * inside (EXIF, XMP), still, its longest side at most 1280 px. A list photo's
 * checks with chat's sizes: anything else didn't come from the app's own
 * re-encoding.
 */
export function checkChatImage(file: {
  type: string;
  size: number;
  bytes: Uint8Array;
}): ListPhotoCheck {
  return checkStillPhoto(file, {
    maxBytes: CHAT_IMAGE_MAX_BYTES,
    maxPixels: CHAT_IMAGE_PIXELS,
  });
}

/** The same for its thumbnail: at most 48 KB and 360 px. */
export function checkChatThumb(file: {
  type: string;
  size: number;
  bytes: Uint8Array;
}): ListPhotoCheck {
  return checkStillPhoto(file, {
    maxBytes: CHAT_THUMB_MAX_BYTES,
    maxPixels: CHAT_THUMB_PIXELS,
  });
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const KEY = "[0-9a-f]{32}";
const FILE = new RegExp(`^${KEY}(?:-s)?\\.(?:webp|jpg|pdf)$`);
const PATH = new RegExp(`^(${UUID})/(${UUID})/(${KEY})(-s)?\\.(webp|jpg|pdf)$`);

/** A chat file's name inside its conversation's folder: a key, maybe `-s`, a type. */
export function isChatFileName(file: string): boolean {
  return FILE.test(file);
}

/**
 * Where a chat file goes: `<business>/<conversation>/<key>.<ext>`, or its
 * thumbnail's `…-s.<ext>`. The database makes these (public.reserve_chat_upload,
 * with a random key, so a new file gets a new link); this is its rule.
 */
export function chatFilePath(
  businessId: string,
  conversationId: string,
  key: string,
  extension: ChatFileExtension,
  thumb = false,
): string {
  return `${businessId}/${conversationId}/${key}${thumb ? "-s" : ""}.${extension}`;
}

/** A chat file's path, read: its business, conversation, key and type. */
export type ChatFilePath = {
  businessId: string;
  conversationId: string;
  key: string;
  thumb: boolean;
  extension: ChatFileExtension;
};

/** The path's parts, or null for anything not in the database's shape. */
export function parseChatFilePath(path: string): ChatFilePath | null {
  const match = PATH.exec(path);
  if (!match) return null;
  const [, businessId = "", conversationId = "", key = "", thumb, extension] =
    match;
  if (extension !== "webp" && extension !== "jpg" && extension !== "pdf") {
    return null;
  }
  return { businessId, conversationId, key, thumb: thumb === "-s", extension };
}

/**
 * The database's rule (`private.can_read_chat_file`, and the paths
 * public.reserve_chat_upload makes): `<business>/<conversation>/<32 hex>
 * [-s].<webp|jpg|pdf>`, lower case, and, when `where` is given, in that
 * business's conversation.
 */
export function isChatFilePath(
  path: string,
  where?: { businessId: string; conversationId: string },
): boolean {
  const parts = parseChatFilePath(path);
  if (!parts) return false;
  return where
    ? parts.businessId === where.businessId &&
        parts.conversationId === where.conversationId
    : true;
}

/** The picture type a stored file's extension stands for, or null (a PDF). */
export function chatImageTypeOf(
  extension: ChatFileExtension,
): ChatImageType | null {
  if (extension === "webp") return "image/webp";
  if (extension === "jpg") return "image/jpeg";
  return null;
}

/** Where the app shows a stored chat file: its own route, which checks who asks. */
export function chatFileSrc(path: string | null | undefined): string | null {
  return path && isChatFilePath(path) ? `/chat-files/${path}` : null;
}

/** Whether `src` is one `chatFileSrc` made: what a sync answer may carry. */
export function isChatFileSrc(src: string): boolean {
  return (
    src.startsWith("/chat-files/") &&
    isChatFilePath(src.slice("/chat-files/".length))
  );
}

/**
 * The characters a file's name never keeps, by code point: control characters
 * (C0, DEL, C1), the soft hyphen, the marks that turn text around (which could
 * make "fdp.exe" read as "exe.pdf": the Arabic letter mark, the left-to-right
 * and right-to-left marks, embeddings, overrides and isolates), zero-width
 * characters and joiners, line and paragraph separators, invisible operators,
 * the byte order mark and the interlinear annotations. Folders and the double
 * quote go too (`keepsInName`).
 */
const UNSAFE_SPANS: readonly (readonly [number, number])[] = [
  [0x0000, 0x001f],
  [0x007f, 0x009f],
  [0x00ad, 0x00ad],
  [0x061c, 0x061c],
  [0x180e, 0x180e],
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x206f],
  [0xfeff, 0xfeff],
  [0xfff9, 0xfffb],
];

/** Whether one character (a code point) may stay in a file's name. */
function keepsInName(char: string): boolean {
  if (char === "/" || char === "\\" || char === '"') return false;
  const code = char.codePointAt(0) ?? 0;
  return !UNSAFE_SPANS.some(([from, to]) => code >= from && code <= to);
}

/**
 * A file's name as chat keeps and shows it (a PDF's, C5): no control,
 * direction or zero-width characters, no folder, no double quote, its spaces
 * run together, no dots or spaces at its ends but its extension's, and at
 * most 120 characters with its extension kept. Null when nothing is left.
 */
export function cleanFileName(name: string): string | null {
  const flat = [...name.normalize("NFC")]
    .map((char) => (keepsInName(char) ? char : " "))
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s]+/, "")
    .replace(/[.\s]+$/, "");
  if (!flat) return null;
  const chars = [...flat];
  if (chars.length <= CHAT_FILE_NAME_MAX) return flat;
  const dot = flat.lastIndexOf(".");
  const extension = dot > 0 ? [...flat.slice(dot)] : [];
  if (extension.length === 0 || extension.length > 16) {
    return chars.slice(0, CHAT_FILE_NAME_MAX).join("").trimEnd();
  }
  const base = [...flat.slice(0, dot)]
    .slice(0, CHAT_FILE_NAME_MAX - extension.length)
    .join("")
    .trimEnd();
  return `${base}${extension.join("")}`;
}

/**
 * RFC 5987's encoding of a header parameter's value (`filename*`): UTF-8,
 * every byte outside its attr-chars percent-encoded, so no quote, CR, LF,
 * semicolon or space reaches the header.
 */
export function rfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

const ASCII_FALLBACK = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * The `Content-Disposition` a stored file is served with (C5's PDFs are a
 * download, `attachment`): an ASCII name for old browsers (`fallback`, the
 * app's own word, never the person's), and the cleaned name in UTF-8 for the
 * rest (RFC 5987, RFC 6266). A name that cleans to nothing gives the fallback
 * alone.
 */
export function contentDisposition(
  name: string | null,
  options: {
    disposition?: "attachment" | "inline";
    fallback?: string;
  } = {},
): string {
  const disposition = options.disposition ?? "attachment";
  const fallback =
    options.fallback && ASCII_FALLBACK.test(options.fallback)
      ? options.fallback
      : "document.pdf";
  const clean = name === null ? null : cleanFileName(name);
  const base = `${disposition}; filename="${fallback}"`;
  return clean ? `${base}; filename*=UTF-8''${rfc5987(clean)}` : base;
}
