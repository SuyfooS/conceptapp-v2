import {
  hasPhotoMetadata,
  isAnimatedPhoto,
  type PhotoProblem,
  photoDimensions,
  sniffPhotoType,
} from "./profile-photos";

/**
 * Photos on lists (L6 of the lists plan; Orel's defaults on issue #1): a
 * photo item is filled with one picture, taken on the phone or chosen from
 * its photos. The browser re-encodes it first (`encodeListPhoto` in
 * @ui/photo-encode: upright, its longest side at most 1280 px, WebP, or JPEG
 * where WebP can't be written, nothing the camera wrote into the file), about
 * 0.3 MB; the server checks it again here and stores it in the private bucket
 * `list-photos` at `<business>/<list>/<key>.<webp|jpg>`
 * (`public.list_items.photo_path`). Photos are kept `photoDays` days (the
 * lists settings, 90 by default), then the app's daily clean-up removes them.
 * The checks are profile photos' (@domain/profile-photos), with a list's own
 * sizes.
 */

export const LIST_PHOTO_BUCKET = "list-photos";
/** The longest side a photo is stored at, in pixels. */
export const LIST_PHOTO_PIXELS = 1280;
/** What the browser aims a photo at. */
export const LIST_PHOTO_TARGET_BYTES = 300 * 1024;
/** Larger than this, the server and the bucket (its file_size_limit) refuse it. */
export const LIST_PHOTO_MAX_BYTES = 400 * 1024;

export const LIST_PHOTO_TYPES = {
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;
export type ListPhotoType = keyof typeof LIST_PHOTO_TYPES;

/** How long a business keeps its lists' photos, in days (a setting for the team). */
export const LIST_PHOTO_DAYS = [30, 90, 180, 365] as const;
export const DEFAULT_LIST_PHOTO_DAYS = 90;

/**
 * The encodings the browser tries, in order, until one is small enough: the
 * full size at 0.72, then at 0.6, then a smaller picture. A phone's 4 MB
 * photo is about 150 to 300 KB at the first.
 */
export const LIST_PHOTO_STEPS: readonly {
  pixels: number;
  quality: number;
}[] = [
  { pixels: LIST_PHOTO_PIXELS, quality: 0.72 },
  { pixels: LIST_PHOTO_PIXELS, quality: 0.6 },
  { pixels: 1024, quality: 0.6 },
  { pixels: 800, quality: 0.5 },
];

/**
 * A picture's size drawn with its longest side at most `longest`, keeping its
 * shape, never larger than it is, and at least a pixel each way.
 */
export function fitWithin(
  width: number,
  height: number,
  longest: number,
): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const scale = Math.min(1, longest / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * What to do after the encodings tried so far (their sizes, in the order of
 * `LIST_PHOTO_STEPS`): keep the last one once it is at most the target, try
 * the next step while there is one, and at the end keep the smallest if the
 * server takes it. "tooBig" when even that is over the limit.
 */
export function listPhotoVerdict(
  sizes: readonly number[],
): { keep: number } | "next" | "tooBig" {
  const last = sizes.length - 1;
  const size = sizes[last];
  if (size === undefined) return "next";
  if (size <= LIST_PHOTO_TARGET_BYTES) return { keep: last };
  if (sizes.length < LIST_PHOTO_STEPS.length) return "next";
  let smallest = 0;
  sizes.forEach((each, at) => {
    if (each < (sizes[smallest] ?? Number.POSITIVE_INFINITY)) smallest = at;
  });
  return (sizes[smallest] ?? Number.POSITIVE_INFINITY) <= LIST_PHOTO_MAX_BYTES
    ? { keep: smallest }
    : "tooBig";
}

/** Why the server refused a photo's file: profile photos' reasons. */
export type ListPhotoProblem = PhotoProblem;

export type ListPhotoCheck =
  | { ok: true; type: ListPhotoType; extension: "jpg" | "webp" }
  | { ok: false; problem: ListPhotoProblem };

const isListPhotoType = (type: string | null): type is ListPhotoType =>
  type === "image/jpeg" || type === "image/webp";

/**
 * Whether a file can be a list's photo, and what it is: a JPEG or WebP by its
 * bytes (and as the browser says), at most 400 KB, nothing from the camera
 * inside (EXIF, XMP), still, its longest side at most 1280 px. Anything else
 * didn't come from the app's own re-encoding.
 */
export function checkListPhoto(file: {
  type: string;
  size: number;
  bytes: Uint8Array;
}): ListPhotoCheck {
  return checkStillPhoto(file, {
    maxBytes: LIST_PHOTO_MAX_BYTES,
    maxPixels: LIST_PHOTO_PIXELS,
  });
}

/**
 * The check of a picture the app re-encoded in the browser, with the sizes of
 * where it goes (a list's photo, and chat's pictures and thumbnails in
 * @domain/chat-files): a JPEG or WebP by its bytes and as the browser says, at
 * most `maxBytes`, nothing from the camera inside (EXIF, XMP), still, and its
 * longest side at most `maxPixels`.
 */
export function checkStillPhoto(
  file: { type: string; size: number; bytes: Uint8Array },
  limits: { maxBytes: number; maxPixels: number },
): ListPhotoCheck {
  if (file.size === 0 || file.bytes.length === 0) {
    return { ok: false, problem: "empty" };
  }
  if (file.size > limits.maxBytes || file.bytes.length > limits.maxBytes) {
    return { ok: false, problem: "tooBig" };
  }
  const type = sniffPhotoType(file.bytes);
  if (!isListPhotoType(type) || type !== file.type) {
    return { ok: false, problem: "type" };
  }
  if (hasPhotoMetadata(file.bytes, type)) {
    return { ok: false, problem: "metadata" };
  }
  const size = photoDimensions(file.bytes, type);
  if (
    size === null ||
    size.width < 1 ||
    size.height < 1 ||
    Math.max(size.width, size.height) > limits.maxPixels ||
    isAnimatedPhoto(file.bytes, type)
  ) {
    return { ok: false, problem: "pixels" };
  }
  return { ok: true, type, extension: LIST_PHOTO_TYPES[type] };
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const FILE = /^[a-z0-9-]{1,40}\.(webp|jpg)$/;
const PATH = new RegExp(`^(${UUID})/(${UUID})/([a-z0-9-]{1,40}\\.(webp|jpg))$`);

/** A photo's file name inside its list's folder: a key and its type. */
export function isListPhotoFile(file: string): boolean {
  return FILE.test(file);
}

/** Where a list's photo goes. `key` is random, so a new photo gets a new link. */
export function listPhotoPath(
  businessId: string,
  listId: string,
  key: string,
  extension: "jpg" | "webp",
): string {
  return `${businessId}/${listId}/${key}.${extension}`;
}

/**
 * The same rule as the database's (`list_items.photo_path`, and
 * `public.set_list_item_photo`, which also holds it to the item's own list):
 * `<business>/<list>/<key>.<webp|jpg>`, lower case, and, when `where` is
 * given, in that business's list.
 */
export function isListPhotoPath(
  path: string,
  where?: { businessId: string; listId: string },
): boolean {
  const match = PATH.exec(path);
  if (!match) return false;
  return where
    ? match[1] === where.businessId && match[2] === where.listId
    : true;
}

/** Where the app shows a stored photo: its own route, which checks who asks. */
export function listPhotoSrc(path: string | null | undefined): string | null {
  return path ? `/list-photos/${path}` : null;
}
