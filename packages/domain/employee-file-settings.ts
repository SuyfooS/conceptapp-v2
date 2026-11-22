import { z } from "zod";
import { FILE_GROUPS, type FileGroup } from "./employee-file";
import { clockAt } from "./today";
import { CONTROL_OR_BREAK } from "./typed-text";

/*
 * What each business asks of the hiring file (profile H5b, issue #82 §3.4):
 * the bank account and the home address (asked unless switched off), the
 * emergency contact and a language for work instructions (asked only when
 * switched on, never required of the worker), how Form 101 is taken, and
 * who the notice names. The module's manifest holds the fields
 * (modules/employee_files/manifest.ts); the database reads the two asks the
 * file counts (`private.file_groups`) and checks every value as the manifest
 * does (`public.set_module_settings`). Pure: the same in the browser and on
 * the server.
 */

/** How the business takes Form 101: on paper, by an approved system's link, or not in the app. */
export const FORM101_WAYS = ["print", "link", "off"] as const;
export type Form101Way = (typeof FORM101_WAYS)[number];

/** The longest name a setting holds: the 101's system, the payroll's provider, the employer. */
export const FILE_SETTING_LINE_MAX = 60;
export const FORM101_LINK_MAX = 300;

/**
 * An approved system's link as stored: https, a host of lower-case letters,
 * digits and dashes with a dot and a top-level name, then printable ASCII
 * only, no space. The same pattern as private.file_setting_link
 * (modules/employee_files/settings.db.test.ts holds the two equal). Which
 * vendors are approved, by their domains, is H7's list.
 */
export const FORM101_LINK =
  /^https:\/\/([a-z0-9-]+\.)+[a-z]{2,63}([/?#][!-~]*)?$/;

/**
 * A link as typed, ready to check: trimmed, its scheme and host in lower
 * case ("HTTPS://Malam.co.il/101" is "https://malam.co.il/101"), the rest as
 * it was. Anything else stays as it is, for the check to refuse.
 */
export function tidyForm101Link(value: string): string {
  const typed = value.trim();
  const head = /^https:\/\/[^/?#]*/i.exec(typed)?.[0];
  return head ? `${head.toLowerCase()}${typed.slice(head.length)}` : typed;
}

/** None yet (""), or an approved system's link as stored. */
export function isForm101Link(value: string): boolean {
  return (
    value === "" ||
    (value.length <= FORM101_LINK_MAX && FORM101_LINK.test(value))
  );
}

/** The site a link opens, as the worker is told it ("101.example"). */
export function linkDomain(link: string): string {
  return (/^https:\/\/([^/?#]+)/i.exec(link)?.[1] ?? "").toLowerCase();
}

/** The deductions file (תיק ניכויים) as stored: nine digits, the first a 9. */
export const DEDUCTIONS_FILE = /^9\d{8}$/;

/** A deductions file as typed: its spaces and dashes left out. */
export function tidyDeductionsFile(value: string): string {
  return value.replace(/[\s-]/g, "");
}

/**
 * A setting's one line: trimmed, at most `max` characters, no line break or
 * control character, as private.file_setting_line checks it.
 */
export function settingLine(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .refine((text) => !CONTROL_OR_BREAK.test(text), { message: "oneLine" });
}

/** The settings as the manifest outputs them (the registry's test holds the two together). */
export type EmployeeFileSettings = {
  askBank: boolean;
  askAddress: boolean;
  askEmergencyContact: boolean;
  askWorkLanguage: boolean;
  form101: Form101Way;
  form101Provider: string;
  form101Link: string;
  payrollProvider: string;
  employerName: string;
  /** E.164, or "". */
  employerPhone: string;
  /** Nine digits, or "". */
  deductionsFile: string;
};

/** What the business asks of each worker, beyond the identity and the pension. */
export type FileAsks = {
  address: boolean;
  bank: boolean;
  emergencyContact: boolean;
  workLanguage: boolean;
};

export function fileAsksOf(settings: EmployeeFileSettings): FileAsks {
  return {
    address: settings.askAddress,
    bank: settings.askBank,
    emergencyContact: settings.askEmergencyContact,
    workLanguage: settings.askWorkLanguage,
  };
}

/**
 * The groups the file counts, in FILE_GROUPS' order: the identity and the
 * pension always, the address and the bank while asked. What
 * private.file_groups returns. The contact and the language are never
 * counted: they are the worker's to give or not.
 */
export function fileGroupsAsked(
  asks: Pick<FileAsks, "address" | "bank">,
): FileGroup[] {
  return FILE_GROUPS.filter(
    (group) =>
      (group !== "address" || asks.address) && (group !== "bank" || asks.bank),
  );
}

/**
 * Form 101 as the worker meets it. "link" only once a link is set: until
 * then the paper card, so the step is never empty. Named by its provider,
 * or, with none set (`provider` null), by the site it opens, which the
 * screens say left to right: a domain inside Hebrew words would otherwise
 * read back to front ("101.example" as "example.101").
 */
export type Form101Setup =
  | { way: "print" }
  | { way: "link"; link: string; domain: string; provider: string | null }
  | { way: "off" };

export function form101SetupOf(settings: EmployeeFileSettings): Form101Setup {
  if (settings.form101 === "off") return { way: "off" };
  if (settings.form101 === "link" && settings.form101Link !== "") {
    return {
      way: "link",
      link: settings.form101Link,
      domain: linkDomain(settings.form101Link),
      provider: settings.form101Provider || null,
    };
  }
  return { way: "print" };
}

/** Who the notice names: whoever prepares the payroll, the employer and its phone, each or null. */
export type NoticeNames = {
  payrollProvider: string | null;
  employer: string | null;
  /** E.164. */
  phone: string | null;
};

export function noticeNamesOf(settings: EmployeeFileSettings): NoticeNames {
  return {
    payrollProvider: settings.payrollProvider || null,
    employer: settings.employerName || null,
    phone: settings.employerPhone || null,
  };
}

/** How long a bank change is told on Today (issue #82 §3.1). */
export const BANK_CHANGE_TELL_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The day of the account's last change in the business's zone, while Today
 * still tells it: for 14 days from the change, never one in the future (the
 * two clocks), null without one.
 */
export function bankChangeToTell(
  changedAt: string | null,
  now: Date,
  timeZone: string,
): string | null {
  if (changedAt === null) return null;
  const at = Date.parse(changedAt);
  if (Number.isNaN(at)) return null;
  const since = now.getTime() - at;
  if (since < 0 || since >= BANK_CHANGE_TELL_DAYS * DAY_MS) return null;
  return clockAt(new Date(at), timeZone).date;
}

/**
 * The cookie that remembers, on this device, the bank changes people said
 * they saw ("אני שיניתי", "הבנתי", and the account just added here):
 * "<business>.<person>.<ms>" entries, comma-separated, each the database's
 * moment of that person's change in that business, the latest last, and
 * ".here" after it for an account added on this device. A change is seen
 * only by its own person and its own moment, so on a shared device one
 * person's seen never hides another's change, nor an earlier change of
 * their own. Kept as long as the business cookie, and forgotten with it on
 * signing out.
 */
export const BANK_CHANGE_SEEN_COOKIE = "ca_bank_seen";

/** How many changes the cookie remembers, one a person in a business; the oldest goes first. */
export const BANK_CHANGE_SEEN_MOST = 20;

/** A person's account's last change in a business, as the database gave its moment. */
export type BankChange = {
  business: string;
  person: string;
  changedAt: string;
};

/**
 * How a change was seen on this device: `made` on it (the account added
 * here), `said` seen on Today ("אני שיניתי", "הבנתי"), or null. Today tells
 * neither again; the bank step still asks "לא שיניתי" of one only said
 * seen, so hiding Today's card never takes the way to dispute it.
 */
export type BankChangeSeenAs = "made" | "said" | null;

type SeenEntry = {
  business: string;
  person: string;
  at: number;
  here: boolean;
};

const SEEN_ENTRY = /^([0-9a-f-]{36})\.([0-9a-f-]{36})\.(\d{1,15})(\.here)?$/;

function seenIn(cookie: string | null | undefined): SeenEntry[] {
  return (cookie ?? "").split(",").flatMap((entry) => {
    const found = SEEN_ENTRY.exec(entry);
    return found?.[1] && found[2] && found[3]
      ? [
          {
            business: found[1],
            person: found[2],
            at: Number(found[3]),
            here: found[4] !== undefined,
          },
        ]
      : [];
  });
}

/** This very change's entry: its person's, at its moment. */
function entryOf(
  entries: readonly SeenEntry[],
  change: BankChange,
): SeenEntry | undefined {
  const at = Date.parse(change.changedAt);
  if (Number.isNaN(at)) return undefined;
  return entries.find(
    (entry) =>
      entry.business === change.business &&
      entry.person === change.person &&
      entry.at === at,
  );
}

/** How this very change was seen on this device (`BankChangeSeenAs`). */
export function bankChangeSeenAs(
  cookie: string | null | undefined,
  change: BankChange,
): BankChangeSeenAs {
  const entry = entryOf(seenIn(cookie), change);
  return entry === undefined ? null : entry.here ? "made" : "said";
}

/** Whether this very change was seen on this device, made here or said seen. */
export function bankChangeSeen(
  cookie: string | null | undefined,
  change: BankChange,
): boolean {
  return bankChangeSeenAs(cookie, change) !== null;
}

/**
 * The cookie's value once this change is seen too, `made` here or `said`
 * seen: its entry last, replacing an older one of the same person in the
 * same business, and no more than `BANK_CHANGE_SEEN_MOST`, the oldest
 * dropped. Said seen again, a change made here stays made here.
 */
export function withBankChangeSeen(
  cookie: string | null | undefined,
  change: BankChange,
  as: "made" | "said" = "said",
): string {
  const at = Date.parse(change.changedAt);
  const kept = seenIn(cookie);
  const here = as === "made" || entryOf(kept, change)?.here === true;
  const others = kept.filter(
    (entry) =>
      entry.business !== change.business || entry.person !== change.person,
  );
  const entries: SeenEntry[] = Number.isNaN(at)
    ? others
    : [
        ...others,
        { business: change.business, person: change.person, at, here },
      ];
  return entries
    .slice(-BANK_CHANGE_SEEN_MOST)
    .map(
      (entry) =>
        `${entry.business}.${entry.person}.${entry.at}${entry.here ? ".here" : ""}`,
    )
    .join(",");
}
