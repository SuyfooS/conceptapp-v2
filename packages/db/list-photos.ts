import "server-only";
import { randomBytes } from "node:crypto";
import {
  checkListPhoto,
  isListPhotoPath,
  LIST_PHOTO_BUCKET,
  type ListPhotoProblem,
  type ListPhotoType,
  listPhotoPath,
  listPhotoSrc,
} from "@domain/list-photos";
import { sniffPhotoType } from "@domain/profile-photos";
import type { ListFailure } from "./lists";
import { isMissingFunction } from "./missing";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

/*
 * Photos on lists (L6, supabase/migrations/20261110001500_list_photos.sql).
 * Writes run with the secret key for `actorId`: callers make sure that is the
 * signed-in person, not someone viewing as them, in the business the screen
 * was drawn for. The file is checked here (`checkListPhoto`), uploaded under a
 * new random key, and only then pointed at by its item
 * (`public.set_list_item_photo`, which holds the item to the list's own rules);
 * the file it replaced is removed after, and a file nothing points at is
 * removed again. The bucket takes nothing from the browser, and its policy lets
 * a reader read only the photos of lists they see. A demo business takes no
 * photos (`list_photos_closed`), and the database refuses one too.
 */

export type ListPhotoFailure = ListFailure | ListPhotoProblem | "demo";

export type ListPhotoWrite =
  | { ok: true; photo: string | null }
  | { ok: false; failure: ListPhotoFailure };

/** A random key, lower case, so a new photo gets a new path (and old links stop). */
function newPhotoKey(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Whether the business takes photos on its lists: not a demo business whose
 * definition doesn't open it. Before the migration reaches a project nothing
 * would stop a demo upload, nor take one, so photos wait until it does
 * ("notYet").
 */
export async function listPhotosAllowed(
  businessId: string,
): Promise<"yes" | "demo" | "notYet"> {
  const { data, error } = await createAdminClient().rpc("list_photos_closed", {
    business: businessId,
  });
  if (error) {
    if (isMissingFunction(error)) return "notYet";
    throw error;
  }
  return data ? "demo" : "yes";
}

function failureOf(error: {
  code?: string;
  message: string;
}): ListFailure | "demo" {
  if (isMissingFunction(error)) return "notYet";
  switch (error.code) {
    case "42501":
    case "P0002":
      return "noAccess";
    case "22023":
      return "invalid";
    case "55000":
      return "finished";
    default:
      console.error("a list photo write failed", error.message);
      return "failed";
  }
}

/**
 * The item as the signed-in person reads it (under RLS: a list they see), in
 * the business they are in: its list and business, for the file's folder.
 * Null for anything else, so nothing is uploaded for a list they can't read.
 */
async function photoItem(
  businessId: string,
  itemId: string,
): Promise<{ listId: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("list_items")
    .select("list_id, business_id, kind")
    .eq("id", itemId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.business_id !== businessId || data.kind !== "photo") {
    return null;
  }
  return { listId: data.list_id };
}

/** Points the item at `path` (or at none), and removes the file it had. */
async function pointAt(
  actorId: string,
  itemId: string,
  path: string | null,
): Promise<
  { ok: true } | { ok: false; error: { code?: string; message: string } }
> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("set_list_item_photo", {
    actor: actorId,
    item: itemId,
    ...(path ? { new_path: path } : {}),
  });
  if (error) return { ok: false, error };
  if (data && isListPhotoPath(data)) {
    const removed = await admin.storage.from(LIST_PHOTO_BUCKET).remove([data]);
    if (removed.error) {
      // The item points at its new photo; the old file waits, unread by anyone.
      console.error("a replaced list photo stayed", removed.error.message);
    }
  }
  return { ok: true };
}

/**
 * Sets a photo item's photo, as the browser re-encoded it: checked (a JPEG
 * or WebP by its bytes, at most 400 KB, nothing from the camera inside, a
 * still picture of at most 1280 px), uploaded into its list's folder, pointed
 * at, and the photo it replaced removed. Returns where the app shows it.
 */
export async function setListItemPhoto(
  actorId: string,
  businessId: string,
  itemId: string,
  file: Blob,
): Promise<ListPhotoWrite> {
  const allowed = await listPhotosAllowed(businessId);
  if (allowed !== "yes") return { ok: false, failure: allowed };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkListPhoto({ type: file.type, size: file.size, bytes });
  if (!check.ok) return { ok: false, failure: check.problem };

  const item = await photoItem(businessId, itemId);
  if (!item) return { ok: false, failure: "noAccess" };

  const storage = createAdminClient().storage.from(LIST_PHOTO_BUCKET);
  const path = listPhotoPath(
    businessId,
    item.listId,
    newPhotoKey(),
    check.extension,
  );
  const uploaded = await storage.upload(path, bytes, {
    contentType: check.type,
    upsert: false,
  });
  if (uploaded.error) {
    console.error("a list photo upload failed", uploaded.error.message);
    return { ok: false, failure: "failed" };
  }

  const pointed = await pointAt(actorId, itemId, path);
  if (!pointed.ok) {
    // Nothing points at it: it goes.
    await storage.remove([path]);
    const failure = failureOf(pointed.error);
    // The database's own demo rule (55000, as a closed list's): which one it
    // was is the business's to say.
    if (
      failure === "finished" &&
      (await listPhotosAllowed(businessId)) === "demo"
    ) {
      return { ok: false, failure: "demo" };
    }
    return { ok: false, failure };
  }
  return { ok: true, photo: listPhotoSrc(path) };
}

/**
 * Removes a photo item's photo: the item is no longer done, and the file
 * goes. The screen read the photo's bytes first, for its undo, which sets
 * them again as a new photo.
 */
export async function removeListItemPhoto(
  actorId: string,
  businessId: string,
  itemId: string,
): Promise<ListPhotoWrite> {
  const item = await photoItem(businessId, itemId);
  if (!item) return { ok: false, failure: "noAccess" };
  const pointed = await pointAt(actorId, itemId, null);
  if (!pointed.ok) return { ok: false, failure: failureOf(pointed.error) };
  return { ok: true, photo: null };
}

/**
 * A list photo's bytes as the signed-in person may read them: downloaded
 * under their own session, so the bucket's policy decides (a list they see,
 * in their business, with lists on, an item pointing at the file). Null for
 * anything they may not read, or that isn't a photo the app stores.
 */
export async function listPhotoBytes(
  path: string,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; type: ListPhotoType } | null> {
  if (!isListPhotoPath(path)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(LIST_PHOTO_BUCKET)
    .download(path);
  if (error || !data) return null;
  const bytes = new Uint8Array(await data.arrayBuffer());
  const type = sniffPhotoType(bytes);
  return type === "image/jpeg" || type === "image/webp"
    ? { bytes, type }
    : null;
}

/** How many photos one clean-up removes at most, a batch at a time. */
const CLEAN_BATCH = 500;
const CLEAN_BATCHES = 20;

/**
 * The daily clean-up (`/cron/list-photos`): the photos older than their
 * business keeps them (`public.expired_list_photos`, by its `photoDays`)
 * are removed from Storage, and their items say so
 * (`public.forget_list_photos`), a batch at a time. Returns how many went.
 * A batch Storage refuses stops it; the rest wait for the next day.
 */
export async function cleanListPhotos(at?: Date): Promise<number> {
  const admin = createAdminClient();
  let removed = 0;
  for (let batch = 0; batch < CLEAN_BATCHES; batch += 1) {
    const { data, error } = await admin.rpc("expired_list_photos", {
      max_rows: CLEAN_BATCH,
      ...(at ? { at_time: at.toISOString() } : {}),
    });
    if (error) {
      if (isMissingFunction(error)) return removed;
      throw error;
    }
    const paths = (data ?? []).map((row) => row.path);
    if (paths.length === 0) return removed;
    // Only files in the app's own shape are asked of Storage; every path
    // listed is marked, so none is listed again tomorrow.
    const files = paths.filter((path) => isListPhotoPath(path));
    if (files.length > 0) {
      const gone = await admin.storage.from(LIST_PHOTO_BUCKET).remove(files);
      if (gone.error) {
        console.error("list photos stayed", gone.error.message);
        return removed;
      }
    }
    const marked = await admin.rpc("forget_list_photos", {
      paths,
      ...(at ? { at_time: at.toISOString() } : {}),
    });
    if (marked.error) throw marked.error;
    removed += files.length;
    if (paths.length < CLEAN_BATCH) return removed;
  }
  return removed;
}
