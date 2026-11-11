import { z } from "zod";
import { isUuid } from "./activity";
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
 * 2026); the message stays and says its file is no longer kept.
 *
 * A PDF (C5), at most 10 MiB, is too large to pass through the server (Vercel
 * refuses bodies over 4.5 MB): the server reserves its place
 * (`<business>/<conversation>/<32 hex>.pdf`) and gives the browser a signed
 * upload for that one path, the browser PUTs the file there, and the server
 * reads its first KB (`isPdf`) before the database checks its size and type in
 * Storage and sends it. It is always served as a download
 * (`chatPdfDisposition`), never shown inside the app.
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

/** A PDF's type, as the browser puts it in Storage and the route serves it. */
export const CHAT_PDF_TYPE = "application/pdf";

/**
 * How much of a PDF the server reads to know it is one (C5): the first KB,
 * with a ranged request on finishing, and from the reader's download before
 * serving it. `isPdf` looks at its start.
 */
export const CHAT_PDF_HEAD_BYTES = 1024;

/**
 * PDF places a person may hold unsent from the last day
 * (public.reserve_chat_upload, 54000 with hint 'pdfs'): the browser writes a
 * PDF's bytes itself, through its signed upload, so whatever it put there and
 * never sent waits for the clean-up a day on. Ten keeps that under 100 MiB a
 * person. Only a place that holds a file, or may still be given one, counts:
 * a PDF sent no longer does, nor a place let go (its tombstone), nor one whose
 * signed upload is over with nothing in it.
 */
export const CHAT_PDFS_WAITING_MAX = 10;

/**
 * A business's PDFs reserved in this many minutes, sent or not, bring at most
 * its space (`fileSpaceMb`; public.reserve_chat_upload, 54000 with hint
 * 'busy'): the chat job runs as often, and brings its files back under its
 * space each time, so nobody can fill the Storage every business shares
 * faster than it is let go.
 */
export const CHAT_PDF_BURST_MINUTES = 10;

/**
 * Storage's signed upload is good for `CHAT_UPLOAD_HOURS` from when the
 * server made it, by Storage's own clock: the database takes it as good for
 * this many minutes more, wherever it matters that it can still write.
 */
export const CHAT_UPLOAD_MARGIN_MINUTES = 5;

/**
 * What the server leaves at a PDF's place when it lets the place go while its
 * signed upload may still be good (a stop, a refusal on finishing, a sent
 * file the job removes): one byte, typed a PDF and never one. Storage's signed
 * upload writes wherever nothing is and never replaces a file, so nothing can
 * be written there again. Nobody reads it (no live message points at it), it
 * holds no place, and the clean-up removes it a day on. A new array each time.
 */
export function chatPlaceTombstone(): Uint8Array<ArrayBuffer> {
  return Uint8Array.of(0);
}

/** Whether these bytes, read from a PDF's place, are the server's tombstone. */
export function isPlaceTombstone(bytes: Uint8Array): boolean {
  return bytes.length === 1 && bytes[0] === 0;
}

/** What a stored PDF is called when its name is gone: ASCII, the app's own word. */
export const CHAT_PDF_FALLBACK_NAME = "document.pdf";

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

/** What a stored file's extension stands for: a picture or a PDF. */
export function chatFileKindOf(extension: ChatFileExtension): "image" | "pdf" {
  return extension === "pdf" ? "pdf" : "image";
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
 * A PDF's name as the screen writes it: without its ".pdf", which the line
 * under it already says ("PDF · 2.4 MB"). In a right-to-left line the
 * extension would split from digits before it ("תפריט סתיו 2026.pdf" reads
 * "תפריט סתיו pdf.2026"). The name it downloads as keeps it.
 */
export function shownFileName(name: string): string {
  return name.replace(/\.pdf$/i, "").trim() || name;
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

/**
 * Whether these bytes are a PDF's start: `%PDF-` and its version's first
 * digit, at the very beginning (a PDF reader may take a few stray bytes before
 * it; the server takes none, so nothing else can sit in front of it). The
 * server reads them, never the browser's word for the type, on finishing a
 * PDF (C5) and on every download of one.
 */
export function isPdf(bytes: Uint8Array): boolean {
  const start = "%PDF-";
  if (bytes.length < start.length + 1) return false;
  for (let i = 0; i < start.length; i += 1) {
    if (bytes[i] !== start.charCodeAt(i)) return false;
  }
  const digit = bytes[start.length] ?? 0;
  return digit >= 0x30 && digit <= 0x39;
}

/** Why the server refused a PDF before its place was reserved. */
export type ChatPdfProblem = "empty" | "tooBig" | "notPdf";

export type ChatPdfCheck =
  | { ok: true; name: string; size: number }
  | { ok: false; problem: ChatPdfProblem };

/** Whether a name, cleaned, is a PDF's: it ends in `.pdf`, in any case. */
export function isPdfName(name: string): boolean {
  return /\.pdf$/i.test(name);
}

/** What the attach sheet's "קובץ PDF" offers in the phone's file picker. */
export const CHAT_PDF_ACCEPT = "application/pdf,.pdf";

/**
 * The name a picked file goes with (C5): its own, or, where the picker gave a
 * PDF a name without its extension (some phones' file apps do), that name
 * with ".pdf" ("document.pdf" for none at all). Anything else keeps its name,
 * and `checkChatPdf` refuses it.
 */
export function pickedPdfName(file: { name: string; type: string }): string {
  if (isPdfName(file.name.trim()) || file.type !== CHAT_PDF_TYPE) {
    return file.name;
  }
  const base = file.name.trim().replace(/\.+$/, "");
  return base ? `${base}.pdf` : CHAT_PDF_FALLBACK_NAME;
}

/**
 * A file's size as the chat shows it beside its name: kilobytes below one
 * megabyte (at least 1, rounded up, so a small file never reads "0"), else
 * megabytes to one decimal, rounded up too, so 10 MiB reads "10" and nothing
 * under the limit reads over it. Binary units, as the limits are.
 */
export function chatFileSize(bytes: number): {
  unit: "kb" | "mb";
  value: number;
} {
  const safe = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  if (safe < 1024 * 1024) {
    return { unit: "kb", value: Math.max(1, Math.ceil(safe / 1024)) };
  }
  // Rounded on whole tenths first, so float noise never adds a tenth.
  const tenths = Math.ceil(Math.round((safe / (1024 * 1024)) * 1e6) / 1e5);
  return { unit: "mb", value: tenths / 10 };
}

/**
 * Whether a PDF the browser is about to put in Storage can go (C5), from what
 * it says of it: its size, 1 byte to 10 MiB, and its name, cleaned
 * (`cleanFileName`), ending in `.pdf`. Its bytes are checked once they are in
 * Storage (`isPdf`), and its size and type there by the database.
 */
export function checkChatPdf(file: {
  name: string;
  size: number;
}): ChatPdfCheck {
  if (!Number.isSafeInteger(file.size) || file.size < 0) {
    return { ok: false, problem: "notPdf" };
  }
  if (file.size === 0) return { ok: false, problem: "empty" };
  if (file.size > CHAT_PDF_MAX_BYTES) return { ok: false, problem: "tooBig" };
  const name = cleanFileName(file.name);
  if (!name || !isPdfName(name)) return { ok: false, problem: "notPdf" };
  return { ok: true, name, size: file.size };
}

/**
 * The `Content-Disposition` a chat PDF is served with: always a download
 * (`attachment`), so the phone opens it in its own viewer and never as a page
 * of the app's origin; "document.pdf" for old browsers, and its own name,
 * cleaned again and ending in `.pdf`, in UTF-8 (RFC 5987). ASCII only: no
 * quote, CR, LF or direction mark reaches the header.
 */
export function chatPdfDisposition(name: string | null): string {
  const clean = name === null ? null : cleanFileName(name);
  const named = clean && !isPdfName(clean) ? `${clean}.pdf` : clean;
  return contentDisposition(named, {
    disposition: "attachment",
    fallback: CHAT_PDF_FALLBACK_NAME,
  });
}

const id = z
  .string()
  .refine(isUuid)
  .transform((value) => value.toLowerCase());
const pdfName = z.string().max(1000);
const pdfSize = z.int().min(0);

/**
 * What the screen asks for to send a PDF (`startChatPdfAction`, C5): its
 * name and size as the browser has them, the draft it will send it under,
 * and where: a conversation, or someone's private chat, which it opens. A
 * PDF never goes as an announcement.
 */
export const chatPdfStartInput = z.union([
  z.strictObject({
    draft: id,
    name: pdfName,
    size: pdfSize,
    conversation: id,
  }),
  z.strictObject({
    draft: id,
    name: pdfName,
    size: pdfSize,
    toPerson: id,
  }),
]);
export type ChatPdfStartInput = z.input<typeof chatPdfStartInput>;

/**
 * What the screen sends once the browser put the PDF in Storage
 * (`finishChatPdfAction`): the place `startChatPdfAction` gave, the same
 * draft (a retry gives back the same message), and the words sent with it.
 */
export const chatPdfFinishInput = z.strictObject({
  upload: id,
  draft: id,
  words: z.string().max(8_000).optional(),
});
export type ChatPdfFinishInput = z.input<typeof chatPdfFinishInput>;

/** A PDF the person stopped sending (`cancelChatPdfAction`): its place. */
export const chatPdfCancelInput = z.strictObject({ upload: id });
export type ChatPdfCancelInput = z.input<typeof chatPdfCancelInput>;
