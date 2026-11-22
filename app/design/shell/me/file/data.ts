import type { Address } from "@domain/address";
import { cityOf } from "@domain/cities";
import type { FileGroup, FileRow } from "@domain/employee-file";
import type { EmployeeFileSettings } from "@domain/employee-file-settings";
import { addYears } from "@domain/youth";
import type { BankFieldValue } from "@ui/bank-field";
import { fileSettingsParts } from "../../../../(app)/me/file/file-parts";
import type { FileScreenData } from "../../../../(app)/me/file/file-types";
import type { BankPreset } from "../../../../(app)/me/file/steps/bank-step";
import { business } from "../../data";

/*
 * Noa's hiring file on the twin (profile H5a), made up, in each state the
 * screens show: nothing yet (the welcome), part filled and stopped at the
 * account, a minor's birth date, an account the check warns about and its
 * code, an account held in the week after a phone change, an account saved,
 * and everything sent. The ID and the account are
 * from the test ranges (tooling/demo-files.test.ts), and nothing typed on
 * the twin is kept. `ready` is everything in and not sent yet (H5b), and
 * `later` everything sent with the pension answered "אבחר אחר כך". What
 * the business asks is a choice of its own: everything, as by default;
 * `lean`, neither the address nor the account, and none in the file;
 * `contact`, the same with the ways to reach her asked instead, an
 * emergency contact and a work language, hers in once she is done. And how
 * it takes Form 101: on paper, by an approved system's link, or not in the
 * app.
 */

/** The twin's day: fixed, so its dates read the same on every visit. */
export const FILE_DEMO_TODAY = "2026-11-24";

/** What the twin's "הצגה" shows: the test range's ID and an account that checks valid. */
export const FILE_DEMO_NUMBERS = { id: "000000018", bankAccount: "100001" };

/** The account the twin's check warns about (Hapoalim 12, branch 600). */
export const FILE_DEMO_WARNED: BankFieldValue = {
  bank: 12,
  branch: "600",
  account: "100002",
  kept: false,
};

/** The account Noa typed on the twin's `hold`, one the check passes. */
const FILE_DEMO_HELD: BankFieldValue = {
  bank: 12,
  branch: "600",
  account: FILE_DEMO_NUMBERS.bankAccount,
  kept: false,
};

/** The code the twin's code step takes. */
export const FILE_DEMO_CODE = "123456";

/** The day Noa's bank change opens again on the twin's `hold`: her phone changed. */
export const FILE_DEMO_HELD_UNTIL = "2026-11-27";

/** When an updated 101 is due on the twin's `done`, after a move: a week on. */
export const FILE_DEMO_CHANGE_DUE = "2026-12-01";

/** Noa's address on the twin: a save that keeps it is no move. */
export const FILE_DEMO_ADDRESS = {
  kind: "street",
  cityCode: 5000,
  street: "הרצל",
  number: "12",
} satisfies Address;

const EMPTY_ROW: FileRow = {
  legal_first_name: null,
  legal_last_name: null,
  birth_date: null,
  id_kind: null,
  id_country: null,
  id_expires_on: null,
  id_hint: null,
  city_code: null,
  bank_code: null,
  bank_branch: null,
  bank_account_hint: null,
  bank_holder_kind: null,
  bank_instruction_at: null,
  bank_instruction_version: null,
  bank_changed_at: null,
  bank_review: null,
  pension_answer: null,
  pension_fund: null,
  pension_answered_at: null,
  direct_groups: [],
  submitted_at: null,
  updated_at: "2026-11-20T09:00:00+02:00",
  has: {
    id: false,
    address: false,
    email: false,
    work_language: false,
    bank_account: false,
  },
};

/** Identity and address in, the account and the pension still to come. */
const STOPPED: FileRow = {
  ...EMPTY_ROW,
  legal_first_name: "נועה",
  legal_last_name: "כהן",
  birth_date: "1995-01-01",
  id_kind: "il",
  id_hint: "0018",
  city_code: 5000,
  has: { ...EMPTY_ROW.has, id: true, address: true, email: true },
};

const SAVED_BANK: FileRow = {
  ...STOPPED,
  bank_code: 12,
  bank_branch: 600,
  bank_account_hint: "0001",
  bank_holder_kind: "self",
  bank_instruction_at: "2026-11-24T09:00:00+02:00",
  bank_instruction_version: "v1",
  bank_changed_at: "2026-11-24T09:00:00+02:00",
  bank_review: "new",
  has: { ...STOPPED.has, bank_account: true },
};

/** Every part in, and not sent yet. */
const READY: FileRow = {
  ...SAVED_BANK,
  bank_review: null,
  pension_answer: "existing",
  pension_fund: "harel",
  pension_answered_at: "2026-11-24T09:05:00+02:00",
};

const SENT: FileRow = {
  ...SAVED_BANK,
  bank_review: null,
  pension_answer: "existing",
  pension_fund: "harel",
  pension_answered_at: "2026-11-24T09:05:00+02:00",
  submitted_at: "2026-11-24T09:06:00+02:00",
};

/** Sent, with the pension answered "אבחר אחר כך": a fund is all that is left (H5b). */
const LATER: FileRow = {
  ...SENT,
  pension_answer: "later",
  pension_fund: null,
};

export type FileDemoState =
  | "stopped"
  | "new"
  | "minor"
  | "warning"
  | "code"
  | "hold"
  | "saved"
  | "ready"
  | "done"
  | "later";

/**
 * What the business asks on the twin: everything; no address or account;
 * the ways to reach her instead; or, `held`, neither the address nor the
 * account any more, though her file holds both from before (each step says
 * it is no longer asked).
 */
export type FileDemoAsk = "all" | "lean" | "contact" | "held";

export function fileDemoAskOf(param: unknown): FileDemoAsk {
  return param === "lean" || param === "contact" || param === "held"
    ? param
    : "all";
}

/** How the business takes Form 101 on the twin. */
export type FileDemoForm101 = "print" | "link" | "off";

export function fileDemoForm101Of(param: unknown): FileDemoForm101 {
  return param === "link" || param === "off" ? param : "print";
}

/** The twin restaurant's own words in the notice (shell/data.ts's business). */
const DEMO_NOTICE = {
  payrollProvider: "משרד רואי החשבון",
  employerName: "מסעדת הדגמה בע״מ",
  employerPhone: "+97231234567",
};

/** The approved system the twin's link opens: a made-up one, never followed. */
export const FILE_DEMO_LINK = {
  provider: "משרד השכר",
  link: "https://101.example/noa",
};

function demoSettings(
  ask: FileDemoAsk,
  form101: FileDemoForm101,
): EmployeeFileSettings {
  return {
    askBank: ask === "all",
    askAddress: ask === "all",
    askEmergencyContact: ask === "contact",
    askWorkLanguage: ask === "contact",
    form101,
    form101Provider: form101 === "link" ? FILE_DEMO_LINK.provider : "",
    form101Link: form101 === "link" ? FILE_DEMO_LINK.link : "",
    payrollProvider: DEMO_NOTICE.payrollProvider,
    employerName: DEMO_NOTICE.employerName,
    employerPhone: DEMO_NOTICE.employerPhone,
    deductionsFile: "",
  };
}

/** Noa's emergency contact on the twin: a made-up name and a number no one has. */
export const FILE_DEMO_CONTACT = { name: "דוד כהן", phone: "+972500000099" };

export function fileDemoStateOf(param: unknown): FileDemoState {
  switch (param) {
    case "new":
    case "minor":
    case "warning":
    case "code":
    case "hold":
    case "saved":
    case "ready":
    case "done":
    case "later":
      return param;
    default:
      return "stopped";
  }
}

/** Noa's file in a state, in her language, as the business asks it. */
export function fileScreenDemo(
  state: FileDemoState,
  lang: "he" | "en",
  {
    ask = "all",
    form101 = "print",
  }: { ask?: FileDemoAsk; form101?: FileDemoForm101 } = {},
): { data: FileScreenData; preset?: { bank?: BankPreset } } {
  const filled =
    state === "new"
      ? null
      : state === "minor"
        ? { ...STOPPED, birth_date: addYears(FILE_DEMO_TODAY, -16) }
        : state === "saved"
          ? SAVED_BANK
          : state === "ready"
            ? READY
            : state === "done"
              ? SENT
              : state === "later"
                ? LATER
                : STOPPED;
  // Sent, with a fund still to choose: the pension is all the file lacks.
  const later = state === "later";
  // Finished: everything she gives is in, sent or not yet.
  const finished = state === "ready" || state === "done" || later;
  // A business that asks neither the address nor the account: none of
  // either in her file, unless it stopped asking after she gave them.
  const row: FileRow | null =
    filled && (ask === "lean" || ask === "contact")
      ? {
          ...filled,
          city_code: null,
          bank_code: null,
          bank_branch: null,
          bank_account_hint: null,
          bank_holder_kind: null,
          bank_instruction_at: null,
          bank_instruction_version: null,
          bank_changed_at: null,
          bank_review: null,
          has: {
            ...filled.has,
            address: false,
            email: false,
            bank_account: false,
            work_language: ask === "contact" && finished,
          },
        }
      : filled;
  const contact = ask === "contact" && finished;
  const settings = fileSettingsParts(demoSettings(ask, form101), row, contact);
  const before: FileGroup[] =
    row === null
      ? ["identity", "address", "bank", "pension"]
      : finished
        ? later
          ? ["pension"]
          : []
        : state === "saved"
          ? ["pension"]
          : ["bank", "pension"];
  const missing = before.filter((group) => settings.asked.includes(group));
  const data: FileScreenData = {
    businessId: "demo-restaurant",
    businessName: business.name,
    accent: "#2563eb",
    timeZone: "Asia/Jerusalem",
    today: FILE_DEMO_TODAY,
    year: 2026,
    locale: lang,
    addressForm: row === null ? null : "f",
    role: "worker",
    demo: false,
    file: row,
    address: row?.has.address ? FILE_DEMO_ADDRESS : null,
    city: row?.has.address ? cityOf(5000) : null,
    email: row?.has.email ? "noa@demo.conceptapp.invalid" : null,
    documentName: null,
    holderName: null,
    masked: {
      id: row?.id_hint ? `•••${row.id_hint}` : null,
      bankAccount: row?.bank_account_hint
        ? `•••${row.bank_account_hint}`
        : null,
    },
    missing,
    ...settings,
    workLanguage: row?.has.work_language ? "ערבית" : null,
    emergency: contact ? FILE_DEMO_CONTACT : null,
    youthUntil: state === "minor" ? addYears(FILE_DEMO_TODAY, 2) : null,
    // 60 days from the start of the work, a month on.
    pensionDueOn: finished && !later ? null : "2026-12-24",
    taxYear:
      state === "done" || later
        ? {
            year: 2026,
            status: "handed_in",
            route: form101 === "link" ? "link" : "print",
            returnedReason: null,
            changeDueBy: null,
          }
        : null,
    phoneTail: "0003",
    // Her account went in on the twin's day, so its change is still told,
    // as the app tells it for 14 days: the bank step has "לא שיניתי".
    bankChange: row?.bank_changed_at
      ? { on: FILE_DEMO_TODAY, disputed: false }
      : null,
  };
  const preset =
    state === "warning" || state === "code"
      ? {
          bank: {
            value: FILE_DEMO_WARNED,
            holder: "self" as const,
            instruction: true,
            phase: state === "code" ? ("code" as const) : ("edit" as const),
            tail: "0003",
          },
        }
      : state === "hold"
        ? {
            bank: {
              value: FILE_DEMO_HELD,
              holder: "self" as const,
              instruction: true,
              phase: "edit" as const,
              heldUntil: FILE_DEMO_HELD_UNTIL,
            },
          }
        : undefined;
  return { data, preset };
}
