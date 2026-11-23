import "server-only";
import { randomBytes } from "node:crypto";
import {
  checkProfilePhoto,
  type PhotoProblem,
  PROFILE_PHOTO_BUCKET,
  type ProfilePhotoType,
  profilePhotoOwner,
  profilePhotoPath,
  sniffPhotoType,
} from "@domain/profile-photos";
import { isMissingFunction } from "./missing";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

/*
 * Profile photos (issue #42, shown from #82). Writes run with the secret key
 * for `userId`; callers make sure that is the signed-in person, not someone
 * viewing as them. The bucket has no policy
 * (20261127000300_files_server_only.sql): only the server reads it, for the
 * app's /photos route, once `public.sees_profile_photo` said yes under the
 * reader's own session (their own photo or an active colleague's, while
 * their profile points at it), and nothing signs a link to a photo. A
 * profile is pointed at its new photo under its row's lock
 * (`public.set_avatar_path`), which gives back the file it replaced, to
 * remove; a file nothing points at, whatever left it, goes with the daily
 * clean-up a day on (`cleanProfilePhotos`). The database refuses a new photo
 * for someone in a demo business that keeps its people
 * (20261109000100_profile_photo_demo.sql). Nothing here logs a path: a
 * failure is logged by its code.
 */

export type PhotoResult =
  | { ok: true; path: string | null }
  | { ok: false; failure: PhotoProblem | "demo" | "notYet" | "failed" };

/** A random key, so a new photo gets a new path (and old links stop). */
function newPhotoKey(): string {
  return randomBytes(12).toString("base64url");
}

/** An error by its code alone (Storage's status, a SQLSTATE), never its words. */
function codeOf(error: unknown): string {
  if (error && typeof error === "object") {
    for (const key of ["statusCode", "status", "code", "name"]) {
      const value = (error as Record<string, unknown>)[key];
      if (typeof value === "string" || typeof value === "number") {
        return String(value);
      }
    }
  }
  return "without a code";
}

/**
 * Removes photos nothing points at any more, with the secret key: tried
 * twice, each refusal logged by its code. What still stays is nobody's (no
 * profile points at it, so /photos serves it to nobody), and the daily
 * clean-up takes it a day on. Whether it went.
 */
async function removeStored(paths: string[]): Promise<boolean> {
  const storage = createAdminClient().storage.from(PROFILE_PHOTO_BUCKET);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { error } = await storage.remove(paths);
    if (!error) return true;
    console.error("a profile photo stayed", codeOf(error));
  }
  return false;
}

/** The photo `set_avatar_path` gave back, when it is this person's own. */
function replacedOf(data: unknown, userId: string): string | null {
  return typeof data === "string" && profilePhotoOwner(data) === userId
    ? data
    : null;
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
 * Before 20261127000300 reaches the project (no `public.set_avatar_path`):
 * the profile pointed at `path`, or at none, as before, with no lock, and the
 * photo it had removed.
 */
async function pointWithoutLock(
  userId: string,
  path: string | null,
): Promise<PhotoResult> {
  const previous = await currentPath(userId);
  if (previous === path) return { ok: true, path };
  const { error } = await createAdminClient()
    .from("profiles")
    .update({ avatar_path: path })
    .eq("id", userId);
  if (error) {
    if (path) await removeStored([path]);
    // The database's own demo rule, if the person joined one meanwhile.
    if (error.code === "55000") return { ok: false, failure: "demo" };
    console.error("profile photo save failed", codeOf(error));
    return { ok: false, failure: "failed" };
  }
  if (previous) await removeStored([previous]);
  return { ok: true, path };
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
 * inside), uploads it under a new key, points the profile at it and removes
 * the photo that pointer replaced. When the database's answer is lost, the
 * upload stays: the profile may point at it, and if not, the clean-up takes
 * it a day on.
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
  const path = profilePhotoPath(userId, newPhotoKey(), check.extension);
  const uploaded = await admin.storage
    .from(PROFILE_PHOTO_BUCKET)
    .upload(path, bytes, { contentType: check.type, upsert: false });
  if (uploaded.error) {
    console.error("profile photo upload failed", codeOf(uploaded.error));
    return { ok: false, failure: "failed" };
  }

  const { data, error } = await admin.rpc("set_avatar_path", {
    person: userId,
    new_path: path,
  });
  if (error) {
    if (isMissingFunction(error)) return await pointWithoutLock(userId, path);
    // No SQLSTATE: the profile may point at it by now, so it stays.
    if (!error.code) {
      console.error("a profile photo's saving ended unknown");
      return { ok: false, failure: "failed" };
    }
    // The database said no: nothing points at it, so it goes.
    await removeStored([path]);
    // The database's own demo rule, if the person joined one meanwhile.
    if (error.code === "55000") return { ok: false, failure: "demo" };
    console.error("profile photo save failed", error.code);
    return { ok: false, failure: "failed" };
  }
  const replaced = replacedOf(data, userId);
  if (replaced) await removeStored([replaced]);
  return { ok: true, path };
}

/** Remove `userId`'s photo; their initials show again. */
export async function removeProfilePhoto(userId: string): Promise<PhotoResult> {
  const { data, error } = await createAdminClient().rpc("set_avatar_path", {
    person: userId,
  });
  if (error) {
    if (isMissingFunction(error)) return await pointWithoutLock(userId, null);
    console.error("profile photo removal failed", codeOf(error));
    return { ok: false, failure: "failed" };
  }
  const replaced = replacedOf(data, userId);
  if (replaced) await removeStored([replaced]);
  return { ok: true, path: null };
}

/** The bytes as a photo we take, by their own first bytes, or null. */
function photoOf(
  bytes: Uint8Array<ArrayBuffer>,
): { bytes: Uint8Array<ArrayBuffer>; type: ProfilePhotoType } | null {
  const type = sniffPhotoType(bytes);
  return type ? { bytes, type } : null;
}

/**
 * A photo's bytes as the signed-in person may read them, for /photos: their
 * own current photo or an active colleague's (`public.sees_profile_photo`,
 * asked under their own session), and only then read with the secret key.
 * Null for anything else, a photo replaced or removed included, or what
 * isn't a photo we take. Before 20261127000300 reaches the project, read
 * under their own session, where the bucket's policy still decides.
 */
export async function profilePhotoBytes(
  path: string,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; type: ProfilePhotoType } | null> {
  const supabase = await createClient();
  const seen = await supabase.rpc("sees_profile_photo", { photo_path: path });
  if (seen.error) {
    if (!isMissingFunction(seen.error)) {
      console.error("a profile photo could not be read", codeOf(seen.error));
      return null;
    }
    const before = await supabase.storage
      .from(PROFILE_PHOTO_BUCKET)
      .download(path);
    if (before.error || !before.data) return null;
    return photoOf(new Uint8Array(await before.data.arrayBuffer()));
  }
  if (seen.data !== true) return null;
  // Only now the file, with the secret key's own download: no session reads
  // the bucket, and no signed link is made for it.
  const { data, error } = await createAdminClient()
    .storage.from(PROFILE_PHOTO_BUCKET)
    .download(path);
  if (error || !data) return null;
  return photoOf(new Uint8Array(await data.arrayBuffer()));
}

/** How many photos one clean-up removes at most, a batch at a time. */
const CLEAN_BATCH = 500;
const CLEAN_BATCHES = 20;

/**
 * The daily clean-up's part for profile photos (`/cron/list-photos`): the
 * avatars bucket's files a day old that no profile points at
 * (`public.expired_avatars`: a removal Storage refused, a save whose answer
 * was lost, a deleted account's, what a demo reset left) are removed, a batch
 * at a time, only those in the app's own shape. Returns how many went. A
 * batch Storage refuses stops it, logged by its code; the rest wait for the
 * next day. Nothing before 20261127000300 reaches the project.
 */
export async function cleanProfilePhotos(at?: Date): Promise<number> {
  const admin = createAdminClient();
  let removed = 0;
  for (let batch = 0; batch < CLEAN_BATCHES; batch += 1) {
    // bounded: max_rows, CLEAN_BATCH (500) a batch.
    const { data, error } = await admin.rpc("expired_avatars", {
      max_rows: CLEAN_BATCH,
      ...(at ? { at_time: at.toISOString() } : {}),
    });
    if (error) {
      if (isMissingFunction(error)) return removed;
      throw error;
    }
    const paths = (data ?? []).map((row) => row.path);
    if (paths.length === 0) return removed;
    const files = paths.filter((path) => profilePhotoOwner(path) !== null);
    if (files.length > 0) {
      const gone = await admin.storage.from(PROFILE_PHOTO_BUCKET).remove(files);
      if (gone.error) {
        console.error("profile photos stayed", codeOf(gone.error));
        return removed;
      }
    }
    removed += files.length;
    if (paths.length < CLEAN_BATCH) return removed;
  }
  return removed;
}
