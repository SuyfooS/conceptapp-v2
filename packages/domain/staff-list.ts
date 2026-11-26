import type { Role } from "./modules";
import { searchable } from "./wording";

/**
 * The staff list's words: the built-in roles' own words (owner,
 * manager, worker and accountant, in Hebrew and English), and the run of
 * digits a phone number is written in, which the list of people reads
 * (@domain/people-import), and with it the new-business wizard's staff
 * list (`parseStaffList` in @domain/business). A staff list's person is
 * a `StaffEntry`: each becomes an open invite when the business is opened.
 */

/** People the wizard invites with the business it opens. */
export const STAFF_LIST_MAX = 60;

export type StaffEntry = {
  name: string;
  /** E.164, e.g. "+972501234567". */
  phone: string;
  role: Role;
};

// Role words, compared without quotes or gershayim (אחמ"ש → אחמש).
const ROLE_WORDS: Record<string, Exclude<Role, "worker">> = {
  owner: "owner",
  בעלים: "owner",
  הבעלים: "owner",
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
// Two words that name an owner or a shift lead, read before the words
// alone, so neither stays in a name: "בעלת העסק" is the owner, not a worker
// called "רונית כהן בעלת העסק", and "אחראי משמרת" or "מנהלת משמרת" a
// manager, as their אחמ"ש is. A business's own role of that name comes
// first (@domain/people-import). "בעל/ת העסק" reads as "בעלת העסק".
const ROLE_PHRASES: Record<string, Exclude<Role, "worker">> = {
  "בעל העסק": "owner",
  "בעלת העסק": "owner",
  "בעלי העסק": "owner",
  "business owner": "owner",
  "אחראי משמרת": "manager",
  "אחראית משמרת": "manager",
  "מנהל משמרת": "manager",
  "מנהלת משמרת": "manager",
  "shift manager": "manager",
  "shift lead": "manager",
};

// A run of digits with the separators people put in phone numbers.
export const PHONE_RUN = /\+?\d[\d\s\-().]*\d/g;
const QUOTES = /["'״׳]/g;

/**
 * A word as role words and a sheet's headers are compared: without quotes
 * or gershayim (אחמ"ש, טל'), parentheses, colons or dots (ת.ז.), case aside.
 */
export function wordKey(word: string): string {
  return word
    .replace(QUOTES, "")
    .replace(/[():.]/g, "")
    .toLowerCase();
}

/**
 * A role word compared as a search compares it too (`searchable`): "מנהל/ת"
 * reads as "מנהלת" and "עובד/ת" as "עובדת", which `wordKey` keeps with
 * their slash.
 */
const roleWordKey = (text: string) => searchable(wordKey(text));

/**
 * The built-in roles' own words, for the list of people
 * (@domain/people-import): the accountant's phrases first, then the
 * owner's and the shift lead's, the role words and the worker's, with
 * "employee" among them.
 */
const BUILT_IN_ROLE_WORDS: ReadonlyMap<string, Role> = new Map<string, Role>([
  ...[...ACCOUNTANT_PHRASES].map((phrase): [string, Role] => [
    roleWordKey(phrase),
    "accountant",
  ]),
  ...Object.entries(ROLE_PHRASES).map(([phrase, role]): [string, Role] => [
    roleWordKey(phrase),
    role,
  ]),
  ...Object.entries(ROLE_WORDS).map(([word, role]): [string, Role] => [
    roleWordKey(word),
    role,
  ]),
  ...[...WORKER_WORDS, "employee"].map((word): [string, Role] => [
    roleWordKey(word),
    "worker",
  ]),
]);

/**
 * The built-in role a word or a phrase names, whatever the business calls
 * it ("מנהלת", "מנהל/ת", "owner", "בעלת העסק", "אחראי משמרת", "מנהלת
 * חשבונות", "עובד/ת", "employee"), compared by `wordKey` and `searchable`;
 * null for anything else.
 */
export function builtInRoleWord(text: string): Role | null {
  const key = roleWordKey(text);
  if (!key) return null;
  return BUILT_IN_ROLE_WORDS.get(key) ?? null;
}
