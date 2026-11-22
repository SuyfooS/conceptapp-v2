import "server-only";
import { fileStepUpAt, sealFileStepUp } from "@db/file-step-up";
import {
  FILE_IDLE_MS,
  FILE_STEP_UP_COOKIE,
  FILE_STEP_UP_PATH,
  stepUpLeft,
} from "@domain/file-holders";
import { cookies } from "next/headers";
import { requestOrigin } from "@/app/origin";

/*
 * A holder's step-up on this device (profile H6a, @db/file-step-up): a
 * cookie the server signs, holding the business, the holder and the moment
 * a right SMS code was taken, never a value. httpOnly, sent only to the
 * team's screens and never from another site (strict), Secure wherever the
 * app runs on https, and gone 15 minutes after the last activity. Read in a
 * page; set, slid and deleted by the file's actions alone, since a page
 * can't set a cookie. The database doesn't enforce it: a holder's own
 * session reading a file directly gets only sealed values, logged.
 */

async function stepUpCookieOptions() {
  const secure = (await requestOrigin()).startsWith("https://");
  return {
    httpOnly: true,
    secure,
    sameSite: "strict" as const,
    path: FILE_STEP_UP_PATH,
    maxAge: FILE_IDLE_MS / 1000,
  };
}

/**
 * How long the holder's files in the business stay open on this device,
 * with no activity before then: null while they are closed. Reads the
 * step-up and never seals it again, so it slides nothing.
 */
export async function fileOpenLeft(
  business: string,
  holder: string,
): Promise<number | null> {
  const value = (await cookies()).get(FILE_STEP_UP_COOKIE)?.value;
  return stepUpLeft(fileStepUpAt(value, { business, holder }), Date.now());
}

/** Whether the holder's files in the business are open on this device now. */
export async function fileOpenFor(
  business: string,
  holder: string,
): Promise<boolean> {
  return (await fileOpenLeft(business, holder)) !== null;
}

/** A right code was just taken: the files open for 15 minutes. Actions only. */
export async function openFileFor(
  business: string,
  holder: string,
): Promise<void> {
  (await cookies()).set(
    FILE_STEP_UP_COOKIE,
    sealFileStepUp({ business, holder, atMs: Date.now() }),
    await stepUpCookieOptions(),
  );
}

/**
 * The person's own activity on an open file: its 15 minutes start again,
 * for a step-up that is still fresh only, so this never opens anything.
 * Whether it was open. Actions only, and never for a screen's clock or for
 * another tab's word (`fileOpenLeft`).
 */
export async function keepFileOpen(
  business: string,
  holder: string,
): Promise<boolean> {
  if (!(await fileOpenFor(business, holder))) return false;
  await openFileFor(business, holder);
  return true;
}

/** Locked by hand ("נעילת התיק"), or on signing out: the files close on this device. */
export async function forgetFileOpen(): Promise<void> {
  (await cookies()).delete({
    name: FILE_STEP_UP_COOKIE,
    path: FILE_STEP_UP_PATH,
  });
}
