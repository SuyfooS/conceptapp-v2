"use server";

import {
  acknowledgeBank,
  acknowledgeFileDuties,
  type FileWriteFailure,
  getFileHolderState,
  hasEmployeeKeys,
  markDirectGroup,
  phoneChangeHold,
  revealEmployeeFields,
} from "@db/employee-files";
import { FILE_GROUPS, REVEAL_FIELDS } from "@domain/employee-file";
import { phoneTail } from "@domain/employee-file-steps";
import { FILE_IDLE_MS } from "@domain/file-holders";
import { normalizeOtpCode } from "@domain/otp";
import { refresh } from "next/cache";
import { z } from "zod";
import { checkCode, sendCode, signInPhoneOf } from "../../../../(auth)/otp";
import { logged } from "../../../me/file/file-writer";
import { type FileHolder, fileHolder } from "../../file-access";
import type {
  AcknowledgeAnswer,
  ConfirmFileCodeAnswer,
  FileCodeHold,
  HolderWriteAnswer,
  HolderWriteFailure,
  KeepOpenAnswer,
  LockAnswer,
  MarkDirectAnswer,
  RevealHolderAnswer,
  SendFileCodeAnswer,
} from "./holder-file-types";
import {
  closedInDatabase,
  fileOpenFor,
  fileOpenLeft,
  forgetFileOpen,
  keepFileOpen,
  openFileFor,
} from "./step-up";

/*
 * A holder's actions on someone's hiring file (profile H6a), each bound on
 * the page to the business the screen was drawn for (the reveal to the
 * person too) and made only as `fileHolder` allows: the session's own
 * person, never while viewing as a role, in that business, with the module
 * on and people.files held. The duties go to the database under the
 * session; the SMS code goes to the number the holder signs in with now
 * (`signInPhoneOf`), never one a browser sends, counted with the sign-in
 * codes, and none in the week after the holder's own phone change; only a
 * right code for that number opens the files, on this sign-in in the
 * database and on this device in the signed cookie of ./step-up, and a
 * reveal without a fresh one never reaches the database, which asks for its
 * own as well (a refusal there locks the screen). Each reveal is logged
 * there. A holder's writes (H6b-1: an account confirmed, a part handed
 * directly) go with the secret key, so they ask the database's step-up for
 * this sign-in first, never the cookie alone, which "נעילת התיק" and
 * signing out can't take back from a copy: no live step-up there, no write,
 * and never on the session's own file. Whatever slides or closes the cookie
 * slides or closes the database's step-up with it. Nothing typed and no
 * value is logged here: a failure logs its code.
 */

/** "אישור ושליחת קוד": the duties confirmed in today's wording. */
export async function acknowledgeDutiesAction(
  business: string,
): Promise<AcknowledgeAnswer> {
  const who = await fileHolder(business);
  if ("failure" in who) return { ok: false, failure: who.failure };
  try {
    const confirmed = await acknowledgeFileDuties(who.businessId);
    if (!confirmed) return { ok: false, failure: "noAccess" };
    // Opened here already, within its 15 minutes: no code is needed.
    return { ok: true, open: await fileOpenFor(who.businessId, who.userId) };
  } catch (error) {
    return { ok: false, ...logged("confirming the duties failed", error) };
  }
}

/**
 * The week after the holder's own phone change, said with the day it ends
 * and the moment, before any code goes or is spent: the code would go to
 * the new number, which may not be theirs. Null when there is none.
 */
async function phoneHoldOf(
  who: FileHolder,
): Promise<FileCodeHold | { ok: false; failure: "failed" } | null> {
  const held = await phoneChangeHold(who.businessId, who.userId);
  if (!held.ok) return { ok: false, failure: "failed" };
  return held.hold ? { ok: false, failure: "phoneHold", ...held.hold } : null;
}

/**
 * A code by SMS to open the files: only once the duties are confirmed, the
 * files can open on this deployment and the week after a phone change is
 * over, so no code is spent on a file that couldn't.
 */
export async function sendFileCodeAction(
  business: string,
): Promise<SendFileCodeAnswer> {
  const who = await fileHolder(business);
  if ("failure" in who) return { ok: false, failure: who.failure };
  if (!hasEmployeeKeys()) return { ok: false, failure: "keys" };
  try {
    const state = await getFileHolderState(who.businessId);
    if (state === "ack" || state === "unavailable") {
      return { ok: false, failure: state };
    }
    if (state !== "ready") return { ok: false, failure: "noAccess" };
    const held = await phoneHoldOf(who);
    if (held) return held;
    const phone = await signInPhoneOf(who.userId);
    const tail = phoneTail(phone);
    if (!phone || !tail) return { ok: false, failure: "noPhone" };
    const error = await sendCode(phone);
    if (error === null) return { ok: true, tail };
    switch (error) {
      case "rateLimit":
      case "tooMany":
        return { ok: false, failure: error };
      case "invalidPhone":
        return { ok: false, failure: "noPhone" };
      default:
        return { ok: false, failure: "failed" };
    }
  } catch (error) {
    return { ok: false, ...logged("sending a file code failed", error) };
  }
}

/**
 * The code, checked for the number the holder signs in with now
 * (`checkCode`, on a client that keeps no session, so this browser's stays
 * the holder's whoever the number turns out to be), whose it was compared
 * with the session's, and only then the files opened, on this sign-in in
 * the database and then on this device. In the week after a phone change no
 * code is checked, so none is spent; one that started between the code's
 * send and now is refused when the files open, with its day.
 */
export async function confirmFileCodeAction(
  business: string,
  input: string,
): Promise<ConfirmFileCodeAnswer> {
  const who = await fileHolder(business);
  if ("failure" in who) return { ok: false, failure: who.failure };
  const typed = z.string().max(20).safeParse(input);
  const code = typed.success ? normalizeOtpCode(typed.data) : null;
  if (!code) return { ok: false, failure: "wrongCode" };
  try {
    const held = await phoneHoldOf(who);
    if (held) return held;
    const phone = await signInPhoneOf(who.userId);
    if (!phone) return { ok: false, failure: "noPhone" };
    const verified = await checkCode(phone, code);
    if ("error" in verified) {
      switch (verified.error) {
        case "rateLimit":
        case "tooMany":
          return { ok: false, failure: verified.error };
        case "failed":
          return { ok: false, failure: "failed" };
        default:
          return { ok: false, failure: "wrongCode" };
      }
    }
    // The code was the number's, so its owner is the session's own; if
    // not, nothing opens for anyone, and nobody was signed in.
    if (verified.userId !== who.userId) {
      console.error("a file code checked for another account");
      return { ok: false, failure: "failed" };
    }
    const opened = await openFileFor(who.businessId, who.userId);
    if (!opened.ok) return openRefused(opened);
    refresh();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...logged("checking a file code failed", error) };
  }
}

/** The database refused to open the files, in the code's terms. */
function openRefused(refused: FileWriteFailure): ConfirmFileCodeAnswer {
  switch (refused.failure) {
    case "phoneHold":
      return {
        ok: false,
        failure: "phoneHold",
        ...(refused.opensOn ? { opensOn: refused.opensOn } : {}),
      };
    case "off":
    case "ack":
    case "noAccess":
    case "unavailable":
      return { ok: false, failure: refused.failure };
    default:
      return { ok: false, failure: "failed" };
  }
}

/**
 * One number of someone's file, in this answer only: a POST's, never cached
 * and never in a URL. Without a fresh step-up on this device it asks the
 * database nothing; one the database no longer holds for this sign-in
 * closes the device's too, and the screen draws itself locked. Each one
 * shown is logged there (`employee.view`), and slides the 15 minutes.
 */
export async function revealHolderFieldAction(
  business: string,
  person: string,
  field: string,
): Promise<RevealHolderAnswer> {
  const who = await fileHolder(business);
  if ("failure" in who) return { ok: false, failure: who.failure };
  const whose = z.uuid().safeParse(person);
  const which = z.enum(REVEAL_FIELDS).safeParse(field);
  if (!whose.success || !which.success) {
    return { ok: false, failure: "failed" };
  }
  try {
    if (!(await fileOpenFor(who.businessId, who.userId))) {
      return { ok: false, failure: "stepUp" };
    }
    const revealed = await revealEmployeeFields(who.businessId, whose.data, [
      which.data,
    ]);
    if (!revealed.ok) {
      if (revealed.failure !== "denied") {
        return { ok: false, failure: revealed.failure };
      }
      switch (revealed.reason) {
        case "limit":
        case "ack":
          return { ok: false, failure: revealed.reason };
        case "off":
          return { ok: false, failure: "off" };
        case "step_up":
          await closedInDatabase();
          return { ok: false, failure: "stepUp" };
        default:
          return { ok: false, failure: "noAccess" };
      }
    }
    await keepFileOpen(who.businessId, who.userId);
    return {
      ok: true,
      value: which.data === "id" ? revealed.id : revealed.bankAccount,
    };
  } catch (error) {
    return { ok: false, ...logged("revealing a file's number failed", error) };
  }
}

/**
 * The moment the screen read for the account's last change, as the
 * database wrote it: a date and a time, a fraction of up to six digits and
 * an offset. Sent back unchanged, never through a `Date`, which would drop
 * the microseconds and answer "changed meanwhile" each time.
 */
const MOMENT =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?([+-]\d{2}(:\d{2})?|Z)$/;

/** A write the database refused, in the screen's terms. */
function writeFailure(
  refused: FileWriteFailure,
  invalid: HolderWriteFailure,
): HolderWriteFailure {
  switch (refused.failure) {
    case "moved":
      return "moved";
    case "invalid":
      return invalid;
    case "ack":
    case "off":
    case "demo":
    case "closed":
    case "notInTeam":
      return refused.failure;
    case "notStaff":
      return "notInTeam";
    case "own":
    case "ownerOnly":
    case "noAccess":
      return "noAccess";
    case "keys":
    case "unavailable":
      return "unavailable";
    default:
      return "failed";
  }
}

/**
 * "ראיתי את החשבון החדש" (and "בדקתי את מספר החשבון", "בדקתי עם נועה,
 * החשבון נכון"): someone's account confirmed as the screen read it,
 * `seenChangedAt` going back exactly as it came. Changed again meanwhile,
 * it says so and draws the screen with the newer change; confirmed by
 * someone else meanwhile, it says that. Never the session's own account,
 * and never without a live step-up for this sign-in in the database, asked
 * and slid there before any write (`keepFileOpen`), since the write goes
 * with the secret key. Logged there (`employee.bank_ack`).
 */
export async function acknowledgeBankAction(
  business: string,
  person: string,
  seenChangedAt: string,
): Promise<HolderWriteAnswer> {
  const who = await fileHolder(business);
  if ("failure" in who) return { ok: false, failure: who.failure };
  const whose = z.uuid().safeParse(person);
  const seen = z.string().max(40).regex(MOMENT).safeParse(seenChangedAt);
  if (!whose.success || !seen.success) {
    return { ok: false, failure: "failed" };
  }
  // The database refuses it too ('own'): the session's own file is /me/file.
  if (whose.data === who.userId) return { ok: false, failure: "noAccess" };
  try {
    // The database's word, not the cookie's: a copied cookie outlives the
    // lock and signing out. One it no longer holds closes the cookie too.
    if (!(await keepFileOpen(who.businessId, who.userId))) {
      return { ok: false, failure: "stepUp" };
    }
    const done = await acknowledgeBank(
      who.userId,
      who.businessId,
      whose.data,
      seen.data,
    );
    if (!done.ok) {
      const failure = writeFailure(done, "settled");
      // The newer change, or none left to confirm: the screen shows which.
      if (failure === "moved" || failure === "settled") refresh();
      return { ok: false, failure };
    }
    refresh();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...logged("confirming an account failed", error) };
  }
}

/**
 * "סימון שנמסר ישירות לשכר" on one part of someone's file, or "הסרת
 * הסימון" (`marked` false); the toast's "ביטול" sends the other one. The
 * database adds or takes off this one part, reading the stored marks under
 * the file's lock, so two holders' presses at once each keep the other's,
 * and a stale screen never sends a whole set back. It answers whether the
 * file changed: not when the part already was so (another holder's press
 * first), which offers no "ביטול", and an undo after someone else took the
 * change back writes nothing. A part the business doesn't ask is refused
 * for a mark. Never the session's own file (`set_direct_groups` doesn't
 * check it), and never without a live step-up for this sign-in in the
 * database, asked and slid there before any write (`keepFileOpen`), as for
 * an account. Logged there (`employee.direct`, for a change only), and the
 * page is drawn again either way, with the marks as they are.
 */
export async function markDirectGroupAction(
  business: string,
  person: string,
  group: string,
  marked: boolean,
): Promise<MarkDirectAnswer> {
  const who = await fileHolder(business);
  if ("failure" in who) return { ok: false, failure: who.failure };
  const whose = z.uuid().safeParse(person);
  const which = z.enum(FILE_GROUPS).safeParse(group);
  const mark = z.boolean().safeParse(marked);
  if (!whose.success || !which.success || !mark.success) {
    return { ok: false, failure: "failed" };
  }
  if (whose.data === who.userId) return { ok: false, failure: "noAccess" };
  try {
    if (!(await keepFileOpen(who.businessId, who.userId))) {
      return { ok: false, failure: "stepUp" };
    }
    const done = await markDirectGroup(
      who.userId,
      who.businessId,
      whose.data,
      which.data,
      mark.data,
    );
    if (!done.ok) return { ok: false, failure: writeFailure(done, "failed") };
    refresh();
    return { ok: true, changed: done.changed };
  } catch (error) {
    return { ok: false, ...logged("marking a file failed", error) };
  }
}

/**
 * Whether the open file is still open on this device, and how long it has
 * left; it never opens one. Only for the person's activity in the tab that
 * asks (`slide`: the file opening or shown again, a press or a key, coming
 * back to it) do its 15 minutes start again, the database's step-up for
 * this sign-in with the cookie (one it no longer holds closes the cookie). A
 * tab's own clock and another tab's word only read the cookie, asking the
 * database nothing and writing nothing, so tabs left alone never keep each
 * other open, and the files close 15 minutes after the last activity in any
 * tab. Anything but a plain `slide` true or false is refused.
 */
export async function keepFileOpenAction(
  business: string,
  slide: boolean,
): Promise<KeepOpenAnswer> {
  const who = await fileHolder(business);
  if ("failure" in who) return { open: false };
  const sliding = z.boolean().safeParse(slide);
  if (!sliding.success) return { open: false };
  try {
    if (sliding.data) {
      return (await keepFileOpen(who.businessId, who.userId))
        ? { open: true, leftMs: FILE_IDLE_MS }
        : { open: false };
    }
    const left = await fileOpenLeft(who.businessId, who.userId);
    return left === null ? { open: false } : { open: true, leftMs: left };
  } catch (error) {
    logged("keeping a file open failed", error);
    return { open: false };
  }
}

/**
 * "נעילת התיק", the one lock a screen asks for: the files close on this
 * device for whoever presses it, since closing opens nothing, the
 * database's step-up for this sign-in first and then the cookie. A file
 * that closes in one tab for any other reason forgets nothing: the step-up
 * goes by itself 15 minutes after the last activity.
 */
export async function lockFileAction(_business: string): Promise<LockAnswer> {
  try {
    await forgetFileOpen();
  } catch (error) {
    logged("locking the files failed", error);
  }
  refresh();
  return { ok: true };
}
