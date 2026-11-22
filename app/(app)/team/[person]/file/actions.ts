"use server";

import {
  acknowledgeFileDuties,
  getFileHolderState,
  hasEmployeeKeys,
  revealEmployeeFields,
} from "@db/employee-files";
import { REVEAL_FIELDS } from "@domain/employee-file";
import { phoneTail } from "@domain/employee-file-steps";
import { normalizeOtpCode } from "@domain/otp";
import { refresh } from "next/cache";
import { z } from "zod";
import { checkCode, sendCode, signInPhoneOf } from "../../../../(auth)/otp";
import { logged } from "../../../me/file/file-writer";
import { fileHolder } from "../../file-access";
import type {
  AcknowledgeAnswer,
  ConfirmFileCodeAnswer,
  KeepOpenAnswer,
  LockAnswer,
  RevealHolderAnswer,
  SendFileCodeAnswer,
} from "./holder-file-types";
import {
  fileOpenFor,
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
 * codes; only a right code for that number opens the files on this device
 * (the signed cookie of ./step-up), and a reveal without a fresh one never
 * reaches the database. Each reveal is logged there. Nothing typed and no
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
 * A code by SMS to open the files: only once the duties are confirmed and
 * the files can open on this deployment, so no code is spent on a file that
 * couldn't.
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
 * with the session's, and only then the files opened on this device.
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
    await openFileFor(who.businessId, who.userId);
    refresh();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...logged("checking a file code failed", error) };
  }
}

/**
 * One number of someone's file, in this answer only: a POST's, never cached
 * and never in a URL. Without a fresh step-up on this device it asks the
 * database nothing; each one shown is logged there (`employee.view`), and
 * slides the 15 minutes.
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
 * Activity on the open file: its 15 minutes start again, while it is still
 * open on this device. It never opens one.
 */
export async function keepFileOpenAction(
  business: string,
): Promise<KeepOpenAnswer> {
  const who = await fileHolder(business);
  if ("failure" in who) return { open: false };
  try {
    return { open: await keepFileOpen(who.businessId, who.userId) };
  } catch (error) {
    logged("keeping a file open failed", error);
    return { open: false };
  }
}

/**
 * "נעילת התיק", and the idle screen's own lock: the files close on this
 * device for whoever presses it, since closing opens nothing.
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
