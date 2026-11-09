"use server";

import {
  type PhotoResult,
  removeProfilePhoto,
  setProfilePhoto,
} from "@db/profile-photos";
import { type PhotoSaveResult, profilePhotoSrc } from "@domain/profile-photos";
import { canWrite } from "@domain/view-as";
import { refresh } from "next/cache";
import { currentMember } from "../member";

/**
 * The signed-in person, or why they may change nothing: the ConceptApp team
 * viewing as a role reads the screens only.
 */
async function self(): Promise<
  { userId: string } | { failure: "failed" | "viewOnly" }
> {
  const member = await currentMember();
  if (!member) return { failure: "failed" };
  if (!canWrite(member.viewing)) return { failure: "viewOnly" };
  return { userId: member.userId };
}

/** A photo's answer for the screen; never the file, in a log or anywhere. */
async function answer(
  run: () => Promise<PhotoResult>,
): Promise<PhotoSaveResult> {
  let result: PhotoResult;
  try {
    result = await run();
  } catch (error) {
    console.error(
      "profile photo failed",
      error instanceof Error ? error.message : "unknown",
    );
    return { ok: false, failure: "failed" };
  }
  if (!result.ok) return result;
  refresh();
  return { ok: true, photo: profilePhotoSrc(result.path) };
}

/** The signed-in person sets their photo, as the picker re-encoded it. */
export async function setMyPhotoAction(
  form: FormData,
): Promise<PhotoSaveResult> {
  const who = await self();
  if ("failure" in who) return { ok: false, failure: who.failure };
  const photo = form.get("photo");
  if (!(photo instanceof Blob)) return { ok: false, failure: "empty" };
  return await answer(() => setProfilePhoto(who.userId, photo));
}

/** The signed-in person removes their photo; their initials show again. */
export async function removeMyPhotoAction(): Promise<PhotoSaveResult> {
  const who = await self();
  if ("failure" in who) return { ok: false, failure: who.failure };
  return await answer(() => removeProfilePhoto(who.userId));
}
