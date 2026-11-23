import { z } from "zod";
import { type Address, addressSchema } from "./address";
import {
  accountHint,
  type BankWarning,
  checkBankAccount,
} from "./bank-account";
import {
  documentHint,
  type IdentityDocument,
  identityDocumentSchema,
} from "./identity-documents";
import { israeliIdHint } from "./israeli-id";
import { PENSION_FUND_KEYS } from "./pension-funds";
import { normalizeIsraeliMobile } from "./phone";
import { type DateParts, parseTypedDate } from "./typed-date";
import { oneLineSchema } from "./typed-text";
import { addYears } from "./youth";

/*
 * The hiring file (תיק עובד, profile H4; issue #82 §2): what a business needs
 * of a worker to pay them, kept per business and person in
 * `public.employee_details` and read only through the database's logged
 * functions (20261126000200_employee_files.sql). The ID number, the address
 * apart from its city, the email, the work language, the account number, the
 * holder's name and the emergency contact are sealed in server code
 * (`@db/crypto`) before they reach the database; the rest is plain text. Pure:
 * the checks and the shapes, the same in the browser and on the server, and
 * the replies as the database gives them.
 */

/** The parts of a file payroll needs, in the order the screens show them. */
export const FILE_GROUPS = ["identity", "address", "bank", "pension"] as const;
export type FileGroup = (typeof FILE_GROUPS)[number];

/**
 * What a write changed, as the log names it (`employee.details`), in order.
 * Names only: the log never holds a value or a hint.
 */
export const FILE_DETAIL_FIELDS = [
  "names",
  "birth_date",
  "identity",
  "address",
  "email",
  "work_language",
  "bank",
  "pension",
] as const;
export type FileDetailField = (typeof FILE_DETAIL_FIELDS)[number];

/** What a view read, as the log names it (`employee.view`). */
export const FILE_VIEW_FIELDS = ["file", "id", "bank_account"] as const;
export type FileViewField = (typeof FILE_VIEW_FIELDS)[number];

/** The two numbers a holder reveals one at a time. */
export const REVEAL_FIELDS = ["id", "bank_account"] as const;
export type RevealField = (typeof REVEAL_FIELDS)[number];

/**
 * Why a read was refused (`employee.view_denied`): in a view session, not a
 * member (never says more), without the permission, before the duties
 * screen, a holder with no live SMS code on this sign-in (`step_up`,
 * 20261127000400_file_step_up.sql), too many reveals in an hour, "and more
 * today" after the twentieth, or the module off (never logged).
 */
export const DENIAL_REASONS = [
  "viewing",
  "not_member",
  "not_holder",
  "ack",
  "step_up",
  "limit",
  "many",
  "off",
] as const;
export type DenialReason = (typeof DENIAL_REASONS)[number];

/**
 * Whether the signed-in person may read the business's files as a holder
 * now, as `public.file_holder_state` answers it before any file is read
 * (profile H6a), never logged: ready, the duties screen first (`ack`), in a
 * view session, not a member, without the permission, or the module off.
 */
export const FILE_HOLDER_STATES = [
  "ready",
  "ack",
  "viewing",
  "not_member",
  "not_holder",
  "off",
] as const;
export type FileHolderState = (typeof FILE_HOLDER_STATES)[number];

/** `public.file_holder_state`'s answer: null for nobody signed in. */
export const holderStateReply = z.enum(FILE_HOLDER_STATES).nullable();

/**
 * The duties screen's wording version (reg 7(ב)): a holder confirms it before
 * any file opens. `private.file_duties_version()` holds the same
 * (`employee-files.db.test.ts`); new words are a new version, confirmed again.
 */
export const FILE_DUTIES_VERSION = "2026-11-v1";

/** The bank instruction's wording version (`private.bank_instruction_versions()`). */
export const BANK_INSTRUCTION_VERSION = "v1";

export const PENSION_ANSWERS = [
  "existing",
  "new",
  "employer",
  "later",
] as const;
export type PensionAnswer = (typeof PENSION_ANSWERS)[number];

/** Answers that carry a fund: a fund they are in, or one they chose. */
const WITH_FUND: readonly PensionAnswer[] = ["existing", "new"];

export const TAX_YEAR_STATUSES = [
  "handed_in",
  "accepted",
  "returned",
  "change_due",
] as const;
export type TaxYearStatus = (typeof TAX_YEAR_STATUSES)[number];

export const FORM101_ROUTES = ["link", "print", "direct"] as const;
export type Form101Route = (typeof FORM101_ROUTES)[number];

export const RETURNED_REASONS = [
  "attachment",
  "signature",
  "details",
  "other",
] as const;
export type ReturnedReason = (typeof RETURNED_REASONS)[number];

/** What a holder has to look at about an account: new, failed its check, or "לא שיניתי". */
export const BANK_REVIEWS = ["new", "warned", "disputed"] as const;
export type BankReview = (typeof BANK_REVIEWS)[number];

/**
 * A pension fund's key from the dated list, or "unknown" (@domain/pension-funds).
 * The database checks the shape only, so a list that changes needs no
 * migration.
 */
const fundKey = z.enum(PENSION_FUND_KEYS);

const day = z.iso.date();

/** A birth date as three typed numbers, read by `parseTypedDate`. */
const dateParts = z.object({
  day: z.string(),
  month: z.string(),
  year: z.string(),
}) satisfies z.ZodType<DateParts>;

/** A birth date that is a real day, not after `today`, within 100 years (P5's rule). */
export function birthDateSchema(today: string) {
  return dateParts.transform((parts, ctx) => {
    const typed = parseTypedDate(parts);
    if (!typed.ok) {
      ctx.addIssue({ code: "custom", message: "birthDate" });
      return z.NEVER;
    }
    if (typed.date > today || typed.date < addYears(today, -100)) {
      ctx.addIssue({ code: "custom", message: "birthDateRange" });
      return z.NEVER;
    }
    return typed.date;
  });
}

/**
 * The most characters a typed line of the file holds, as the schemas below
 * and the database keep them, so a screen says a longer one under its field
 * before anything is sent: each name as on the document, the email, and a
 * relative's name on the account.
 */
export const FILE_TEXT_MAX = { name: 60, email: 120, holderName: 80 } as const;

const bankInput = z
  .object({
    bank: z.int().min(1).max(999),
    branch: z.int().min(0).max(999),
    /** Digits as typed; the check gives its stored form. */
    account: z.string().max(40),
    holder: z.enum(["self", "family"]),
    holderName: oneLineSchema(2, FILE_TEXT_MAX.holderName).optional(),
    instruction: z.literal(BANK_INSTRUCTION_VERSION),
  })
  .refine(
    (bank) => (bank.holder === "family") === (bank.holderName !== undefined),
    { message: "holderName", path: ["holderName"] },
  );

const pensionInput = z
  .object({
    answer: z.enum(PENSION_ANSWERS),
    fund: fundKey.optional(),
  })
  .refine(
    (pension) =>
      pension.fund === undefined || WITH_FUND.includes(pension.answer),
    { message: "fund", path: ["fund"] },
  );

/**
 * What a screen sends to change a file, each group present meaning "this
 * changes" (null clears what may be cleared), checked before anything is
 * sealed or sent. `today` is the business's day: a birth date is never after
 * it, and a change is dated on or before it.
 */
export function employeeDetailsInput(today: string) {
  return z
    .object({
      names: z
        .object({
          first: oneLineSchema(1, FILE_TEXT_MAX.name),
          last: oneLineSchema(1, FILE_TEXT_MAX.name),
        })
        .optional(),
      birthDate: birthDateSchema(today).nullable().optional(),
      identity: identityDocumentSchema.optional(),
      address: addressSchema.nullable().optional(),
      email: z
        .string()
        .trim()
        .max(FILE_TEXT_MAX.email)
        .pipe(z.email())
        .nullable()
        .optional(),
      workLanguage: oneLineSchema(2, 40).nullable().optional(),
      bank: bankInput.nullable().optional(),
      pension: pensionInput.optional(),
      /** The day something changed in the person's life, for the 101 (default today). */
      changeOn: day
        .refine((on) => on <= today && on >= addYears(today, -1), {
          message: "changeOn",
        })
        .optional(),
    })
    .strict();
}

export type EmployeeDetailsInput = z.output<
  ReturnType<typeof employeeDetailsInput>
>;

/** The parts of an identity document: what is sealed, and what stays plain. */
export type IdentityParts = {
  kind: IdentityDocument["kind"];
  /** Sealed. */
  number: string;
  hint: string;
  country: string | null;
  expiresOn: string | null;
  /** Sealed; another document's name. */
  name: string | null;
};

export function identityParts(document: IdentityDocument): IdentityParts {
  switch (document.kind) {
    case "il":
      return {
        kind: "il",
        number: document.number,
        hint: israeliIdHint(document.number),
        country: null,
        expiresOn: null,
        name: null,
      };
    case "passport":
      return {
        kind: "passport",
        number: document.number,
        hint: documentHint(document.number),
        country: document.country,
        expiresOn: document.expiresOn ?? null,
        name: null,
      };
    case "other":
      return {
        kind: "other",
        number: document.number,
        hint: documentHint(document.number),
        country: document.country ?? null,
        expiresOn: document.expiresOn ?? null,
        name: document.name,
      };
  }
}

/**
 * An address as sealed: everything but the city, whose code stays plain, as
 * JSON with its keys in one order, so the same address seals from the same
 * text.
 */
export function addressText(address: Address): string {
  switch (address.kind) {
    case "street":
      return JSON.stringify({
        kind: address.kind,
        street: address.street,
        number: address.number,
        apartment: address.apartment,
        zip: address.zip,
      });
    case "area":
      return JSON.stringify({
        kind: address.kind,
        area: address.area,
        number: address.number,
        apartment: address.apartment,
        zip: address.zip,
      });
    case "poBox":
      return JSON.stringify({
        kind: address.kind,
        poBox: address.poBox,
        zip: address.zip,
      });
  }
}

/** The address an opened text and its city make, or null when they don't. */
export function addressFromText(
  text: string,
  cityCode: number | null,
): Address | null {
  if (cityCode === null) return null;
  try {
    const parsed = addressSchema.safeParse({
      ...(JSON.parse(text) as object),
      cityCode,
    });
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** A bank account's parts, from what was typed: sealed, plain, and what the check said. */
export type BankParts = {
  code: number;
  branch: number;
  /** Sealed, in its stored form. */
  account: string;
  hint: string;
  holder: "self" | "family";
  /** Sealed; the relative's name for a family account. */
  holderName: string | null;
  instruction: string;
  check: "valid" | "warning" | "unchecked";
  warning: BankWarning | null;
};

/**
 * The account as the database takes it, checked by Masav's rules on `today`
 * (`checkBankAccount`): a warning goes through (the account waits for a
 * holder, `bank_review = 'warned'`), only what can't be stored is refused.
 */
export function bankParts(
  bank: NonNullable<EmployeeDetailsInput["bank"]>,
  today: string,
): BankParts | null {
  const checked = checkBankAccount(
    { bank: bank.bank, branch: bank.branch, account: bank.account },
    today,
  );
  if (checked.status === "unusable") return null;
  return {
    code: checked.account.bank,
    branch: checked.account.branch,
    account: checked.account.account,
    hint: accountHint(checked.account.account),
    holder: bank.holder,
    holderName: bank.holder === "family" ? (bank.holderName ?? null) : null,
    instruction: bank.instruction,
    check: checked.status,
    warning: checked.status === "warning" ? checked.warning : null,
  };
}

/** Someone to call in an emergency: a name and a mobile number, never the relation. */
export const emergencyContactInput = z.object({
  name: oneLineSchema(2, 60),
  phone: z.string().transform((value, ctx) => {
    const phone = normalizeIsraeliMobile(value);
    if (phone === null) {
      ctx.addIssue({ code: "custom", message: "phone" });
      return z.NEVER;
    }
    return phone;
  }),
});

export type EmergencyContact = z.output<typeof emergencyContactInput>;

/** An emergency contact as sealed. */
export function contactText(contact: EmergencyContact): string {
  return JSON.stringify({ name: contact.name, phone: contact.phone });
}

/** The contact an opened text holds, or null. */
export function contactFromText(text: string): EmergencyContact | null {
  try {
    const parsed = z
      .object({ name: z.string().min(1), phone: z.string().min(1) })
      .safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** A hint as a screen shows it: three dots, then the last digits (drawn LTR). */
export function maskedHint(hint: string): string {
  return `•••${hint}`;
}

// ---------------------------------------------------------------------------
// The database's replies, checked: generated types lose nullability for
// function results, and a reply that doesn't parse fails closed.

/** A sealed value as the database hands it over: base64 with no line breaks. */
export const sealedText = z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/);

/** A person's data key, wrapped by the key `kek_id` names. */
export const keyReply = z.object({
  kek_id: z.int().min(1),
  wrapped_dek: sealedText,
});

const fileGroups = z.array(z.enum(FILE_GROUPS));

const taxYearRow = z.object({
  year: z.int(),
  status: z.enum(TAX_YEAR_STATUSES),
  route: z.enum(FORM101_ROUTES).nullable(),
  returned_reason: z.enum(RETURNED_REASONS).nullable(),
  change_due_by: day.nullable(),
});

/** The plain part of a file. */
const fileRow = z.object({
  legal_first_name: z.string().nullable(),
  legal_last_name: z.string().nullable(),
  birth_date: day.nullable(),
  id_kind: z.enum(["il", "passport", "other"]).nullable(),
  id_country: z.string().nullable(),
  id_expires_on: day.nullable(),
  id_hint: z.string().nullable(),
  city_code: z.int().nullable(),
  bank_code: z.int().nullable(),
  bank_branch: z.int().nullable(),
  bank_account_hint: z.string().nullable(),
  bank_holder_kind: z.enum(["self", "family"]).nullable(),
  bank_instruction_at: z.string().nullable(),
  bank_instruction_version: z.string().nullable(),
  bank_changed_at: z.string().nullable(),
  bank_review: z.enum(BANK_REVIEWS).nullable(),
  pension_answer: z.enum(PENSION_ANSWERS).nullable(),
  pension_fund: z.string().nullable(),
  pension_answered_at: z.string().nullable(),
  direct_groups: fileGroups,
  submitted_at: z.string().nullable(),
  updated_at: z.string(),
  has: z.object({
    id: z.boolean(),
    address: z.boolean(),
    email: z.boolean(),
    work_language: z.boolean(),
    bank_account: z.boolean(),
  }),
});

export type FileRow = z.output<typeof fileRow>;

const denied = z.object({
  access: z.literal("denied"),
  reason: z.enum(DENIAL_REASONS),
});

/** `public.employee_file`'s answer: the file, or why not. */
export const fileReply = z.discriminatedUnion("access", [
  z.object({
    access: z.enum(["self", "holder"]),
    demo: z.boolean(),
    file: fileRow.nullable(),
    sealed: z.object({
      address: sealedText.nullable(),
      email: sealedText.nullable(),
      work_language: sealedText.nullable(),
      id_name: sealedText.nullable(),
      bank_holder: sealedText.nullable(),
      emergency: sealedText.nullable(),
    }),
    key: keyReply.nullable(),
    missing: fileGroups,
    youth_until: day.nullable(),
    pension_due_on: day.nullable(),
    // The open employment period's first day (H6b-2,
    // 20261126000600_file_started_and_changed.sql): absent before it.
    started_on: day.nullable().default(null),
    tax_years: z.array(taxYearRow),
  }),
  denied,
]);

export type FileReply = z.output<typeof fileReply>;

/** `public.reveal_employee_fields`' answer: the two numbers sealed, or why not. */
export const revealReply = z.discriminatedUnion("access", [
  z.object({
    access: z.enum(["self", "holder"]),
    demo: z.boolean(),
    sealed: z.object({
      id: sealedText.nullable(),
      bank_account: sealedText.nullable(),
    }),
    key: keyReply.nullable(),
  }),
  denied,
]);

const exportEntry = z.object({
  user_id: z.uuid(),
  file: fileRow,
  sealed: z.object({
    id: sealedText.nullable(),
    id_name: sealedText.nullable(),
    address: sealedText.nullable(),
    email: sealedText.nullable(),
    work_language: sealedText.nullable(),
    bank_account: sealedText.nullable(),
    bank_holder: sealedText.nullable(),
  }),
  key: keyReply.nullable(),
  missing: fileGroups,
  bank_held: z.boolean(),
});

/** `public.export_employee_files`' answer: one entry per file, or why not. */
export const exportReply = z.discriminatedUnion("access", [
  z.object({
    access: z.literal("holder"),
    demo: z.boolean(),
    entries: z.array(exportEntry),
  }),
  denied,
]);

/** One row of `public.employee_file_status`: what a holder sees, or a manager. */
export const statusRow = z.object({
  user_id: z.uuid(),
  complete: z.boolean(),
  missing: z.int().min(0),
  form101_in: z.boolean(),
  detail: z
    .object({
      missing: fileGroups,
      tax_year: z.int(),
      status: z.enum(TAX_YEAR_STATUSES).nullable(),
      returned_reason: z.enum(RETURNED_REASONS).nullable(),
      change_due_by: day.nullable(),
      pension_due_on: day.nullable(),
      bank_review: z.enum(BANK_REVIEWS).nullable(),
      youth_until: day.nullable(),
      submitted_at: z.string().nullable(),
      // When the file or its 101 was last written, by anyone (H6b-2):
      // absent before 20261126000600_file_started_and_changed.sql.
      changed_at: z.string().nullable().default(null),
    })
    .nullable(),
});

export type FileStatus = z.output<typeof statusRow>;

/** One row of `public.team_emergency_contacts`. */
export const contactRow = z.object({
  user_id: z.uuid(),
  contact: sealedText,
  kek_id: z.int().nullable(),
  wrapped_dek: sealedText.nullable(),
  demo: z.boolean(),
});

/** `public.set_employee_details`' answer: what changed, and when an updated 101 is due. */
export const detailsReply = z.object({
  changed: z.array(z.enum(FILE_DETAIL_FIELDS)),
  change_due_by: day.nullable(),
});

// ---------------------------------------------------------------------------
// Refusals

/**
 * Why a file's write or read didn't go through, in the screens' terms (their
 * words come with H5 and H6): the module off, someone else's bank or address
 * (`own`), an owner's file (`ownerOnly`), no access, the duties screen first,
 * a closed demo, real files not open yet (`closed`), no fresh SMS code, the
 * week after a phone change, a shredded key, an accountant's file, a bad
 * value, changed meanwhile (`moved`), not in the team, no encryption keys on
 * this deployment, the database before its migration, or anything else.
 */
export type FileFailure =
  | "off"
  | "own"
  | "ownerOnly"
  | "noAccess"
  | "ack"
  | "demo"
  | "closed"
  | "stepUp"
  | "phoneHold"
  | "shredded"
  | "notStaff"
  | "invalid"
  | "moved"
  | "notInTeam"
  | "keys"
  | "unavailable"
  | "failed";

/** A refusal of the file's functions, by its code and hint (never its message's values). */
export function fileFailureOf(
  code: string | undefined,
  hint?: string | null,
): FileFailure {
  switch (code) {
    case "42501":
      switch (hint) {
        case "off":
          return "off";
        case "own":
          return "own";
        case "owner":
          return "ownerOnly";
        case "ack":
          return "ack";
        default:
          return "noAccess";
      }
    case "55000":
      switch (hint) {
        case "demo":
          return "demo";
        case "not_open":
          return "closed";
        case "step_up":
          return "stepUp";
        case "phone_hold":
          return "phoneHold";
        case "shredded":
          return "shredded";
        default:
          return "failed";
      }
    case "22023":
      return hint === "not_staff" ? "notStaff" : "invalid";
    case "40001":
      return "moved";
    case "P0002":
      return "notInTeam";
    case "23514":
    case "23502":
      return "invalid";
    default:
      return "failed";
  }
}
