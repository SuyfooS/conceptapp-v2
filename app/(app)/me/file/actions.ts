"use server";

import {
  checkBankChange,
  disputeBankChange,
  getEmployeeFile,
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
import {
  type EmployeeFileSettings,
  form101SetupOf,
} from "@domain/employee-file-settings";
import { phoneTail } from "@domain/employee-file-steps";
import { ID_KINDS } from "@domain/identity-documents";
import { canOpenModule } from "@domain/modules";
import { normalizeOtpCode } from "@domain/otp";
import { clockAt } from "@domain/today";
import { canWrite } from "@domain/view-as";
import { manifestFor } from "@modules/registry";
import { refresh } from "next/cache";
import { z } from "zod";
import { checkCode, sendCode, signInPhoneOf } from "../../../(auth)/otp";
import { rememberBankChangeSeen } from "../../business-cookie";
import { currentMember } from "../../member";
import { currentModuleSettings, currentModules } from "../../modules";
import type {
  ConfirmBankAnswer,
  FileActionFailure,
  FileWriteAnswer,
  RevealAnswer,
  SavedStep,
  SaveStepAnswer,
  SendCodeAnswer,
} from "./file-types";

/*
 * The worker's own hiring file (profile H5a), each write bound on the page to
 * the business the screen was drawn for: the business the app opens is one
 * cookie for the whole browser, so a step saved from a tab left open after a
 * switch is refused ("businessChanged"), never written in the other. The
 * person is always the session's, never an id from the browser; nothing
 * changes while viewing as a role; the module is on and the person on the
 * staff. What is typed is checked here for its shape and again, whole, by
 * @domain/employee-file before it is sealed (@db/employee-files), and by the
 * database. What the business asks, and how it takes Form 101, are read
 * from its settings here, never from the browser (H5b). Nothing typed is
 * logged, anywhere: a failure logs its code.
 */

type Self = {
  userId: string;
  businessId: string;
  today: string;
  year: number;
  /** The business's settings for the file, as stored (H5b). */
  settings: EmployeeFileSettings;
};

async function self(
  business: unknown,
): Promise<Self | { failure: FileActionFailure }> {
  const [member, enabled, settings] = await Promise.all([
    currentMember(),
    currentModules(),
    currentModuleSettings("employee_files"),
  ]);
  const membership = member?.membership;
  if (!member || !membership) return { failure: "failed" };
  if (!canWrite(member.viewing)) return { failure: "viewOnly" };
  if (business !== membership.business.id) {
    return { failure: "businessChanged" };
  }
  if (!canOpenModule(manifestFor("employee_files"), enabled, membership)) {
    return { failure: "off" };
  }
  const today = clockAt(new Date(), membership.business.place.timeZone).date;
  return {
    userId: member.userId,
    businessId: membership.business.id,
    today,
    year: Number(today.slice(0, 4)),
    settings,
  };
}

/** The bank group as typed, checked by the domain whole, or null. */
function bankOf(bank: unknown, today: string) {
  const details = employeeDetailsInput(today).safeParse({ bank });
  return details.success ? (details.data.bank ?? null) : null;
}

/** A write's error, by its code only: whatever it carries stays here. */
function logged(what: string, error: unknown): { failure: "failed" } {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : "without a code";
  console.error(what, code);
  return { failure: "failed" };
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
  const who = await self(business);
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
  const who = await self(business);
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
  const who = await self(business);
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
 * whole before the code went (`sendBankCodeAction`).
 */
export async function confirmBankAction(
  business: string,
  input: { code: string; bank: unknown },
): Promise<ConfirmBankAnswer> {
  const who = await self(business);
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
    const saved = await saveEmployeeDetails(
      who.userId,
      who.businessId,
      who.userId,
      { bank: parsed.data.bank },
      who.today,
    );
    if (!saved.ok) {
      return {
        ok: false,
        failure: saved.failure,
        ...(saved.opensOn ? { opensOn: saved.opensOn } : {}),
      };
    }
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
  const who = await self(business);
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
  const who = await self(business);
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
 * "לא שיניתי" on Today (H5b): the person says the account's last change
 * wasn't theirs. The database marks it for a holder to look at
 * (`bank_review` 'disputed'), and Today, drawn again, says so. Pressed on
 * Today itself, never held for an undo: it destroys nothing.
 */
export async function disputeBankChangeAction(
  business: string,
): Promise<FileWriteAnswer> {
  const who = await self(business);
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

/**
 * "אני שיניתי" or "הבנתי" on Today (H5b): the account's last change is kept
 * as seen on this device (`rememberBankChangeSeen`), by the moment the
 * database gives it, read again here and never taken from the screen, so a
 * later change is told again. A direct call from Today, so its cookie
 * arrives (a forwarded action loses it). Nothing while viewing as a role.
 */
export async function seenBankChangeAction(
  business: string,
): Promise<FileWriteAnswer> {
  const who = await self(business);
  if ("failure" in who) return { ok: false, failure: who.failure };
  try {
    const read = await getEmployeeFile(who.businessId, who.userId);
    if (!read.ok) {
      return {
        ok: false,
        failure:
          read.failure !== "denied"
            ? read.failure
            : read.reason === "off"
              ? "off"
              : read.reason === "viewing"
                ? "viewOnly"
                : "failed",
      };
    }
    const changedAt = read.file?.bank_changed_at ?? null;
    if (changedAt !== null) {
      await rememberBankChangeSeen(who.businessId, changedAt);
    }
    refresh();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...logged("keeping a bank change seen failed", error) };
  }
}
