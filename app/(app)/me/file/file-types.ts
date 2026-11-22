import type { Address } from "@domain/address";
import type { City } from "@domain/cities";
import type {
  FileFailure,
  FileGroup,
  FileRow,
  Form101Route,
  ReturnedReason,
  TaxYearStatus,
} from "@domain/employee-file";
import type { Role } from "@domain/modules";
import type {
  AddressForm,
  ProfileChange,
  ProfileLocale,
  ProfileSaveResult,
} from "@domain/profile";

/*
 * What the worker's own file (profile H5a, /me/file) is drawn from, and what
 * its writes answer: the same for the app and its twin on /design. Values
 * only the person may see travel in a screen's props for their own session
 * (never a URL or a cache); the ID and the account number never do, only
 * their last digits, and "הצגה" asks for each on its own.
 */

/** This year's Form 101, as the file holds it. */
export type TaxYearRow = {
  year: number;
  status: TaxYearStatus;
  route: Form101Route | null;
  returnedReason: ReturnedReason | null;
  changeDueBy: string | null;
};

export type FileScreenData = {
  businessId: string;
  businessName: string;
  /** The business's colour, for the English frame's sheets. */
  accent: string;
  timeZone: string;
  /** The business's day, `YYYY-MM-DD`. */
  today: string;
  /** The tax year the 101 is for: today's. */
  year: number;
  locale: ProfileLocale;
  addressForm: AddressForm | null;
  role: Role;
  /** A demo business: its file is made up. */
  demo: boolean;
  file: FileRow | null;
  address: Address | null;
  /** The address's town, named. */
  city: City | null;
  email: string | null;
  /** Another document's name. */
  documentName: string | null;
  /** A relative holder's name. */
  holderName: string | null;
  /** The two numbers as their last digits only ("•••0018"). */
  masked: { id: string | null; bankAccount: string | null };
  missing: FileGroup[];
  /** What the business asks: every group until H5b's settings. */
  asked: FileGroup[];
  youthUntil: string | null;
  pensionDueOn: string | null;
  taxYear: TaxYearRow | null;
  /** The last four digits of the person's own number, or null without one. */
  phoneTail: string | null;
};

/** Why the screen can't show a file, or the file. */
export type FileScreen =
  /** No such screen for them: the module off, off the staff, no business. */
  | { kind: "closed" }
  /** The ConceptApp team viewing as a role: no file is read at all. */
  | { kind: "viewing" }
  | { kind: "unavailable"; reason: "keys" | "unavailable" | "failed" }
  | { kind: "file"; data: FileScreenData };

/** A write refused, in the screen's terms. */
export type FileActionFailure = FileFailure | "viewOnly" | "businessChanged";

export type FileWriteAnswer =
  | { ok: true }
  | { ok: false; failure: FileActionFailure };

export type SaveStepAnswer =
  | { ok: true; changeDueBy: string | null }
  | { ok: false; failure: FileActionFailure };

/** The steps that save through `saveStep`: the bank has its code, step 0 the profile. */
export type SavedStep = "identity" | "address" | "pension";

export type RevealAnswer =
  | { ok: true; value: string | null }
  | { ok: false; failure: FileActionFailure | "denied" };

/** Why a code didn't go, or wasn't taken. */
export type CodeFailure =
  | "noPhone"
  | "invalidPhone"
  | "rateLimit"
  | "tooMany"
  | "wrongCode";

export type SendCodeAnswer =
  | { ok: true; tail: string }
  | { ok: false; failure: CodeFailure | FileActionFailure };

export type ConfirmBankAnswer =
  | { ok: true; review: "new" | "warned" }
  | {
      ok: false;
      failure: CodeFailure | FileActionFailure;
      /** In the week after a phone change: the day a change opens again. */
      opensOn?: string;
    };

/** The screen's writes, bound to the business it was drawn for, or the twin's stand-ins. */
export type FileActions = {
  saveStep: (step: SavedStep, input: unknown) => Promise<SaveStepAnswer>;
  reveal: (field: "id" | "bank_account") => Promise<RevealAnswer>;
  sendBankCode: () => Promise<SendCodeAnswer>;
  confirmBank: (input: {
    code: string;
    bank: unknown;
  }) => Promise<ConfirmBankAnswer>;
  handInForm101: () => Promise<FileWriteAnswer>;
  submit: () => Promise<FileWriteAnswer>;
  saveProfile: (change: ProfileChange) => Promise<ProfileSaveResult>;
};
