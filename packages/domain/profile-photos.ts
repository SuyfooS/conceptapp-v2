/**
 * Profile photos instead of initials (issue #42). A photo is a JPEG, PNG
 * or WebP of at most 2MB, stored in the private bucket `avatars` at
 * `<user id>/<key>.<ext>` (`public.profiles.avatar_path` points to it).
 * The type is read from the file's first bytes, not from what the browser
 * claims, and the two must agree.
 */

export const PROFILE_PHOTO_BUCKET = "avatars";
export const PROFILE_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
/** How long a signed link to a photo works. */
export const PROFILE_PHOTO_URL_SECONDS = 60 * 60;

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

export type PhotoProblem = "empty" | "tooBig" | "type";

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
  return { ok: true, type, extension: PROFILE_PHOTO_TYPES[type] };
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
