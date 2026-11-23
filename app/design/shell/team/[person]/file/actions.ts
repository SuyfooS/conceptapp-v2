"use server";

import { FILE_IDLE_MS } from "@domain/file-holders";
import type {
  AcknowledgeAnswer,
  ConfirmFileCodeAnswer,
  HolderWriteAnswer,
  KeepOpenAnswer,
  LockAnswer,
  MarkDirectAnswer,
  RevealHolderAnswer,
  SendFileCodeAnswer,
} from "../../../../../(app)/team/[person]/file/holder-file-types";
import { DEMO_HOLDER_NUMBERS } from "../../../data";
import { FILE_DEMO_CODE } from "../../../me/file/data";

// Stand-ins for a holder's actions on the file twin (profile H6a), where
// nobody is signed in: a moment's wait, and nothing kept. The duties are
// taken, a code "goes" to the number ending in 0014, the twin's code opens
// it and any other is wrong, "הצגה" shows the made-up numbers (or, on
// `limit`, says the hour's limit was reached), and keeping open and locking
// change nothing: the twin's address holds its state. A holder's writes
// (H6b-1) go, but for an account that changed again meanwhile (`moved`).

const pause = () => new Promise((resolve) => setTimeout(resolve, 300));

export async function demoAcknowledgeDutiesAction(): Promise<AcknowledgeAnswer> {
  await pause();
  return { ok: true, open: false };
}

/** The check's token comes along and goes nowhere: nothing is sent. */
export async function demoSendFileCodeAction(
  _captcha?: string,
): Promise<SendFileCodeAnswer> {
  await pause();
  return { ok: true, tail: "0014" };
}

export async function demoConfirmFileCodeAction(
  code: string,
): Promise<ConfirmFileCodeAnswer> {
  await pause();
  return code === FILE_DEMO_CODE
    ? { ok: true }
    : { ok: false, failure: "wrongCode" };
}

export async function demoRevealHolderAction(
  state: string,
  field: string,
): Promise<RevealHolderAnswer> {
  await pause();
  if (state === "limit") return { ok: false, failure: "limit" };
  return {
    ok: true,
    value:
      field === "id" ? DEMO_HOLDER_NUMBERS.id : DEMO_HOLDER_NUMBERS.bankAccount,
  };
}

export async function demoAcknowledgeBankAction(
  state: string,
  _seenChangedAt: string,
): Promise<HolderWriteAnswer> {
  await pause();
  return state === "moved" ? { ok: false, failure: "moved" } : { ok: true };
}

/** Every press changes the twin's file: its address is the state, drawn as asked. */
export async function demoMarkDirectAction(
  _group: string,
  _marked: boolean,
): Promise<MarkDirectAnswer> {
  await pause();
  return { ok: true, changed: true };
}

export async function demoKeepFileOpenAction(): Promise<KeepOpenAnswer> {
  return { open: true, leftMs: FILE_IDLE_MS };
}

export async function demoLockFileAction(): Promise<LockAnswer> {
  return { ok: true };
}
