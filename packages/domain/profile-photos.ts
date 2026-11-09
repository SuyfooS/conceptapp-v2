/**
 * Profile photos instead of initials (issue #42). A photo is a JPEG, PNG
 * or WebP of at most 2MB, a still square of at most 512 px, stored in the
 * private bucket `avatars` at `<user id>/<key>.<ext>`
 * (`public.profiles.avatar_path` points to it). The type is read from the
 * file's first bytes, not from what the browser claims, and the two must
 * agree; the size in pixels is read from the file's header.
 */

export const PROFILE_PHOTO_BUCKET = "avatars";
export const PROFILE_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
/** How long a signed link to a photo works. */
export const PROFILE_PHOTO_URL_SECONDS = 60 * 60;
/** The side of the square a photo is stored at, after the browser re-encodes it. */
export const PROFILE_PHOTO_PIXELS = 512;
export const PROFILE_PHOTO_QUALITY = 0.85;
/** Larger picks are refused before decoding: a phone's photo is under 15 MB. */
export const PICKED_PHOTO_MAX_BYTES = 25 * 1024 * 1024;

export const PROFILE_PHOTO_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
export type ProfilePhotoType = keyof typeof PROFILE_PHOTO_TYPES;

const startsWith = (bytes: Uint8Array, prefix: readonly number[], at = 0) =>
  prefix.every((b, i) => bytes[at + i] === b);

/** The image type the bytes really are, or null when not one we take. */
export function sniffPhotoType(bytes: Uint8Array): ProfilePhotoType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  // "RIFF" <size> "WEBP"
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image/webp";
  }
  return null;
}

export type PhotoProblem = "empty" | "tooBig" | "type" | "metadata" | "pixels";
/** Everything a photo save or removal can answer with, for the screen's words. */
export type PhotoFailure =
  | PhotoProblem
  | "demo"
  | "viewOnly"
  | "notYet"
  | "failed";

/** What saving or removing a photo answers: the photo to show now, or why not. */
export type PhotoSaveResult =
  | { ok: true; photo: string | null }
  | { ok: false; failure: PhotoFailure };

export type PhotoCheck =
  | { ok: true; type: ProfilePhotoType; extension: string }
  | { ok: false; problem: PhotoProblem };

/** Whether a file can be someone's photo, and what it is. */
export function checkProfilePhoto(file: {
  type: string;
  size: number;
  bytes: Uint8Array;
}): PhotoCheck {
  if (file.size === 0 || file.bytes.length === 0)
    return { ok: false, problem: "empty" };
  if (
    file.size > PROFILE_PHOTO_MAX_BYTES ||
    file.bytes.length > PROFILE_PHOTO_MAX_BYTES
  ) {
    return { ok: false, problem: "tooBig" };
  }
  const type = sniffPhotoType(file.bytes);
  if (type === null || type !== file.type)
    return { ok: false, problem: "type" };
  if (hasPhotoMetadata(file.bytes, type)) {
    return { ok: false, problem: "metadata" };
  }
  // What the browser makes is one still square of 512 px. Anything else
  // didn't come from it, and colleagues' screens would draw it.
  const size = photoDimensions(file.bytes, type);
  if (
    size === null ||
    size.width < 1 ||
    size.width !== size.height ||
    size.width > PROFILE_PHOTO_PIXELS ||
    isAnimatedPhoto(file.bytes, type)
  ) {
    return { ok: false, problem: "pixels" };
  }
  return { ok: true, type, extension: PROFILE_PHOTO_TYPES[type] };
}

/** The centred square of a width × height picture, in its own pixels. */
export function squareCrop(
  width: number,
  height: number,
): { sx: number; sy: number; size: number } {
  const size = Math.min(width, height);
  return {
    sx: Math.floor((width - size) / 2),
    sy: Math.floor((height - size) / 2),
    size,
  };
}

const ascii = (bytes: Uint8Array, at: number, length: number) =>
  String.fromCharCode(...bytes.subarray(at, at + length));
const uint16 = (bytes: Uint8Array, at: number) =>
  ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0);
const uint32 = (bytes: Uint8Array, at: number) =>
  (((bytes[at] ?? 0) << 24) >>> 0) +
  ((bytes[at + 1] ?? 0) << 16) +
  ((bytes[at + 2] ?? 0) << 8) +
  (bytes[at + 3] ?? 0);
const uint16le = (bytes: Uint8Array, at: number) =>
  (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8);
const uint24le = (bytes: Uint8Array, at: number) =>
  uint16le(bytes, at) + ((bytes[at + 2] ?? 0) << 16);
const uint32le = (bytes: Uint8Array, at: number) =>
  (bytes[at] ?? 0) +
  ((bytes[at + 1] ?? 0) << 8) +
  ((bytes[at + 2] ?? 0) << 16) +
  (((bytes[at + 3] ?? 0) << 24) >>> 0);

/*
 * The walks below read by the lengths the file gives and stop where a
 * truncated or malformed file ends: they never throw or read past the end.
 */

type JpegSegment = { marker: number; at: number; length: number };

/**
 * A JPEG's segments before its first scan, in order: `at` is where the
 * marker is, `length` what the file says. A segment whose length is cut off
 * is not given; one with a broken length is given, and the walk stops after it.
 */
function* jpegSegments(bytes: Uint8Array): Generator<JpegSegment> {
  let at = 2; // after SOI
  while (at + 1 < bytes.length) {
    if (bytes[at] !== 0xff) return;
    const marker = bytes[at + 1] ?? 0;
    // Fill bytes before a marker.
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    // The scan starts, or the file ends: nothing more to read before it.
    if (marker === 0xda || marker === 0xd9) return;
    // Markers that stand alone, with no length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
      continue;
    }
    if (at + 4 > bytes.length) return;
    const length = uint16(bytes, at + 2);
    yield { marker, at, length };
    if (length < 2) return;
    at += 2 + length;
  }
}

type PngChunk = { type: string; at: number; length: number };

/** A PNG's chunks up to IEND: `at` is where the chunk's length is. */
function* pngChunks(bytes: Uint8Array): Generator<PngChunk> {
  let at = 8; // after the signature
  while (at + 8 <= bytes.length) {
    const length = uint32(bytes, at);
    const type = ascii(bytes, at + 4, 4);
    yield { type, at, length };
    if (type === "IEND") return;
    at += 12 + length;
  }
}

type WebpChunk = { type: string; data: number; size: number };

/** A WebP's chunks: `data` is where the chunk's own bytes start. */
function* webpChunks(bytes: Uint8Array): Generator<WebpChunk> {
  let at = 12; // after "RIFF" <size> "WEBP"
  while (at + 8 <= bytes.length) {
    const type = ascii(bytes, at, 4);
    const size = uint32le(bytes, at + 4);
    yield { type, data: at + 8, size };
    // Chunks are padded to an even size.
    at += 8 + size + (size % 2);
  }
}

/** JPEG: an APP1 segment (EXIF or XMP) before the picture's first scan. */
function jpegMetadata(bytes: Uint8Array): boolean {
  for (const segment of jpegSegments(bytes)) {
    // A segment that says it is metadata counts, even if the file ends inside it.
    if (segment.marker === 0xe1) return true;
  }
  return false;
}

const PNG_METADATA = new Set(["eXIf", "tEXt", "iTXt", "zTXt"]);

/** PNG: an EXIF or text chunk. */
function pngMetadata(bytes: Uint8Array): boolean {
  for (const chunk of pngChunks(bytes)) {
    if (PNG_METADATA.has(chunk.type)) return true;
  }
  return false;
}

/** WebP: an EXIF or XMP chunk. */
function webpMetadata(bytes: Uint8Array): boolean {
  for (const chunk of webpChunks(bytes)) {
    if (chunk.type === "EXIF" || chunk.type === "XMP ") return true;
  }
  return false;
}

/**
 * Whether the bytes still carry what a camera writes into a file: EXIF or XMP
 * in a JPEG (APP1 before the first SOS), eXIf, tEXt, iTXt or zTXt in a PNG,
 * EXIF or "XMP " chunks in a WebP. The browser's re-encoding leaves none; the
 * server refuses a file that has any, so a location never reaches Storage.
 * Reads by the lengths the file gives and stops, answering false, where a
 * truncated or malformed file ends: it never throws or reads past the end.
 */
export function hasPhotoMetadata(
  bytes: Uint8Array,
  type: ProfilePhotoType,
): boolean {
  switch (type) {
    case "image/jpeg":
      return jpegMetadata(bytes);
    case "image/png":
      return pngMetadata(bytes);
    case "image/webp":
      return webpMetadata(bytes);
  }
}

export type PhotoSize = { width: number; height: number };

/**
 * JPEG: the frame header, SOF0 to SOF15 (C0 to CF, less C4, C8 and CC,
 * which are other markers), before the first scan.
 */
function jpegSize(bytes: Uint8Array): PhotoSize | null {
  for (const { marker, at, length } of jpegSegments(bytes)) {
    const frame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 && // DHT
      marker !== 0xc8 && // JPG
      marker !== 0xcc; // DAC
    if (!frame) continue;
    // Precision, then height and width.
    if (length < 8 || at + 9 > bytes.length) return null;
    return { width: uint16(bytes, at + 7), height: uint16(bytes, at + 5) };
  }
  return null;
}

/** PNG: IHDR, which must be the first chunk. */
function pngSize(bytes: Uint8Array): PhotoSize | null {
  if (
    bytes.length < 24 ||
    uint32(bytes, 8) !== 13 ||
    ascii(bytes, 12, 4) !== "IHDR"
  ) {
    return null;
  }
  return { width: uint32(bytes, 16), height: uint32(bytes, 20) };
}

/** WebP: the size a VP8 (lossy) or VP8L (lossless) bitstream gives. */
function webpBitstreamSize(
  bytes: Uint8Array,
  { type, data }: WebpChunk,
): PhotoSize | null {
  if (type === "VP8 ") {
    // A 3-byte frame tag, the start code 9d 01 2a, then 14-bit sizes.
    if (
      data + 10 > bytes.length ||
      !startsWith(bytes, [0x9d, 0x01, 0x2a], data + 3)
    ) {
      return null;
    }
    return {
      width: uint16le(bytes, data + 6) & 0x3fff,
      height: uint16le(bytes, data + 8) & 0x3fff,
    };
  }
  if (type === "VP8L") {
    // The signature 0x2f, then 14-bit sizes less one.
    if (data + 5 > bytes.length || bytes[data] !== 0x2f) return null;
    const bits = uint32le(bytes, data + 1);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  return null;
}

/**
 * WebP: the picture's bitstream, the first chunk or after VP8X. VP8X gives
 * the canvas (24-bit sizes less one), and the picture must fill it.
 */
function webpSize(bytes: Uint8Array): PhotoSize | null {
  let canvas: PhotoSize | null = null;
  for (const chunk of webpChunks(bytes)) {
    if (chunk.type === "VP8 " || chunk.type === "VP8L") {
      const image = webpBitstreamSize(bytes, chunk);
      if (
        image === null ||
        (canvas !== null &&
          (canvas.width !== image.width || canvas.height !== image.height))
      ) {
        return null;
      }
      return image;
    }
    if (canvas === null) {
      if (chunk.type !== "VP8X" || chunk.data + 10 > bytes.length) return null;
      canvas = {
        width: uint24le(bytes, chunk.data + 4) + 1,
        height: uint24le(bytes, chunk.data + 7) + 1,
      };
    }
  }
  return null;
}

/**
 * A photo's size in pixels, read from its header without decoding it: the
 * JPEG frame header, the PNG IHDR, the WebP bitstream (and VP8X canvas).
 * Null when the header can't be found or is cut off.
 */
export function photoDimensions(
  bytes: Uint8Array,
  type: ProfilePhotoType,
): PhotoSize | null {
  switch (type) {
    case "image/jpeg":
      return jpegSize(bytes);
    case "image/png":
      return pngSize(bytes);
    case "image/webp":
      return webpSize(bytes);
  }
}

/** APNG's chunks: a PNG with any of them may move. */
const PNG_ANIMATION = new Set(["acTL", "fcTL", "fdAT"]);
/** VP8X's flag for an animation. */
const WEBP_ANIMATED = 0x02;

/**
 * Whether the photo moves: an APNG (acTL, fcTL or fdAT chunks) or an animated
 * WebP (VP8X's animation flag, ANIM or ANMF chunks). A JPEG never does.
 */
export function isAnimatedPhoto(
  bytes: Uint8Array,
  type: ProfilePhotoType,
): boolean {
  switch (type) {
    case "image/jpeg":
      return false;
    case "image/png":
      for (const chunk of pngChunks(bytes)) {
        if (PNG_ANIMATION.has(chunk.type)) return true;
      }
      return false;
    case "image/webp":
      for (const chunk of webpChunks(bytes)) {
        if (chunk.type === "ANIM" || chunk.type === "ANMF") return true;
        if (
          chunk.type === "VP8X" &&
          ((bytes[chunk.data] ?? 0) & WEBP_ANIMATED) !== 0
        ) {
          return true;
        }
      }
      return false;
  }
}

/**
 * A JPEG without its APP1 segments (EXIF, XMP), the rest byte for byte. For
 * a JPEG the browser itself just encoded from a canvas, whose encoder may
 * still write a block of its own (the system encoder Safari uses can): nothing
 * from the camera is in it, and the server refuses any. Bytes it
 * can't walk to the first scan come back as they are, for the server to judge.
 */
export function withoutJpegMetadata(
  bytes: Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> {
  if (sniffPhotoType(bytes) !== "image/jpeg") return bytes;
  const kept: Uint8Array<ArrayBuffer>[] = [bytes.subarray(0, 2)];
  let removed = false;
  let at = 2;
  while (at + 3 < bytes.length && bytes[at] === 0xff) {
    const marker = bytes[at + 1] ?? 0;
    if (marker === 0xda) {
      if (!removed) return bytes;
      kept.push(bytes.subarray(at));
      const out = new Uint8Array(kept.reduce((n, part) => n + part.length, 0));
      let offset = 0;
      for (const part of kept) {
        out.set(part, offset);
        offset += part.length;
      }
      return out;
    }
    // Fill bytes or a marker with no length: not what an encoder writes here.
    if (
      marker === 0xff ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd9)
    )
      return bytes;
    const length = uint16(bytes, at + 2);
    if (length < 2 || at + 2 + length > bytes.length) return bytes;
    if (marker === 0xe1) removed = true;
    else kept.push(bytes.subarray(at, at + 2 + length));
    at += 2 + length;
  }
  return bytes;
}

/** Where the app shows a stored photo: its own route, which checks who asks. */
export function profilePhotoSrc(
  path: string | null | undefined,
): string | null {
  return path ? `/photos/${path}` : null;
}

/** Where a person's photo goes. `key` is random, so a new photo gets a new link. */
export function profilePhotoPath(
  userId: string,
  key: string,
  extension: string,
): string {
  return `${userId}/${key}.${extension}`;
}

/** The same rule as the database's check on `avatar_path`. */
export function isProfilePhotoPath(userId: string, path: string): boolean {
  const [folder, file, ...rest] = path.split("/");
  return (
    rest.length === 0 &&
    folder === userId &&
    /^[A-Za-z0-9_-]{8,64}\.(jpg|png|webp)$/.test(file ?? "")
  );
}
