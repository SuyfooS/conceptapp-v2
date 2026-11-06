import "server-only";
import { randomBytes } from "node:crypto";
import {
  checkProfilePhoto,
  type PhotoProblem,
  PROFILE_PHOTO_BUCKET,
  PROFILE_PHOTO_URL_SECONDS,
  profilePhotoPath,
} from "@domain/profile-photos";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

/*
 * Profile photos (issue #42), server first: no screen calls these yet.
 * Writes run with the secret key for `userId`; callers make sure that is
 * the signed-in person, not someone viewing as them. The bucket's
 * policies hold the same rules for anything that reaches Storage directly.
 */

export type PhotoResult =
  | { ok: true; path: string | null }
  | { ok: false; failure: PhotoProblem | "failed" };

/** A random key, so a new photo gets a new path (and old links stop). */
function newPhotoKey(): string {
  return randomBytes(12).toString("base64url");
}

async function currentPath(userId: string): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("avatar_path")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data.avatar_path;
}

/**
 * Set `userId`'s photo: checks the file (JPEG, PNG or WebP by its bytes,
 * up to 2MB), uploads it, points the profile at it and removes the old one.
 */
export async function setProfilePhoto(
  userId: string,
  file: Blob,
): Promise<PhotoResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkProfilePhoto({ type: file.type, size: file.size, bytes });
  if (!check.ok) return { ok: false, failure: check.problem };

  const admin = createAdminClient();
  const storage = admin.storage.from(PROFILE_PHOTO_BUCKET);
  const previous = await currentPath(userId);
  const path = profilePhotoPath(userId, newPhotoKey(), check.extension);

  const uploaded = await storage.upload(path, bytes, {
    contentType: check.type,
    upsert: false,
  });
  if (uploaded.error) {
    console.error("profile photo upload failed", uploaded.error.message);
    return { ok: false, failure: "failed" };
  }

  const { error } = await admin
    .from("profiles")
    .update({ avatar_path: path })
    .eq("id", userId);
  if (error) {
    console.error("profile photo save failed", error.message);
    await storage.remove([path]);
    return { ok: false, failure: "failed" };
  }

  if (previous) await storage.remove([previous]);
  return { ok: true, path };
}

/** Remove `userId`'s photo; their initials show again. */
export async function removeProfilePhoto(userId: string): Promise<PhotoResult> {
  const admin = createAdminClient();
  const previous = await currentPath(userId);
  if (!previous) return { ok: true, path: null };

  const { error } = await admin
    .from("profiles")
    .update({ avatar_path: null })
    .eq("id", userId);
  if (error) {
    console.error("profile photo removal failed", error.message);
    return { ok: false, failure: "failed" };
  }
  await admin.storage.from(PROFILE_PHOTO_BUCKET).remove([previous]);
  return { ok: true, path: null };
}

/**
 * Signed links to photos, as the signed-in person may read them: Storage
 * signs only the paths the bucket's policies let them read (their own and
 * their colleagues'). Paths it refuses are left out of the map.
 */
export async function profilePhotoUrls(
  paths: readonly (string | null)[],
): Promise<Map<string, string>> {
  const wanted = [...new Set(paths.filter((p): p is string => p !== null))];
  if (wanted.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(PROFILE_PHOTO_BUCKET)
    .createSignedUrls(wanted, PROFILE_PHOTO_URL_SECONDS);
  if (error) throw error;
  return new Map(
    data.flatMap((d) =>
      d.path && d.signedUrl && !d.error ? [[d.path, d.signedUrl]] : [],
    ),
  );
}
