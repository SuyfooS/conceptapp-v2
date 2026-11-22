"use server";

import { checkBankAccount } from "@domain/bank-account";
import { employeeDetailsInput } from "@domain/employee-file";
import type {
  ConfirmBankAnswer,
  FileWriteAnswer,
  RevealAnswer,
  SavedStep,
  SaveStepAnswer,
  SendCodeAnswer,
} from "../../../../(app)/me/file/file-types";
import {
  FILE_DEMO_CHANGE_DUE,
  FILE_DEMO_CODE,
  FILE_DEMO_NUMBERS,
  FILE_DEMO_TODAY,
  type FileDemoState,
} from "./data";

// Stand-ins for the file's writes on the twin, where nobody is signed in:
// the same checks of what is typed, a moment's wait, and nothing kept. The
// code step takes the twin's code and refuses any other, and "הצגה" shows
// the twin's made-up numbers. On `done`, whose 101 is handed in, a new
// address makes an updated one due, as a move does.

const pause = () => new Promise((resolve) => setTimeout(resolve, 400));

export async function demoSaveFileStepAction(
  state: FileDemoState,
  step: SavedStep,
  input: unknown,
): Promise<SaveStepAnswer> {
  await pause();
  if (!employeeDetailsInput(FILE_DEMO_TODAY).safeParse(input).success) {
    return { ok: false, failure: "invalid" };
  }
  return {
    ok: true,
    changeDueBy:
      state === "done" && step === "address" ? FILE_DEMO_CHANGE_DUE : null,
  };
}

export async function demoRevealAction(
  field: "id" | "bank_account",
): Promise<RevealAnswer> {
  await pause();
  return {
    ok: true,
    value:
      field === "id" ? FILE_DEMO_NUMBERS.id : FILE_DEMO_NUMBERS.bankAccount,
  };
}

export async function demoSendBankCodeAction(input: {
  bank: unknown;
}): Promise<SendCodeAnswer> {
  await pause();
  const parsed = employeeDetailsInput(FILE_DEMO_TODAY).safeParse({
    bank: input.bank,
  });
  if (!parsed.success || !parsed.data.bank) {
    return { ok: false, failure: "invalid" };
  }
  return { ok: true, tail: "0003" };
}

export async function demoConfirmBankAction(input: {
  code: string;
  bank: unknown;
}): Promise<ConfirmBankAnswer> {
  await pause();
  if (input.code !== FILE_DEMO_CODE) return { ok: false, failure: "wrongCode" };
  const parsed = employeeDetailsInput(FILE_DEMO_TODAY).safeParse({
    bank: input.bank,
  });
  const bank = parsed.success ? parsed.data.bank : null;
  if (!bank) return { ok: false, failure: "invalid" };
  const check = checkBankAccount(bank, FILE_DEMO_TODAY).status;
  return { ok: true, review: check === "warning" ? "warned" : "new" };
}

export async function demoHandInForm101Action(): Promise<FileWriteAnswer> {
  await pause();
  return { ok: true };
}

export async function demoSubmitFileAction(): Promise<FileWriteAnswer> {
  await pause();
  return { ok: true };
}
