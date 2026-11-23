import "server-only";
import {
  closeFileStepUp,
  type FileWriteResult,
  keepFileStepUp,
  openFileStepUp,
} from "@db/employee-files";
import { fileStepUpAt, sealFileStepUp } from "@db/file-step-up";
import { currentAuthSession } from "@db/session";
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
 * can't set a cookie. The database holds the same step-up for this sign-in
 * (`private.file_step_ups`, 20261127000400_file_step_up.sql), opened, slid
 * and closed here with the cookie, and refuses a holder's read without it
 * (`step_up`, logged): the cookie is what the screens read first, the
 * database what a session asking it directly meets.
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

/** The cookie, sealed for the holder in the business at this moment. */
async function sealCookie(business: string, holder: string): Promise<void> {
  (await cookies()).set(
    FILE_STEP_UP_COOKIE,
    sealFileStepUp({ business, holder, atMs: Date.now() }),
    await stepUpCookieOptions(),
  );
}

async function forgetCookie(): Promise<void> {
  (await cookies()).delete({
    name: FILE_STEP_UP_COOKIE,
    path: FILE_STEP_UP_PATH,
  });
}

/** This sign-in's id, when it is the holder's own; else null, and nothing opens. */
async function sessionHere(holder: string): Promise<string | null> {
  const here = await currentAuthSession();
  return here && here.userId === holder ? here.sessionId : null;
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

/**
 * A right code was just taken: the files open for 15 minutes on this
 * sign-in, in the database first and then in the cookie, which is set only
 * once the database opened them. Refused there (the week after a phone
 * change, the duties, the module off), nothing opens. Actions only.
 */
export async function openFileFor(
  business: string,
  holder: string,
): Promise<FileWriteResult> {
  const session = await sessionHere(holder);
  if (!session) {
    console.error("a file code taken without this sign-in's own id");
    return { ok: false, failure: "failed" };
  }
  const opened = await openFileStepUp(holder, business, session);
  if (!opened.ok) return opened;
  await sealCookie(business, holder);
  return { ok: true };
}

/**
 * The person's own activity on an open file: its 15 minutes start again,
 * for a step-up that is still fresh only, in the cookie and the database,
 * so this never opens anything. One the database no longer holds (its own
 * 15 minutes, a lock on this sign-in) closes the cookie too. Whether it was
 * open, as the database says: what a holder's write, which goes with the
 * secret key, asks before it goes, since a copied cookie outlives the lock
 * and signing out. Actions only, and never for a screen's clock or for
 * another tab's word (`fileOpenLeft`).
 */
export async function keepFileOpen(
  business: string,
  holder: string,
): Promise<boolean> {
  if (!(await fileOpenFor(business, holder))) return false;
  const session = await sessionHere(holder);
  if (!session || !(await keepFileStepUp(holder, business, session))) {
    await forgetCookie();
    return false;
  }
  await sealCookie(business, holder);
  return true;
}

/**
 * The database said the files are closed on this sign-in (a read refused
 * `step_up`): the cookie goes too, so the screen draws itself locked.
 */
export async function closedInDatabase(): Promise<void> {
  await forgetCookie();
}

/**
 * Locked by hand ("נעילת התיק"), or on signing out: the files close on
 * this device, the database's step-up for this sign-in first. A failure
 * there is logged by its code and never in the way: the cookie goes all
 * the same, and the database's step-up by itself in 15 minutes.
 */
export async function forgetFileOpen(): Promise<void> {
  try {
    const here = await currentAuthSession();
    if (here) await closeFileStepUp(here.userId, here.sessionId);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : "without a code";
    console.error("closing the files on this sign-in failed", code);
  }
  await forgetCookie();
}
