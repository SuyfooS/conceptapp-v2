import "server-only";
import type { Address } from "@domain/address";
import {
  addressFromText,
  addressText,
  bankParts,
  contactFromText,
  contactRow,
  contactText,
  type DenialReason,
  detailsReply,
  type EmergencyContact,
  type EmployeeDetailsInput,
  emergencyContactInput,
  employeeDetailsInput,
  exportReply,
  FILE_DUTIES_VERSION,
  type FileDetailField,
  type FileFailure,
  type FileGroup,
  type FileRow,
  type FileStatus,
  type Form101Route,
  fileFailureOf,
  fileReply,
  identityParts,
  keyReply,
  maskedHint,
  type ReturnedReason,
  type RevealField,
  revealReply,
  statusRow,
  type TaxYearStatus,
} from "@domain/employee-file";
import { z } from "zod";
import {
  EmployeeDataUnreadable,
  employeeKeyRing,
  fromBase64,
  type KeyRing,
  newDataKey,
  open,
  type SealedColumn,
  seal,
  toBase64,
  unwrapDataKey,
  wrapDataKey,
} from "./crypto";
import type { Json } from "./database.types";
import { isMissingFunction } from "./missing";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

/*
 * The hiring file (profile H4, 20261126000200_employee_files.sql). Reads run
 * under the person's own session through the database's logged functions
 * (nothing selects the tables, the secret key included), and the sealed
 * values are opened here with the person's data key; writes go with the
 * secret key for `actor`, whom the database checks, after every value is
 * checked by @domain/employee-file and sealed by @db/crypto. Callers make
 * sure `actor` is the signed-in person and not viewing (`canWrite`).
 *
 * Without the keys on this deployment, every read and write of a file says
 * `keys` before it reaches the database, so no log row is written for a read
 * that couldn't be shown; only the completeness status works. Before the
 * migration reaches a project, `unavailable`.
 *
 * Never call these inside `'use cache'`, never with a value in a GET URL;
 * responses that carry a value set `Cache-Control: private, no-store` (H5's
 * and H6's routes). Nothing here logs a value: a failure logs its code and
 * the database's message, which hold none by design.
 */

export type FileReadFailure =
  | { ok: false; failure: "denied"; reason: DenialReason }
  | { ok: false; failure: "keys" | "unavailable" | "failed" };

/**
 * A write refused, in the screens' terms. In the week after a phone change
 * (`phoneHold`) it says the day a bank change opens again, a date only.
 */
export type FileWriteFailure = {
  ok: false;
  failure: FileFailure;
  opensOn?: string;
};

export type FileWriteResult = { ok: true } | FileWriteFailure;

/** A file as its screens show it: the plain part, and the sealed values opened. */
export type EmployeeFile = {
  ok: true;
  access: "self" | "holder";
  demo: boolean;
  file: FileRow | null;
  address: Address | null;
  email: string | null;
  workLanguage: string | null;
  /** Another document's name. */
  documentName: string | null;
  /** A relative holder's name. */
  holderName: string | null;
  emergency: EmergencyContact | null;
  /** The two numbers, as their last digits only: revealed one call at a time. */
  masked: { id: string | null; bankAccount: string | null };
  missing: FileGroup[];
  youthUntil: string | null;
  pensionDueOn: string | null;
  taxYears: {
    year: number;
    status: TaxYearStatus;
    route: Form101Route | null;
    returnedReason: ReturnedReason | null;
    changeDueBy: string | null;
  }[];
};

type Place = { business: string; user: string };

const fileTable = (column: SealedColumn, place: Place) => ({
  table: "employee_details" as const,
  column,
  business: place.business,
  user: place.user,
});

/** The phone hold's DETAIL: the day a bank change opens again, and nothing else. */
const OPENS_ON = /^\d{4}-\d{2}-\d{2}$/;

function failedWith(
  what: string,
  error: {
    code?: string;
    message: string;
    hint?: string | null;
    details?: string | null;
  },
): FileWriteFailure {
  if (isMissingFunction(error)) return { ok: false, failure: "unavailable" };
  const failure = fileFailureOf(error.code, error.hint);
  if (failure === "failed") console.error(what, error.code, error.message);
  // Only a date passes: whatever else a DETAIL might hold stays here.
  if (
    failure === "phoneHold" &&
    typeof error.details === "string" &&
    OPENS_ON.test(error.details)
  ) {
    return { ok: false, failure, opensOn: error.details };
  }
  return { ok: false, failure };
}

/** The data key a reply's key holds, or null (a demo's file has none). */
function dataKeyOf(
  ring: KeyRing,
  key: z.output<typeof keyReply> | null,
  place: Place,
): Buffer | null {
  return key
    ? unwrapDataKey(
        ring,
        key.kek_id,
        fromBase64(key.wrapped_dek),
        place.business,
        place.user,
      )
    : null;
}

/** A sealed text, opened, or null for none. */
function opened(
  dek: Buffer | null,
  sealed: string | null,
  column: SealedColumn,
  place: Place,
  demo: boolean,
): string | null {
  if (sealed === null) return null;
  return open(dek, fromBase64(sealed), fileTable(column, place), { demo });
}

/**
 * One file, for the signed-in person: their own, or someone's as a holder of
 * people.files (logged once a day), or why not (logged too).
 */
export async function getEmployeeFile(
  businessId: string,
  personId: string,
): Promise<EmployeeFile | FileReadFailure> {
  const ring = employeeKeyRing();
  if (!ring) return { ok: false, failure: "keys" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("employee_file", {
    business: businessId,
    person: personId,
  });
  if (error) {
    if (isMissingFunction(error)) return { ok: false, failure: "unavailable" };
    console.error("reading a file failed", error.code, error.message);
    return { ok: false, failure: "failed" };
  }
  const reply = fileReply.safeParse(data);
  if (!reply.success) return { ok: false, failure: "failed" };
  const answer = reply.data;
  if (answer.access === "denied") {
    return { ok: false, failure: "denied", reason: answer.reason };
  }
  const place = { business: businessId, user: personId };
  try {
    const dek = dataKeyOf(ring, answer.key, place);
    const text = (sealed: string | null, column: SealedColumn) =>
      opened(dek, sealed, column, place, answer.demo);
    const addressSealed = text(answer.sealed.address, "address_enc");
    const emergency = answer.sealed.emergency
      ? open(
          dek,
          fromBase64(answer.sealed.emergency),
          {
            table: "member_emergency_contacts",
            column: "contact_enc",
            ...place,
          },
          { demo: answer.demo },
        )
      : null;
    return {
      ok: true,
      access: answer.access,
      demo: answer.demo,
      file: answer.file,
      address:
        addressSealed === null
          ? null
          : addressFromText(addressSealed, answer.file?.city_code ?? null),
      email: text(answer.sealed.email, "email_enc"),
      workLanguage: text(answer.sealed.work_language, "work_language_enc"),
      documentName: text(answer.sealed.id_name, "id_name_enc"),
      holderName: text(answer.sealed.bank_holder, "bank_holder_enc"),
      emergency: emergency === null ? null : contactFromText(emergency),
      masked: {
        id: answer.file?.id_hint ? maskedHint(answer.file.id_hint) : null,
        bankAccount: answer.file?.bank_account_hint
          ? maskedHint(answer.file.bank_account_hint)
          : null,
      },
      missing: answer.missing,
      youthUntil: answer.youth_until,
      pensionDueOn: answer.pension_due_on,
      taxYears: answer.tax_years.map((year) => ({
        year: year.year,
        status: year.status,
        route: year.route,
        returnedReason: year.returned_reason,
        changeDueBy: year.change_due_by,
      })),
    };
  } catch (error) {
    if (error instanceof EmployeeDataUnreadable) {
      console.error("a file's sealed value did not open");
      return { ok: false, failure: "failed" };
    }
    throw error;
  }
}

/** The ID number, the account number or both, opened: each call is logged for a holder. */
export async function revealEmployeeFields(
  businessId: string,
  personId: string,
  fields: readonly RevealField[],
): Promise<
  { ok: true; id: string | null; bankAccount: string | null } | FileReadFailure
> {
  const ring = employeeKeyRing();
  if (!ring) return { ok: false, failure: "keys" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reveal_employee_fields", {
    business: businessId,
    person: personId,
    fields: [...fields],
  });
  if (error) {
    if (isMissingFunction(error)) return { ok: false, failure: "unavailable" };
    console.error("revealing failed", error.code, error.message);
    return { ok: false, failure: "failed" };
  }
  const reply = revealReply.safeParse(data);
  if (!reply.success) return { ok: false, failure: "failed" };
  const answer = reply.data;
  if (answer.access === "denied") {
    return { ok: false, failure: "denied", reason: answer.reason };
  }
  const place = { business: businessId, user: personId };
  try {
    const dek = dataKeyOf(ring, answer.key, place);
    return {
      ok: true,
      id: opened(dek, answer.sealed.id, "id_enc", place, answer.demo),
      bankAccount: opened(
        dek,
        answer.sealed.bank_account,
        "bank_account_enc",
        place,
        answer.demo,
      ),
    };
  } catch (error) {
    if (error instanceof EmployeeDataUnreadable) {
      console.error("a revealed value did not open");
      return { ok: false, failure: "failed" };
    }
    throw error;
  }
}

/** One file as the details for payroll take it (H6's sheet). */
export type ExportedFile = {
  userId: string;
  file: FileRow;
  id: string | null;
  documentName: string | null;
  address: Address | null;
  email: string | null;
  workLanguage: string | null;
  bankAccount: string | null;
  holderName: string | null;
  missing: FileGroup[];
  /** An account a holder hasn't confirmed: left out. */
  bankHeld: boolean;
};

/**
 * Every active manager's and worker's file, opened, for payroll: one
 * employee.export row is written before anything comes back.
 */
export async function exportEmployeeFiles(
  businessId: string,
  recipient: "provider" | "own",
): Promise<{ ok: true; files: ExportedFile[] } | FileReadFailure> {
  const ring = employeeKeyRing();
  if (!ring) return { ok: false, failure: "keys" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("export_employee_files", {
    business: businessId,
    recipient,
  });
  if (error) {
    if (isMissingFunction(error)) return { ok: false, failure: "unavailable" };
    console.error("the export failed", error.code, error.message);
    return { ok: false, failure: "failed" };
  }
  const reply = exportReply.safeParse(data);
  if (!reply.success) return { ok: false, failure: "failed" };
  const answer = reply.data;
  if (answer.access === "denied") {
    return { ok: false, failure: "denied", reason: answer.reason };
  }
  try {
    return {
      ok: true,
      files: answer.entries.map((entry) => {
        const place = { business: businessId, user: entry.user_id };
        const dek = dataKeyOf(ring, entry.key, place);
        const text = (sealed: string | null, column: SealedColumn) =>
          opened(dek, sealed, column, place, answer.demo);
        const address = text(entry.sealed.address, "address_enc");
        return {
          userId: entry.user_id,
          file: entry.file,
          id: text(entry.sealed.id, "id_enc"),
          documentName: text(entry.sealed.id_name, "id_name_enc"),
          address:
            address === null
              ? null
              : addressFromText(address, entry.file.city_code),
          email: text(entry.sealed.email, "email_enc"),
          workLanguage: text(entry.sealed.work_language, "work_language_enc"),
          bankAccount: text(entry.sealed.bank_account, "bank_account_enc"),
          holderName: text(entry.sealed.bank_holder, "bank_holder_enc"),
          missing: entry.missing,
          bankHeld: entry.bank_held,
        };
      }),
    };
  } catch (error) {
    if (error instanceof EmployeeDataUnreadable) {
      console.error("an exported value did not open");
      return { ok: false, failure: "failed" };
    }
    throw error;
  }
}

/**
 * How complete each active manager's and worker's file is, by person: with
 * the details for a holder, a count for whoever sees the team, nothing for
 * anyone else. Holds no value, so it works without the keys too.
 */
export async function getEmployeeFileStatus(
  businessId: string,
): Promise<Map<string, FileStatus>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("employee_file_status", {
    business: businessId,
  });
  if (error) {
    if (isMissingFunction(error)) return new Map();
    throw error;
  }
  const rows = z.array(statusRow).safeParse(data);
  if (!rows.success) return new Map();
  return new Map(rows.data.map((row) => [row.user_id, row]));
}

/** The staff's emergency contacts, opened, for whoever sees the team or holds the files. */
export async function getTeamEmergencyContacts(
  businessId: string,
): Promise<
  | { ok: true; contacts: Map<string, EmergencyContact> }
  | { ok: false; failure: "keys" | "unavailable" | "failed" }
> {
  const ring = employeeKeyRing();
  if (!ring) return { ok: false, failure: "keys" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("team_emergency_contacts", {
    business: businessId,
  });
  if (error) {
    if (isMissingFunction(error)) return { ok: false, failure: "unavailable" };
    console.error("reading the contacts failed", error.code, error.message);
    return { ok: false, failure: "failed" };
  }
  const rows = z.array(contactRow).safeParse(data);
  if (!rows.success) return { ok: false, failure: "failed" };
  const contacts = new Map<string, EmergencyContact>();
  try {
    for (const row of rows.data) {
      const place = { business: businessId, user: row.user_id };
      const dek =
        row.kek_id !== null && row.wrapped_dek !== null
          ? dataKeyOf(
              ring,
              { kek_id: row.kek_id, wrapped_dek: row.wrapped_dek },
              place,
            )
          : null;
      const contact = contactFromText(
        open(
          dek,
          fromBase64(row.contact),
          {
            table: "member_emergency_contacts",
            column: "contact_enc",
            ...place,
          },
          { demo: row.demo },
        ),
      );
      if (contact) contacts.set(row.user_id, contact);
    }
  } catch (error) {
    if (error instanceof EmployeeDataUnreadable) {
      console.error("an emergency contact did not open");
      return { ok: false, failure: "failed" };
    }
    throw error;
  }
  return { ok: true, contacts };
}

/** The duties screen confirmed, in the wording on screen now (H6 calls it). */
export async function acknowledgeFileDuties(
  businessId: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("acknowledge_file_duties", {
    business: businessId,
    duties_version: FILE_DUTIES_VERSION,
  });
  if (error) {
    if (isMissingFunction(error)) return false;
    throw error;
  }
  return data === true;
}

/** The person's data key, made once and kept wrapped: whatever the database kept. */
async function dataKeyFor(
  ring: KeyRing,
  actorId: string,
  businessId: string,
  personId: string,
): Promise<{ ok: true; dek: Buffer } | FileWriteFailure> {
  const offered = wrapDataKey(ring, newDataKey(), businessId, personId);
  const { data, error } = await createAdminClient().rpc("employee_data_key", {
    actor: actorId,
    business: businessId,
    person: personId,
    offered_kek: offered.kekId,
    offered_dek: toBase64(offered.wrapped),
  });
  if (error) return failedWith("making a file's key failed", error);
  const key = keyReply.safeParse(data);
  if (!key.success) return { ok: false, failure: "failed" };
  try {
    const dek = dataKeyOf(ring, key.data, {
      business: businessId,
      user: personId,
    });
    return dek ? { ok: true, dek } : { ok: false, failure: "failed" };
  } catch (error) {
    if (error instanceof EmployeeDataUnreadable) {
      console.error("a file's key did not open");
      return { ok: false, failure: "failed" };
    }
    throw error;
  }
}

/** What the person's own file holds now, opened, to leave out what they typed again. */
type Stored = {
  identity: string | null;
  address: string | null;
  email: string | null;
  workLanguage: string | null;
};

async function storedOfOwn(
  businessId: string,
  personId: string,
  input: EmployeeDetailsInput,
): Promise<Stored | null> {
  const file = await getEmployeeFile(businessId, personId);
  if (!file.ok || file.access !== "self" || !file.file) return null;
  let identity: string | null = null;
  if (input.identity && file.file.id_kind) {
    const revealed = await revealEmployeeFields(businessId, personId, ["id"]);
    if (revealed.ok && revealed.id !== null) {
      identity = JSON.stringify([
        file.file.id_kind,
        revealed.id,
        file.file.id_country,
        file.file.id_expires_on,
        file.documentName,
      ]);
    }
  }
  return {
    identity,
    address: file.address
      ? JSON.stringify([file.address.cityCode, addressText(file.address)])
      : null,
    email: file.email,
    workLanguage: file.workLanguage,
  };
}

/**
 * `actor` changes a person's file: the input checked whole (`invalid`, with no
 * value said), the account checked by Masav's rules (a warning goes through
 * and waits for a holder), each sealed group sealed with the person's key, and
 * for the person's own write, a sealed group typed again as stored left out,
 * so it doesn't make the 101 due again. `today` is the business's day. In
 * the week after a phone change a bank change is refused with the day it
 * opens again (`opensOn`).
 */
export async function saveEmployeeDetails(
  actorId: string,
  businessId: string,
  personId: string,
  input: unknown,
  today: string,
): Promise<
  | { ok: true; changed: FileDetailField[]; changeDueBy: string | null }
  | FileWriteFailure
> {
  const ring = employeeKeyRing();
  if (!ring) return { ok: false, failure: "keys" };
  const parsed = employeeDetailsInput(today).safeParse(input);
  if (!parsed.success) return { ok: false, failure: "invalid" };
  const details = parsed.data;
  const bank = details.bank ? bankParts(details.bank, today) : null;
  if (details.bank && !bank) return { ok: false, failure: "invalid" };

  const sealing =
    details.identity !== undefined ||
    Boolean(details.address) ||
    Boolean(details.email) ||
    Boolean(details.workLanguage) ||
    Boolean(details.bank);
  let dek: Buffer | null = null;
  if (sealing) {
    const key = await dataKeyFor(ring, actorId, businessId, personId);
    if (!key.ok) return key;
    dek = key.dek;
  }
  const place = { business: businessId, user: personId };
  const sealed = (text: string, column: SealedColumn) => {
    if (!dek) throw new EmployeeDataUnreadable();
    return toBase64(seal(dek, text, fileTable(column, place)));
  };
  const stored =
    actorId === personId && sealing
      ? await storedOfOwn(businessId, personId, details)
      : null;

  const patch: { [key: string]: Json | undefined } = {};
  if (details.names) {
    patch.names = { first: details.names.first, last: details.names.last };
  }
  if (details.birthDate !== undefined) patch.birth_date = details.birthDate;
  if (details.identity) {
    const parts = identityParts(details.identity);
    const same =
      stored?.identity ===
      JSON.stringify([
        parts.kind,
        parts.number,
        parts.country,
        parts.expiresOn,
        parts.name,
      ]);
    if (!same) {
      patch.identity = {
        kind: parts.kind,
        sealed: sealed(parts.number, "id_enc"),
        hint: parts.hint,
        ...(parts.country ? { country: parts.country } : {}),
        ...(parts.expiresOn ? { expires_on: parts.expiresOn } : {}),
        ...(parts.name
          ? { name_sealed: sealed(parts.name, "id_name_enc") }
          : {}),
      };
    }
  }
  if (details.address !== undefined) {
    if (details.address === null) {
      patch.address = null;
    } else {
      const text = addressText(details.address);
      if (
        stored?.address !== JSON.stringify([details.address.cityCode, text])
      ) {
        patch.address = {
          city_code: details.address.cityCode,
          sealed: sealed(text, "address_enc"),
        };
      }
    }
  }
  if (details.email !== undefined) {
    if (details.email === null) patch.email = null;
    else if (stored?.email !== details.email) {
      patch.email = sealed(details.email, "email_enc");
    }
  }
  if (details.workLanguage !== undefined) {
    if (details.workLanguage === null) patch.work_language = null;
    else if (stored?.workLanguage !== details.workLanguage) {
      patch.work_language = sealed(details.workLanguage, "work_language_enc");
    }
  }
  if (details.bank !== undefined) {
    patch.bank = bank
      ? {
          code: bank.code,
          branch: bank.branch,
          sealed: sealed(bank.account, "bank_account_enc"),
          hint: bank.hint,
          holder: bank.holder,
          ...(bank.holderName
            ? { holder_sealed: sealed(bank.holderName, "bank_holder_enc") }
            : {}),
          instruction: bank.instruction,
          check: bank.check,
        }
      : null;
  }
  if (details.pension) {
    patch.pension = {
      answer: details.pension.answer,
      ...(details.pension.fund ? { fund: details.pension.fund } : {}),
    };
  }
  if (details.changeOn) patch.change_on = details.changeOn;

  const { data, error } = await createAdminClient().rpc(
    "set_employee_details",
    { actor: actorId, business: businessId, person: personId, patch },
  );
  if (error) return failedWith("saving a file failed", error);
  const reply = detailsReply.safeParse(data);
  if (!reply.success) return { ok: false, failure: "failed" };
  return {
    ok: true,
    changed: reply.data.changed,
    changeDueBy: reply.data.change_due_by,
  };
}

/** The person's own emergency contact, sealed, or null to remove it. */
export async function saveEmergencyContact(
  actorId: string,
  businessId: string,
  contact: unknown,
): Promise<FileWriteResult> {
  const ring = employeeKeyRing();
  if (!ring) return { ok: false, failure: "keys" };
  let sealedContact: string | undefined;
  if (contact !== null) {
    const parsed = emergencyContactInput.safeParse(contact);
    if (!parsed.success) return { ok: false, failure: "invalid" };
    const key = await dataKeyFor(ring, actorId, businessId, actorId);
    if (!key.ok) return key;
    sealedContact = toBase64(
      seal(key.dek, contactText(parsed.data), {
        table: "member_emergency_contacts",
        column: "contact_enc",
        business: businessId,
        user: actorId,
      }),
    );
  }
  const { error } = await createAdminClient().rpc("set_emergency_contact", {
    actor: actorId,
    business: businessId,
    ...(sealedContact ? { sealed_contact: sealedContact } : {}),
  });
  return error ? failedWith("saving a contact failed", error) : { ok: true };
}

/** The person sends their file. */
export async function submitEmployeeFile(
  actorId: string,
  businessId: string,
): Promise<FileWriteResult> {
  if (!employeeKeyRing()) return { ok: false, failure: "keys" };
  const { error } = await createAdminClient().rpc("submit_employee_file", {
    actor: actorId,
    business: businessId,
  });
  return error ? failedWith("sending a file failed", error) : { ok: true };
}

/**
 * After the server checked a fresh SMS code (H5): the step-up a bank change
 * needs, a new account or the withdrawal of the one there, used once within
 * 10 minutes.
 */
export async function noteStepUp(
  actorId: string,
  purpose: "bank",
): Promise<FileWriteResult> {
  const { error } = await createAdminClient().rpc("note_step_up", {
    actor: actorId,
    step_purpose: purpose,
  });
  return error ? failedWith("noting a code failed", error) : { ok: true };
}

/** A holder confirms someone's new account, as the screen read it. */
export async function acknowledgeBank(
  actorId: string,
  businessId: string,
  personId: string,
  seenChangedAt: string,
): Promise<FileWriteResult> {
  if (!employeeKeyRing()) return { ok: false, failure: "keys" };
  const { error } = await createAdminClient().rpc("acknowledge_bank", {
    actor: actorId,
    business: businessId,
    person: personId,
    seen_changed_at: seenChangedAt,
  });
  return error
    ? failedWith("confirming an account failed", error)
    : { ok: true };
}

/** The person's "לא שיניתי" on their account's last change. */
export async function disputeBankChange(
  actorId: string,
  businessId: string,
): Promise<FileWriteResult> {
  if (!employeeKeyRing()) return { ok: false, failure: "keys" };
  const { error } = await createAdminClient().rpc("dispute_bank_change", {
    actor: actorId,
    business: businessId,
  });
  return error ? failedWith("disputing a change failed", error) : { ok: true };
}

/** A holder marks parts of a file "נמסר ישירות לשכר" (none takes the mark off). */
export async function setDirectGroups(
  actorId: string,
  businessId: string,
  personId: string,
  groups: readonly FileGroup[],
): Promise<FileWriteResult> {
  if (!employeeKeyRing()) return { ok: false, failure: "keys" };
  const { error } = await createAdminClient().rpc("set_direct_groups", {
    actor: actorId,
    business: businessId,
    person: personId,
    groups: [...groups],
  });
  return error ? failedWith("marking a file failed", error) : { ok: true };
}

/** A year's Form 101 marked, or its mark taken off (`status` null). */
export async function setTaxYearStatus(
  actorId: string,
  businessId: string,
  personId: string,
  input: {
    year: number;
    status: TaxYearStatus | null;
    route?: Form101Route;
    changedOn?: string;
    reason?: ReturnedReason;
  },
): Promise<FileWriteResult> {
  if (!employeeKeyRing()) return { ok: false, failure: "keys" };
  const { error } = await createAdminClient().rpc("set_tax_year_status", {
    actor: actorId,
    business: businessId,
    person: personId,
    for_year: input.year,
    ...(input.status ? { new_status: input.status } : {}),
    ...(input.route ? { via_route: input.route } : {}),
    ...(input.changedOn ? { changed_on: input.changedOn } : {}),
    ...(input.reason ? { why: input.reason } : {}),
  });
  return error ? failedWith("marking the 101 failed", error) : { ok: true };
}
