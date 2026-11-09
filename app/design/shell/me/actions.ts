"use server";

import { checkProfileChange, type ProfileSaveResult } from "@domain/profile";
import type { PhotoSaveResult } from "@domain/profile-photos";

// Stand-ins for the profile's actions on the design demo, where nobody is
// signed in: nothing is stored. A saved photo, line, cover or form of address
// stays on the screen until the page is left.

export async function demoSetPhotoAction(
  form: FormData,
): Promise<PhotoSaveResult> {
  const photo = form.get("photo");
  if (!(photo instanceof Blob)) return { ok: false, failure: "empty" };
  const bytes = Buffer.from(await photo.arrayBuffer());
  return {
    ok: true,
    photo: `data:${photo.type};base64,${bytes.toString("base64")}`,
  };
}

export async function demoRemovePhotoAction(): Promise<PhotoSaveResult> {
  return { ok: true, photo: null };
}

/** The same checks as the real one, and nothing kept. */
export async function demoSaveProfileAction(
  change: unknown,
): Promise<ProfileSaveResult> {
  const checked = checkProfileChange(change);
  return checked.ok ? { ok: true } : { ok: false, failure: checked.problem };
}
