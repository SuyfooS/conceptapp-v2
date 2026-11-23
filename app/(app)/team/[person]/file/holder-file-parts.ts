import type { EmployeeFile } from "@db/employee-files";
import {
  type EmployeeFileSettings,
  fileGroupsAsked,
  form101SetupOf,
} from "@domain/employee-file-settings";
import type { HolderFileData } from "./holder-file-types";

/**
 * A file read by a holder, as their screen shows it (profile H6a): each part
 * the business asks or the file holds, the numbers by their last digits
 * only, this year's 101 while the business takes it in the app. What the
 * screen doesn't show doesn't travel: no `has` flags, no row times but the
 * instruction's, the bank's change and when it was sent. The bank's change
 * goes exactly as the database wrote it, since confirming the account sends
 * it back (H6b-1), and a minor's file the open period's start, for the
 * checklist (H6b-2). Pure.
 */
export function holderFileOf(
  read: EmployeeFile,
  settings: EmployeeFileSettings,
  today: string,
): HolderFileData {
  const file = read.file;
  const year = Number(today.slice(0, 4));
  const asked = fileGroupsAsked({
    address: settings.askAddress,
    bank: settings.askBank,
  });
  const form101 = form101SetupOf(settings);
  const legalName =
    [file?.legal_first_name, file?.legal_last_name]
      .filter((part): part is string => Boolean(part?.trim()))
      .join(" ") || null;
  const heldContact =
    read.address !== null ||
    read.email !== null ||
    read.workLanguage !== null ||
    read.emergency !== null;
  const heldBank = file?.bank_code != null || read.masked.bankAccount !== null;
  const taxYear = read.taxYears.find((row) => row.year === year) ?? null;
  return {
    today,
    year,
    asked,
    missing: read.missing,
    direct: file?.direct_groups ?? [],
    form101:
      form101.way === "off"
        ? null
        : { provider: form101.way === "link" ? form101.provider : null },
    identity: {
      legalName,
      kind: file?.id_kind ?? null,
      country: file?.id_country ?? null,
      documentName: read.documentName,
      expiresOn: file?.id_expires_on ?? null,
      birthDate: file?.birth_date ?? null,
      masked: read.masked.id,
      youthUntil: read.youthUntil,
      minor:
        read.youthUntil !== null && read.youthUntil > today
          ? { startedOn: read.startedOn }
          : null,
    },
    contact:
      asked.includes("address") || heldContact
        ? {
            address: read.address,
            email: read.email,
            workLanguage: read.workLanguage,
            emergency: read.emergency,
          }
        : null,
    bank:
      asked.includes("bank") || heldBank
        ? {
            code: file?.bank_code ?? null,
            branch: file?.bank_branch ?? null,
            masked: read.masked.bankAccount,
            holder: file?.bank_holder_kind ?? null,
            holderName: read.holderName,
            instructionAt: file?.bank_instruction_at ?? null,
            review: file?.bank_review ?? null,
            changedAt: file?.bank_changed_at ?? null,
          }
        : null,
    pension: {
      answer: file?.pension_answer ?? null,
      fund: file?.pension_fund ?? null,
      dueOn: read.pensionDueOn,
    },
    taxYear:
      form101.way === "off" || !taxYear
        ? null
        : {
            status: taxYear.status,
            route: taxYear.route,
            returnedReason: taxYear.returnedReason,
            changeDueBy: taxYear.changeDueBy,
          },
    submittedAt: file?.submitted_at ?? null,
  };
}
