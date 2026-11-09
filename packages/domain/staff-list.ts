import type { Role } from "./modules";
import { normalizeIsraeliMobile } from "./phone";

/**
 * The staff list the new-business wizard takes as pasted text: one person
 * per line, a name and an Israeli mobile number in any order, and an
 * optional role word ("מנהלת", "בעלים", "owner", "מנהלת חשבונות"). Lines
 * come from WhatsApp, a spreadsheet or a note, so commas, tabs and dashes all
 * separate fields.
 * Each person becomes an open invite when the business is opened.
 */

export const STAFF_LIST_MAX = 60;
export const STAFF_NAME_MAX = 80;

export type StaffEntry = {
  name: string;
  /** E.164, e.g. "+972501234567". */
  phone: string;
  role: Role;
};

export type StaffLineError =
  | "noPhone"
  | "invalidPhone"
  | "noName"
  | "nameTooLong"
  | "duplicate";

export type StaffLine = { line: number; text: string } & (
  | { ok: true; entry: StaffEntry }
  | { ok: false; error: StaffLineError }
);

export type StaffList = {
  /** Every non-empty line, numbered from 1 as pasted. */
  lines: StaffLine[];
  entries: StaffEntry[];
  /** "invalid": a line has a problem. "tooMany": over `STAFF_LIST_MAX`. */
  error: "invalid" | "tooMany" | null;
};

// Role words, compared without quotes or gershayim (אחמ"ש → אחמש).
const ROLE_WORDS: Record<string, Exclude<Role, "worker">> = {
  owner: "owner",
  בעלים: "owner",
  בעלת: "owner",
  manager: "manager",
  מנהל: "manager",
  מנהלת: "manager",
  אחמש: "manager",
  אחמשית: "manager",
  accountant: "accountant",
  bookkeeper: "accountant",
};
const WORKER_WORDS = new Set(["worker", "staff", "עובד", "עובדת"]);
// Two words that name an accountant, read before the words alone: "מנהלת
// חשבונות" is an accountant, not a manager called חשבונות.
const ACCOUNTANT_PHRASES = new Set([
  "מנהל חשבונות",
  "מנהלת חשבונות",
  "מנהל/ת חשבונות",
  "הנהלת חשבונות",
  "רואה חשבון",
  "רואת חשבון",
]);

// A run of digits with the separators people put in phone numbers.
const PHONE_RUN = /\+?\d[\d\s\-().]*\d/g;
const SEPARATORS = /[,;|\t]+|\s[-–]\s/g;
const QUOTES = /["'״׳]/g;
const LIST_MARKER = /^\s*(?:\d{1,3}[.)]\s+|[-*•]\s*)/;

function wordKey(word: string): string {
  return word
    .replace(QUOTES, "")
    .replace(/[():.]/g, "")
    .toLowerCase();
}

function parseLine(
  text: string,
): { ok: true; entry: StaffEntry } | { ok: false; error: StaffLineError } {
  const body = text.replace(LIST_MARKER, "");
  // The phone is the first run with enough digits to be a number.
  const phoneRun = [...body.matchAll(PHONE_RUN)].find(
    (m) => m[0].replace(/\D/g, "").length >= 7,
  );
  if (!phoneRun) return { ok: false, error: "noPhone" };
  const phone = normalizeIsraeliMobile(phoneRun[0]);
  if (!phone) return { ok: false, error: "invalidPhone" };

  const rest = body.replace(phoneRun[0], " ").replace(SEPARATORS, " ");
  let role: Role = "worker";
  const nameWords: string[] = [];
  const words = rest.split(/\s+/).filter(Boolean);
  let phraseEnds = -1;
  for (const [index, word] of words.entries()) {
    if (index <= phraseEnds) continue;
    const key = wordKey(word);
    if (!key) continue;
    const next = words[index + 1];
    if (
      next !== undefined &&
      ACCOUNTANT_PHRASES.has(`${key} ${wordKey(next)}`)
    ) {
      role = "accountant";
      phraseEnds = index + 1;
      continue;
    }
    const roleWord = ROLE_WORDS[key];
    if (roleWord) role = roleWord;
    else if (!WORKER_WORDS.has(key)) nameWords.push(word);
  }
  const name = nameWords.join(" ").replace(/^[(:.]+|[):.]+$/g, "");
  if (!name) return { ok: false, error: "noName" };
  if (name.length > STAFF_NAME_MAX) return { ok: false, error: "nameTooLong" };
  return { ok: true, entry: { name, phone, role } };
}

/** Reads a pasted staff list. Empty input is a valid, empty list. */
export function parseStaffList(input: string): StaffList {
  const lines: StaffLine[] = [];
  const seen = new Set<string>();
  input.split(/\r?\n/).forEach((raw, index) => {
    const text = raw.trim();
    if (!text) return;
    const parsed = parseLine(text);
    if (parsed.ok && seen.has(parsed.entry.phone)) {
      lines.push({ line: index + 1, text, ok: false, error: "duplicate" });
      return;
    }
    if (parsed.ok) seen.add(parsed.entry.phone);
    lines.push({ line: index + 1, text, ...parsed });
  });

  const entries = lines.flatMap((l) => (l.ok ? [l.entry] : []));
  const error = lines.some((l) => !l.ok)
    ? "invalid"
    : entries.length > STAFF_LIST_MAX
      ? "tooMany"
      : null;
  return { lines, entries, error };
}
