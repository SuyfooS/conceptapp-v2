import type { Address } from "@domain/address";
import type {
  BankReview,
  FileGroup,
  Form101Route,
  PensionAnswer,
  ReturnedReason,
  RevealField,
  TaxYearStatus,
} from "@domain/employee-file";
import type { Role } from "@domain/modules";
import type { AddressForm } from "@domain/profile";
import type { NamedRole } from "@domain/role-access";
import type { HolderFailure } from "../../file-access";

/*
 * What a holder's view of someone's hiring file (profile H6a,
 * /team/[person]/file) is drawn from, and what its actions answer: the same
 * for the app and its twin on /design. Only what the screen shows travels:
 * the ID and the account number as their last digits, never the numbers,
 * which "הצגה" asks for one at a time.
 */

/** Whose file it is, and where it is: what every state's header needs. */
export type HolderFileHead = {
  personId: string;
  /** The name the business shows for them; null when nobody wrote one. */
  name: string | null;
  role: Role;
  namedRole: NamedRole | null;
  addressForm: AddressForm | null;
  /** When they joined the business (ISO). */
  since: string;
  /** The reader sees the team too: back to the profile, and its link to share. */
  seesTeam: boolean;
  businessId: string;
  businessName: string;
  timeZone: string;
};

/** The file as a holder reads it, opened: only what the screen shows. */
export type HolderFileData = {
  /** The business's day, `YYYY-MM-DD`. */
  today: string;
  year: number;
  /** The groups the business asks: the identity and the pension, and what it asks. */
  asked: FileGroup[];
  missing: FileGroup[];
  /** Marked "נמסר ישירות לשכר". */
  direct: FileGroup[];
  /** The business takes Form 101 in the app, and how. */
  form101: { provider: string | null } | null;
  identity: {
    legalName: string | null;
    kind: "il" | "passport" | "other" | null;
    /** ISO 3166 code. */
    country: string | null;
    /** Another document's name. */
    documentName: string | null;
    expiresOn: string | null;
    birthDate: string | null;
    /** "•••0018": never the number. */
    masked: string | null;
    youthUntil: string | null;
  };
  /** Null while the address isn't asked and the file holds nothing of it. */
  contact: {
    address: Address | null;
    email: string | null;
    workLanguage: string | null;
    /** E.164. */
    emergency: { name: string; phone: string } | null;
  } | null;
  /** Null while the account isn't asked and the file holds none. */
  bank: {
    code: number | null;
    branch: number | null;
    /** "•••567": never the number. */
    masked: string | null;
    holder: "self" | "family" | null;
    holderName: string | null;
    /** When the instruction to pay into it was signed (ISO). */
    instructionAt: string | null;
    review: BankReview | null;
    changedAt: string | null;
  } | null;
  pension: {
    answer: PensionAnswer | null;
    fund: string | null;
    dueOn: string | null;
  };
  /** This year's 101, while the business takes it in the app. */
  taxYear: {
    status: TaxYearStatus;
    route: Form101Route | null;
    returnedReason: ReturnedReason | null;
    changeDueBy: string | null;
  } | null;
  submittedAt: string | null;
};

/**
 * What the screen shows, decided on the server: no such screen (`closed`,
 * the page's not-found), the ConceptApp team viewing as a role, a file that
 * can't open on this deployment, the duties before any file opens, locked
 * until an SMS code, or the file.
 */
export type HolderFileScreen =
  | { kind: "closed" }
  | { kind: "viewing"; head: HolderFileHead }
  | { kind: "unavailable"; head: HolderFileHead }
  | { kind: "duties"; head: HolderFileHead }
  | { kind: "locked"; head: HolderFileHead }
  | { kind: "open"; head: HolderFileHead; data: HolderFileData };

/** Why a code didn't go, or wasn't taken. */
export type HolderCodeFailure =
  | "noPhone"
  | "rateLimit"
  | "tooMany"
  | "wrongCode"
  | "failed";

/** The file's own refusals: the duties first, no keys, the database before its migration. */
export type HolderFileFailure = "ack" | "keys" | "unavailable";

/** The duties confirmed; `open` when this device's files are open already. */
export type AcknowledgeAnswer =
  | { ok: true; open: boolean }
  | { ok: false; failure: HolderFailure | HolderFileFailure };

/** Sent, to the number ending in `tail`; or why not, before any SMS went. */
export type SendFileCodeAnswer =
  | { ok: true; tail: string }
  | {
      ok: false;
      failure: HolderFailure | HolderFileFailure | HolderCodeFailure;
    };

export type ConfirmFileCodeAnswer =
  | { ok: true }
  | { ok: false; failure: HolderFailure | HolderCodeFailure };

/**
 * A number shown, or why not: no fresh step-up (the screen draws itself
 * locked), over 30 people in the hour, the duties first, no access.
 */
export type RevealHolderAnswer =
  | { ok: true; value: string | null }
  | {
      ok: false;
      failure: HolderFailure | HolderFileFailure | "stepUp" | "limit";
    };

/**
 * Whether the file is still open on this device, and while it is, how long
 * the server's step-up has left with no activity (15 minutes once slid).
 */
export type KeepOpenAnswer = { open: true; leftMs: number } | { open: false };

export type LockAnswer = { ok: true };

/** The screen's actions, bound to the business (and the reveal to the person), or the twin's. */
export type HolderFileActions = {
  acknowledge: () => Promise<AcknowledgeAnswer>;
  sendCode: () => Promise<SendFileCodeAnswer>;
  confirmCode: (code: string) => Promise<ConfirmFileCodeAnswer>;
  reveal: (field: RevealField) => Promise<RevealHolderAnswer>;
  /** Sliding the step-up (`slide`) for the person's activity here only. */
  keepOpen: (slide: boolean) => Promise<KeepOpenAnswer>;
  lock: () => Promise<LockAnswer>;
};
