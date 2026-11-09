import "server-only";
import { randomBytes } from "node:crypto";
import {
  checkProfilePhoto,
  type PhotoProblem,
  PROFILE_PHOTO_BUCKET,
  PROFILE_PHOTO_URL_SECONDS,
  type ProfilePhotoType,
  profilePhotoPath,
  sniffPhotoType,
} from "@domain/profile-photos";
import { isMissingFunction } from "./missing";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

/*
 * Profile photos (issue #42, shown from #82). Writes run with the secret key
 * for `userId`; callers make sure that is the signed-in person, not someone
 * viewing as them. The bucket's policies hold the same rules for anything
 * that reaches Storage directly, and the database refuses a new photo for
 * someone in a demo business that keeps its people
 * (20261109000100_profile_photo_demo.sql).
 */

export type PhotoResult =
  | { ok: true; path: string | null }
  | { ok: false; failure: PhotoProblem | "demo" | "notYet" | "failed" };

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
 * Whether the person may set a photo: not while they are in a demo business
 * that keeps its people as they are. Before the migration reaches a project
 * nothing would stop a demo upload, so photos wait until it does ("notYet").
 */
export async function photoAllowed(
  userId: string,
): Promise<"yes" | "demo" | "notYet"> {
  const { data, error } = await createAdminClient().rpc("keeps_demo_profile", {
    person: userId,
  });
  if (error) {
    if (isMissingFunction(error)) return "notYet";
    throw error;
  }
  return data ? "demo" : "yes";
}

/**
 * Set `userId`'s photo: checks the file (JPEG, PNG or WebP by its bytes,
 * up to 2MB, a still square of at most 512 px, nothing from the camera
 * inside), uploads it, points the profile at it and removes the old one.
 */
export async function setProfilePhoto(
  userId: string,
  file: Blob,
): Promise<PhotoResult> {
  const allowed = await photoAllowed(userId);
  if (allowed !== "yes") return { ok: false, failure: allowed };

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
    await storage.remove([path]);
    // The database's own demo rule, if the person joined one meanwhile.
    if (error.code === "55000") return { ok: false, failure: "demo" };
    console.error("profile photo save failed", error.message);
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
 * A photo's bytes as the signed-in person may read them: downloaded under
 * their own session, so Storage's policies decide (their own photo and their
 * colleagues'). Null for anything they may not read, or that isn't a photo
 * we take.
 */
export async function profilePhotoBytes(
  path: string,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; type: ProfilePhotoType } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(PROFILE_PHOTO_BUCKET)
    .download(path);
  if (error || !data) return null;
  const bytes = new Uint8Array(await data.arrayBuffer());
  const type = sniffPhotoType(bytes);
  return type ? { bytes, type } : null;
}

/**
 * Signed links to photos, as the signed-in person may read them: Storage
 * signs only the paths the bucket's policies let them read (their own and
 * their colleagues'). Paths it refuses are left out of the map. Kept for
 * later: the screens show photos through /photos (`profilePhotoSrc`).
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
