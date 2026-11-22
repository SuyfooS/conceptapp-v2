"use server";

import { type Address, addressSchema } from "@domain/address";
import { checkBankAccount } from "@domain/bank-account";
import {
  addressText,
  emergencyContactInput,
  employeeDetailsInput,
} from "@domain/employee-file";
import type {
  ConfirmBankAnswer,
  FileWriteAnswer,
  RevealAnswer,
  SavedStep,
  SaveStepAnswer,
  SendCodeAnswer,
} from "../../../../(app)/me/file/file-types";
import {
  FILE_DEMO_ADDRESS,
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
// address makes an updated one due, as a move does; Noa's own typed again
// is no move, as the app leaves out an address saved as it is stored.

const pause = () => new Promise((resolve) => setTimeout(resolve, 400));

/** An address as the app compares it with the one stored: its city and its sealed text. */
const addressKey = (address: Address) =>
  JSON.stringify([address.cityCode, addressText(address)]);

/** Noa's, read as the app reads a stored one back. */
const STORED_ADDRESS = addressKey(addressSchema.parse(FILE_DEMO_ADDRESS));

export async function demoSaveFileStepAction(
  state: FileDemoState,
  step: SavedStep,
  input: unknown,
): Promise<SaveStepAnswer> {
  await pause();
  // The emergency contact goes apart from the file, as in the app (H5b).
  const { emergency, ...rest } =
    input && typeof input === "object"
      ? (input as { emergency?: unknown })
      : {};
  const parsed = employeeDetailsInput(FILE_DEMO_TODAY).safeParse(rest);
  if (!parsed.success) return { ok: false, failure: "invalid" };
  if (
    emergency !== undefined &&
    emergency !== null &&
    !emergencyContactInput.safeParse(emergency).success
  ) {
    return { ok: false, failure: "invalid" };
  }
  const moved =
    step === "address" &&
    parsed.data.address != null &&
    addressKey(parsed.data.address) !== STORED_ADDRESS;
  return {
    ok: true,
    changeDueBy: state === "done" && moved ? FILE_DEMO_CHANGE_DUE : null,
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

/** "לא שיניתי" in the bank step: nothing is marked; the step says it at once. */
export async function demoDisputeBankChangeAction(): Promise<FileWriteAnswer> {
  await pause();
  return { ok: true };
}
