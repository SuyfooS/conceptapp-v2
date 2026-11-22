"use server";

import {
  noteStepUp,
  revealEmployeeFields,
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
import { phoneTail } from "@domain/employee-file-steps";
import { ID_KINDS } from "@domain/identity-documents";
import { canOpenModule } from "@domain/modules";
import { normalizeOtpCode } from "@domain/otp";
import { clockAt } from "@domain/today";
import { canWrite } from "@domain/view-as";
import { manifestFor } from "@modules/registry";
import { refresh } from "next/cache";
import { z } from "zod";
import { sendCode, verifyCode } from "../../../(auth)/otp";
import { currentMember } from "../../member";
import { currentModules } from "../../modules";
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
 * database. Nothing typed is logged, anywhere: a failure logs its code.
 */

type Self = {
  userId: string;
  businessId: string;
  phone: string | null;
  today: string;
  year: number;
};

async function self(
  business: unknown,
): Promise<Self | { failure: FileActionFailure }> {
  const [member, enabled] = await Promise.all([
    currentMember(),
    currentModules(),
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
    phone: member.phone,
    today,
    year: Number(today.slice(0, 4)),
  };
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
 * and birth date (the number only when typed again), the address with its
 * email (null clears it), the pension's answer.
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
      address: z.object({ kind: z.string() }).loose(),
      email: z.string().nullable(),
    })
    .strict(),
  pension: z
    .object({ pension: z.object({ answer: z.enum(PENSION_ANSWERS) }).loose() })
    .strict(),
} as const satisfies Record<SavedStep, z.ZodType>;

/** The person saves one step of their file. */
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
  try {
    const saved = await saveEmployeeDetails(
      who.userId,
      who.businessId,
      who.userId,
      input,
      who.today,
    );
    if (!saved.ok) return { ok: false, failure: saved.failure };
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
 * A code by SMS for a bank change, to the person's own number as the
 * database keeps it (`own_phone`), never one the browser sends; counted with
 * the sign-in codes (`private.auth_limits`).
 */
export async function sendBankCodeAction(
  business: string,
): Promise<SendCodeAnswer> {
  const who = await self(business);
  if ("failure" in who) return { ok: false, failure: who.failure };
  const tail = phoneTail(who.phone);
  if (!who.phone || !tail) return { ok: false, failure: "noPhone" };
  try {
    const error = await sendCode(who.phone);
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
 * person's own number (`verifyCode`, which renews their own session's
 * cookies on the way, as signing in does: a call from the screen itself,
 * never a held write), the step-up noted only then and only for them, and
 * the account saved with it. The account is checked before the code is
 * spent, so a code never goes on what couldn't be kept.
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
  const details = employeeDetailsInput(who.today).safeParse({
    bank: parsed.data.bank,
  });
  const bank = details.success ? details.data.bank : null;
  if (!bank) return { ok: false, failure: "invalid" };
  const code = normalizeOtpCode(parsed.data.code);
  if (!code) return { ok: false, failure: "wrongCode" };
  if (!who.phone) return { ok: false, failure: "noPhone" };
  try {
    const verified = await verifyCode(who.phone, code);
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
    // not, nothing is noted for anyone.
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

/** The person marks this year's Form 101 handed in, on paper (H5a's one route). */
export async function handInForm101Action(
  business: string,
): Promise<FileWriteAnswer> {
  const who = await self(business);
  if ("failure" in who) return { ok: false, failure: who.failure };
  try {
    const marked = await setTaxYearStatus(
      who.userId,
      who.businessId,
      who.userId,
      { year: who.year, status: "handed_in", route: "print" },
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
