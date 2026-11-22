"use server";

import {
  checkBankChange,
  disputeBankChange,
  noteStepUp,
  revealEmployeeFields,
  saveEmergencyContact,
  saveEmployeeDetails,
  setTaxYearStatus,
  submitEmployeeFile,
} from "@db/employee-files";
import { checkBankAccount } from "@domain/bank-account";
import {
  employeeDetailsInput,
  PENSION_ANSWERS,
  REVEAL_FIELDS,
} from "@domain/employee-file";
import { form101SetupOf } from "@domain/employee-file-settings";
import { phoneTail } from "@domain/employee-file-steps";
import { ID_KINDS } from "@domain/identity-documents";
import { normalizeOtpCode } from "@domain/otp";
import { refresh } from "next/cache";
import { z } from "zod";
import { checkCode, sendCode, signInPhoneOf } from "../../../(auth)/otp";
import { rememberBankChangeSeen } from "../../business-cookie";
import type {
  ConfirmBankAnswer,
  FileWriteAnswer,
  RevealAnswer,
  SavedStep,
  SaveStepAnswer,
  SendCodeAnswer,
} from "./file-types";
import { type FileWriter, fileWriter, logged } from "./file-writer";

/*
 * The worker's own hiring file (profile H5a), each write bound on the page to
 * the business the screen was drawn for and made only as `fileWriter`
 * allows: by the session's own person, never while viewing as a role, in
 * that business, with the module on and them on the staff. What is typed is
 * checked here for its
 * shape and again, whole, by @domain/employee-file before it is sealed
 * (@db/employee-files), and by the database. What the business asks, and
 * how it takes Form 101, are read from its settings here, never from the
 * browser (H5b). Nothing typed is logged, anywhere: a failure logs its code.
 * Today's "אני שיניתי" is a route of its own (/home/bank-seen), since it is
 * held for its undo and a held action loses its cookie.
 */

/** The bank group as typed, checked by the domain whole, or null. */
function bankOf(bank: unknown, today: string) {
  const details = employeeDetailsInput(today).safeParse({ bank });
  return details.success ? (details.data.bank ?? null) : null;
}

/**
 * The account the person just saved here, kept as seen on this device by
 * the moment its save was dated (`at`), which the database keeps as the
 * change's own (`set_employee_details` dates `bank_changed_at` by its
 * `at_time`): never read again afterwards, so a change someone else made a
 * moment later is never the one kept, and never the screen's. The device
 * the change was made on doesn't ask "was it you?", and every other one
 * still does, so after a SIM swap the account's owner is still asked on
 * their own phone. The account is in either way: a cookie that can't be
 * kept leaves Today asking, and is logged by its code.
 */
async function keepOwnChangeSeen(who: FileWriter, at: Date): Promise<void> {
  try {
    await rememberBankChangeSeen({
      business: who.businessId,
      person: who.userId,
      changedAt: at.toISOString(),
    });
  } catch (error) {
    logged("keeping a new account seen failed", error);
  }
}

const typedDate = z.object({
  day: z.string(),
  month: z.string(),
  year: z.string(),
});

/**
 * Each step's groups and nothing else, by shape: the values are checked whole
 * by `employeeDetailsInput` in @db/employee-files. Identity with its names
 * and birth date (the number only when typed again); step 2's email (null
 * clears it) with the address, the work language and the emergency contact
 * where they show (H5b: null clears the language, and removes the contact);
 * the pension's answer.
 */
const STEP_INPUT = {
  identity: z
    .object({
      names: z.object({ first: z.string(), last: z.string() }),
      birthDate: typedDate,
      identity: z
        .object({ kind: z.enum(ID_KINDS) })
        .loose()
        .optional(),
    })
    .strict(),
  address: z
    .object({
      address: z.object({ kind: z.string() }).loose().nullable().optional(),
      email: z.string().nullable(),
      workLanguage: z.string().nullable().optional(),
      emergency: z
        .object({ name: z.string(), phone: z.string() })
        .strict()
        .nullable()
        .optional(),
    })
    .strict(),
  pension: z
    .object({ pension: z.object({ answer: z.enum(PENSION_ANSWERS) }).loose() })
    .strict(),
} as const satisfies Record<SavedStep, z.ZodType>;

/**
 * The person saves one step of their file. Step 2's emergency contact is
 * kept apart from the file (`member_emergency_contacts`), so it is saved
 * after the rest of the step, by its own write: a refusal of either is said,
 * and a second press saves both again, which changes nothing twice.
 */
export async function saveFileStepAction(
  business: string,
  step: SavedStep,
  input: unknown,
): Promise<SaveStepAnswer> {
  const who = await fileWriter(business);
  if ("failure" in who) return { ok: false, failure: who.failure };
  const schema = z.enum(["identity", "address", "pension"]).safeParse(step);
  if (!schema.success) return { ok: false, failure: "invalid" };
  if (!STEP_INPUT[schema.data].safeParse(input).success) {
    return { ok: false, failure: "invalid" };
  }
  const { emergency, ...rest } = input as { emergency?: unknown };
  try {
    const saved = await saveEmployeeDetails(
      who.userId,
      who.businessId,
      who.userId,
      rest,
      who.today,
    );
    if (!saved.ok) return { ok: false, failure: saved.failure };
    if (emergency !== undefined) {
      const contact = await saveEmergencyContact(
        who.userId,
        who.businessId,
        emergency,
      );
      if (!contact.ok) {
        refresh();
        return { ok: false, failure: contact.failure };
      }
    }
    refresh();
    return { ok: true, changeDueBy: saved.changeDueBy };
  } catch (error) {
    return { ok: false, ...logged("saving a file step failed", error) };
  }
}

/**
 * The person's own ID or account number, in this answer only: a POST's,
 * never cached and never in a URL. Their own read is not logged.
 */
export async function revealOwnAction(
  business: string,
  field: "id" | "bank_account",
): Promise<RevealAnswer> {
  const who = await fileWriter(business);
  if ("failure" in who) return { ok: false, failure: who.failure };
  const which = z.enum(REVEAL_FIELDS).safeParse(field);
  if (!which.success) return { ok: false, failure: "invalid" };
  try {
    const revealed = await revealEmployeeFields(who.businessId, who.userId, [
      which.data,
    ]);
    if (!revealed.ok) return { ok: false, failure: revealed.failure };
    return {
      ok: true,
      value: which.data === "id" ? revealed.id : revealed.bankAccount,
    };
  } catch (error) {
    return { ok: false, ...logged("revealing an own number failed", error) };
  }
}

/**
 * A code by SMS for a bank change, once the account as typed could be kept
 * but for the code (`checkBankChange`: the database's own rules, the week
 * after a phone change with the day it opens included), so no code goes on
 * what couldn't be. It goes to the number the person signs in with now, as
 * the auth server holds it (`signInPhoneOf`), never the profile's copy and
 * never one the browser sends; counted with the sign-in codes
 * (`private.auth_limits`).
 */
export async function sendBankCodeAction(
  business: string,
  input: { bank: unknown },
): Promise<SendCodeAnswer> {
  const who = await fileWriter(business);
  if ("failure" in who) return { ok: false, failure: who.failure };
  const parsed = z.object({ bank: z.unknown() }).strict().safeParse(input);
  if (!parsed.success || !bankOf(parsed.data.bank, who.today)) {
    return { ok: false, failure: "invalid" };
  }
  try {
    const keepable = await checkBankChange(
      who.userId,
      who.businessId,
      parsed.data.bank,
      who.today,
    );
    if (!keepable.ok) {
      return {
        ok: false,
        failure: keepable.failure,
        ...(keepable.opensOn ? { opensOn: keepable.opensOn } : {}),
        ...(keepable.opensAt ? { opensAt: keepable.opensAt } : {}),
      };
    }
    const phone = await signInPhoneOf(who.userId);
    const tail = phoneTail(phone);
    if (!phone || !tail) return { ok: false, failure: "noPhone" };
    const error = await sendCode(phone);
    if (error === null) return { ok: true, tail };
    switch (error) {
      case "rateLimit":
      case "tooMany":
      case "invalidPhone":
        return { ok: false, failure: error };
      default:
        return { ok: false, failure: "failed" };
    }
  } catch (error) {
    return { ok: false, ...logged("sending a bank code failed", error) };
  }
}

/**
 * The account, saved once the code is right: the code checked for the
 * number the person signs in with now (`checkCode`, on a client that keeps
 * no session, so this browser's session stays the person's whoever the
 * number turns out to be, and the check's own session is ended), whose it
 * was compared with the session's before anything is kept, the step-up
 * noted only then and only for them, and the account saved with it. The
 * account is checked for its shape before the code is spent, and was tried
 * whole before the code went (`sendBankCodeAction`). The save is dated
 * here, and that moment, the change's own, is kept as seen on this device
 * (`keepOwnChangeSeen`): Today doesn't ask the person who just typed it
 * here whether it was them, and every other device still does.
 */
export async function confirmBankAction(
  business: string,
  input: { code: string; bank: unknown },
): Promise<ConfirmBankAnswer> {
  const who = await fileWriter(business);
  if ("failure" in who) return { ok: false, failure: who.failure };
  const parsed = z
    .object({ code: z.string().max(20), bank: z.unknown() })
    .strict()
    .safeParse(input);
  if (!parsed.success) return { ok: false, failure: "invalid" };
  const bank = bankOf(parsed.data.bank, who.today);
  if (!bank) return { ok: false, failure: "invalid" };
  const code = normalizeOtpCode(parsed.data.code);
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
    // not, nothing is noted or kept for anyone, and nobody was signed in.
    if (verified.userId !== who.userId) {
      console.error("a bank code checked for another account");
      return { ok: false, failure: "failed" };
    }
    const noted = await noteStepUp(who.userId, "bank");
    if (!noted.ok) return { ok: false, failure: noted.failure };
    // Dated here, so the moment kept seen is this save's very own.
    const at = new Date();
    const saved = await saveEmployeeDetails(
      who.userId,
      who.businessId,
      who.userId,
      { bank: parsed.data.bank },
      who.today,
      { atTime: at },
    );
    if (!saved.ok) {
      return {
        ok: false,
        failure: saved.failure,
        ...(saved.opensOn ? { opensOn: saved.opensOn } : {}),
      };
    }
    if (saved.changed.includes("bank")) await keepOwnChangeSeen(who, at);
    refresh();
    const check = checkBankAccount(bank, who.today).status;
    return { ok: true, review: check === "warning" ? "warned" : "new" };
  } catch (error) {
    return { ok: false, ...logged("saving an account failed", error) };
  }
}

/**
 * The person marks this year's Form 101 handed in, by the way the business
 * takes it (its settings, never the browser's): on paper, or at the approved
 * system its link opens. None while the business takes it outside the app.
 */
export async function handInForm101Action(
  business: string,
): Promise<FileWriteAnswer> {
  const who = await fileWriter(business);
  if ("failure" in who) return { ok: false, failure: who.failure };
  const { way } = form101SetupOf(who.settings);
  if (way === "off") return { ok: false, failure: "invalid" };
  try {
    const marked = await setTaxYearStatus(
      who.userId,
      who.businessId,
      who.userId,
      { year: who.year, status: "handed_in", route: way },
    );
    if (!marked.ok) return { ok: false, failure: marked.failure };
    refresh();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...logged("marking the 101 failed", error) };
  }
}

/** The person sends their file to the business. */
export async function submitFileAction(
  business: string,
): Promise<FileWriteAnswer> {
  const who = await fileWriter(business);
  if ("failure" in who) return { ok: false, failure: who.failure };
  try {
    const sent = await submitEmployeeFile(who.userId, who.businessId);
    if (!sent.ok) return { ok: false, failure: sent.failure };
    refresh();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...logged("sending a file failed", error) };
  }
}

/**
 * "לא שיניתי" (H5b), on Today or in the bank step: the person says the
 * account's last change wasn't theirs. The database marks it for a holder
 * to look at (`bank_review` 'disputed'), and the screen, drawn again, says
 * so. Pressed at once, never held for an undo: it destroys nothing.
 */
export async function disputeBankChangeAction(
  business: string,
): Promise<FileWriteAnswer> {
  const who = await fileWriter(business);
  if ("failure" in who) return { ok: false, failure: who.failure };
  try {
    const disputed = await disputeBankChange(who.userId, who.businessId);
    if (!disputed.ok) return { ok: false, failure: disputed.failure };
    refresh();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...logged("disputing a bank change failed", error) };
  }
}
