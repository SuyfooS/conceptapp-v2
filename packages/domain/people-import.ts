import { z } from "zod";
import type { Role } from "./modules";
import { BULLET, clean, readsBackwards, westernDigits } from "./pasted-text";
import { normalizeIsraeliMobile } from "./phone";
import type { NamedRole } from "./role-access";
import { builtInRoleWord, PHONE_RUN, wordKey } from "./staff-list";
import {
  type InviteChoice,
  parseTeamName,
  type RoleChoice,
  roleChoiceKey,
} from "./team";
import { searchable } from "./wording";

/**
 * A list of people pasted to invite them all at once ("הזמנה מרשימה"): from
 * WhatsApp, Excel, Google Sheets or a note, one person per line, a name and
 * an Israeli mobile in any order, and a role if the line names one. Read on
 * the device, and only the name, the number and the role of each person
 * invited ever leave it: an ID number, a wage or any other column, and any
 * other run of digits on a line, are dropped here, and the preview says so.
 *
 *   the cells     chosen once for the whole paste, from most of its lines
 *                 (a WhatsApp title or a sheet's name in A1 never decides):
 *                 a tab (in half the lines is enough), then `;` or `,`
 *                 (quote-aware), then the staff list's `|` or a spaced dash,
 *                 else the line is free text. A raw line is split first and
 *                 each cell cleaned on its own, since cleaning collapses tabs.
 *   a header      a row with no mobile in it, before any row that has one,
 *                 naming its columns (שם, נייד, תפקיד, ת"ז…): it fixes where
 *                 the name, the number and the role are, and anything before
 *                 it is a title. Two phone columns of mobiles are never
 *                 guessed between.
 *   no header     a sheet's columns found once, by most of their cells (one
 *                 row of a sheet by its cells): the phone column (Excel's
 *                 dropped zero allowed), the role column, the name (a second
 *                 single-word column that varies joins it). A phone is never
 *                 taken from another column, so a 9-digit ID that starts
 *                 with 5 is never read as one. A line with no delimiter, or
 *                 typed by hand with its mobile in another place, is read as
 *                 free text.
 *   free text     the mobile among the runs of digits, which must start with
 *                 0, 972, +972 or 00972 (never read from the end of another
 *                 country's number); a role at the line's end or start (a
 *                 named role of one word, which may be a name, only as a
 *                 field of its own or after a name of two words); the rest
 *                 the name. Every other number is dropped, but one or two
 *                 digits right after the name's words ("דנה כהן 2"). A name
 *                 line followed by its number line, as contacts copy, is
 *                 one person. WhatsApp's time, date and sender before a
 *                 message are no part of the list.
 *
 * Owners and accountants are invited one at a time, never from a list.
 * `againstTeam` then checks the paste against the team the page loaded: who
 * is already in, which invites waiting are left as they are, and which
 * still-unsent ones the list updates. The database decides the same again.
 */

/** People per import, as the database takes them. */
export const PEOPLE_IMPORT_MAX = 300;
/** Characters of pasted text read at once. */
export const PEOPLE_IMPORT_CHARS = 200_000;
/** Invites waiting in one business, its link unsent or still open. */
export const WAITING_INVITES_MAX = 500;

/** The roles a list gives: the staff's, and the named roles built on them. */
export type StaffRole = "manager" | "worker";

/** A role the list may give, as the business words it. */
export type ImportRoleChoice = {
  role: StaffRole;
  /** A named role's id, built on `role`; null for the role itself. */
  namedRole: string | null;
  /** As the business words it: its own word for the role, or the named role's name. */
  label: string;
  /** What a line may write for it: the label, a named role's Hebrew and English names. */
  names: readonly string[];
  /** Only an owner gives it (`inviteChoices`): it holds pay, or what the viewer doesn't. */
  blocked: "pay" | "held" | null;
};

/** The roles a paste is read against. */
export type ImportRoles = {
  /** The staff roles the viewer gives, in the invite form's order. */
  choices: readonly ImportRoleChoice[];
  /** Invited one at a time, never from a list. */
  oneByOne: readonly {
    role: "owner" | "accountant";
    label: string;
    names: readonly string[];
  }[];
  /** Staff roles above the viewer's rank (a worker who edits the team: managers). */
  aboveRank: readonly {
    role: StaffRole;
    namedRole: string | null;
    label: string;
    names: readonly string[];
  }[];
};

const STAFF: readonly StaffRole[] = ["manager", "worker"];
const isStaffRole = (role: Role): role is StaffRole =>
  role === "manager" || role === "worker";

/**
 * The roles a paste is read against, for a viewer: the staff roles among the
 * invite form's (`inviteChoices`, blocked ones with why), named roles by
 * their names, owners and accountants one by one, and the staff roles the
 * viewer doesn't give by rank. `named` is the business's live named roles,
 * `labels` its words for the built-in roles (`app.roles.*`).
 */
export function importRolesOf({
  choices,
  named,
  labels,
}: {
  choices: readonly InviteChoice[];
  named: readonly NamedRole[];
  labels: Record<Role, string>;
}): ImportRoles {
  const namesOf = (role: NamedRole) =>
    role.nameEn ? [role.name, role.nameEn] : [role.name];
  const staff = choices.flatMap((choice): ImportRoleChoice[] => {
    if (!isStaffRole(choice.role)) return [];
    const role = named.find((one) => one.id === choice.namedRole) ?? null;
    if (choice.namedRole !== null && role === null) return [];
    return [
      {
        role: choice.role,
        namedRole: choice.namedRole,
        label: role ? role.name : labels[choice.role],
        names: role ? namesOf(role) : [labels[choice.role]],
        blocked: choice.blocked ?? null,
      },
    ];
  });
  const given = new Set<Role>(staff.map((choice) => choice.role));
  return {
    choices: staff,
    oneByOne: (["owner", "accountant"] as const).map((role) => ({
      role,
      label: labels[role],
      names: [labels[role]],
    })),
    aboveRank: STAFF.filter((role) => !given.has(role)).flatMap((role) => [
      { role, namedRole: null, label: labels[role], names: [labels[role]] },
      ...named
        .filter((one) => one.base === role)
        .map((one) => ({
          role,
          namedRole: one.id,
          label: one.name,
          names: namesOf(one),
        })),
    ]),
  };
}

/**
 * The list's role to start with ("התפקיד ברשימה"): workers, else the first
 * staff role the viewer gives; null when every one is an owner's.
 */
export function listRoleOf(roles: ImportRoles): ImportRoleChoice | null {
  const open = roles.choices.filter((choice) => !choice.blocked);
  return (
    open.find(
      (choice) => choice.role === "worker" && choice.namedRole === null,
    ) ??
    open[0] ??
    null
  );
}

/** Why a line can't be invited as it is: it blocks the import. */
export type PeopleProblem =
  | "noPhone"
  | "invalidPhone"
  | "twoPhones"
  | "excelNumber"
  | "noName"
  | "nameTooLong"
  | "reversed"
  | "duplicate"
  | "oneByOne"
  | "notAllowed"
  | "givesPay"
  | "held"
  /**
   * The console's only: the database found the number on another
   * business's staff when the list was sent (`againstTeam`'s `elsewhere`).
   */
  | "elsewhere";

/** Worth a look, never a block. */
export type PeopleNote =
  /** The team has someone of this name with another number. */
  | { kind: "sameNameTeam"; name: string }
  /** Another line of the paste has this name with another number. */
  | { kind: "sameNameList"; line: number }
  /** The same last word stays in many names: maybe a role nobody named. */
  | { kind: "trailingWord"; word: string; count: number };

/** One person to invite, as the import sends them. */
export type ImportPerson = {
  name: string;
  /** E.164. */
  phone: string;
  role: StaffRole;
  namedRole: string | null;
  /**
   * The line named its role. False: the list's role, which a new invite
   * gets and an invite already waiting keeps its own over.
   */
  roleFromLine: boolean;
};

/** A line of the paste, numbered as pasted, and what it became. */
export type PeopleLine = {
  line: number;
  /** A name line and its number line read as one: the second one's number. */
  last?: number;
  /** The line as pasted, cleaned. */
  text: string;
  /**
   * Runs of digits and Excel's numbers left out of the name, and a role
   * column's word that names no role of the business, as written.
   */
  dropped: string[];
} & (
  | { kind: "header" }
  /** Before the header row: a sheet's name, a list's heading. */
  | { kind: "title" }
  | {
      kind: "person";
      person: ImportPerson;
      /** The role as the business words it. */
      roleLabel: string;
      notes: PeopleNote[];
    }
  /** The same person as an earlier line: left out, counted. */
  | { kind: "sameLine"; first: number }
  | {
      kind: "problem";
      problem: PeopleProblem;
      /** The line's number when it was read, for `againstTeam`. */
      phone?: string;
      /**
       * The name, when it was read before the problem (a role it can't be
       * given, `duplicate`): a member's line says "בשם …" only for another.
       */
      name?: string;
      /** The earlier line with the same number (`duplicate`). */
      first?: number;
      /** The role a line named, as the business words it. */
      roleLabel?: string;
    }
);

/** A column left out of the paste: by its header, or its place when it has none. */
export type IgnoredColumn = { header: string } | { column: number };

export type ParsedPeople = {
  /** Every non-empty line, in order. Empty with `tooLong`, `tooMany` and `phoneColumns`. */
  lines: PeopleLine[];
  /** A line was read as the columns' headers, after any title (its `kind: "header"` line). */
  header: boolean;
  /** The columns not read. */
  ignored: IgnoredColumn[];
  /** With `phoneColumns`: the phone columns' headers, when the header named them. */
  phoneHeaders?: string[];
  /** The lines of people: not the header or a title, a pair counting once. */
  people: number;
  /**
   * tooLong: past `PEOPLE_IMPORT_CHARS`, nothing read. tooMany: past
   * `PEOPLE_IMPORT_MAX` people, none drawn. phoneColumns: two columns of
   * mobiles, and nothing says which. invalid: a line has a problem.
   */
  error: "tooLong" | "tooMany" | "phoneColumns" | "invalid" | null;
};

// ---------------------------------------------------------------------------
// Roles on a line

/** Words compared as role words and headers are: `wordKey`, then `searchable`. */
const keyOf = (text: string) => searchable(wordKey(text));

type RoleMatch =
  | { kind: "choice"; choice: ImportRoleChoice }
  | { kind: "oneByOne"; label: string }
  | { kind: "notAllowed"; label: string };

type RoleMatcher = {
  match: (text: string) => RoleMatch | null;
  /**
   * A named role's one word that no built-in role is called ("בר", "טבח",
   * "מארחת"): it may be a first name or a surname too.
   */
  nameLike: (text: string) => boolean;
  /** The most words of any role's name: how far into a line's ends to look. */
  maxWords: number;
};

function roleMatcher(roles: ImportRoles): RoleMatcher {
  const choices = new Map<string, ImportRoleChoice>();
  const oneByOne = new Map<string, string>();
  const above = new Map<string, string>();
  /** The named roles' names, and the business's words for the built-in roles. */
  const named = new Set<string>();
  const builtInNames = new Set<string>();
  let maxWords = 2;
  const note = (name: string, namedRole: boolean) => {
    maxWords = Math.max(maxWords, name.trim().split(/\s+/).length);
    const key = keyOf(name);
    if (key) (namedRole ? named : builtInNames).add(key);
    return key;
  };
  for (const choice of roles.choices) {
    for (const name of choice.names) {
      const key = note(name, choice.namedRole !== null);
      if (key && !choices.has(key)) choices.set(key, choice);
    }
  }
  for (const role of roles.oneByOne) {
    for (const name of role.names) {
      const key = note(name, false);
      if (key && !oneByOne.has(key)) oneByOne.set(key, role.label);
    }
  }
  for (const role of roles.aboveRank) {
    for (const name of role.names) {
      const key = note(name, role.namedRole !== null);
      if (key && !above.has(key)) above.set(key, role.label);
    }
  }
  const nameLike = (text: string) => {
    const key = keyOf(text);
    return (
      !key.includes(" ") &&
      named.has(key) &&
      !builtInNames.has(key) &&
      builtInRoleWord(text) === null
    );
  };
  const builtIn = (role: StaffRole) =>
    roles.choices.find(
      (choice) => choice.role === role && choice.namedRole === null,
    );
  const labelOf = (role: Role) =>
    roles.aboveRank.find((one) => one.role === role && !one.namedRole)?.label ??
    roles.oneByOne.find((one) => one.role === role)?.label ??
    role;

  const match = (text: string): RoleMatch | null => {
    const key = keyOf(text);
    if (!key) return null;
    const choice = choices.get(key);
    if (choice) return { kind: "choice", choice };
    const word = builtInRoleWord(text);
    if (word === "manager" || word === "worker") {
      const given = builtIn(word);
      return given
        ? { kind: "choice", choice: given }
        : { kind: "notAllowed", label: labelOf(word) };
    }
    if (word === "owner" || word === "accountant") {
      return { kind: "oneByOne", label: labelOf(word) };
    }
    const own = oneByOne.get(key);
    if (own) return { kind: "oneByOne", label: own };
    const higher = above.get(key);
    if (higher) return { kind: "notAllowed", label: higher };
    return null;
  };
  return { match, nameLike, maxWords };
}

type RoleRead =
  | { ok: true; choice: ImportRoleChoice; fromLine: boolean }
  | { ok: false; problem: PeopleProblem; roleLabel: string };

/** What a matched role gives the line, or why it can't. */
function roleRead(
  match: RoleMatch | null,
  fallback: ImportRoleChoice,
): RoleRead {
  if (match === null) return { ok: true, choice: fallback, fromLine: false };
  if (match.kind === "oneByOne") {
    return { ok: false, problem: "oneByOne", roleLabel: match.label };
  }
  if (match.kind === "notAllowed") {
    return { ok: false, problem: "notAllowed", roleLabel: match.label };
  }
  const { choice } = match;
  if (choice.blocked) {
    return {
      ok: false,
      problem: choice.blocked === "pay" ? "givesPay" : "held",
      roleLabel: choice.label,
    };
  }
  return { ok: true, choice, fromLine: true };
}

/**
 * A role at a line's end, else at its start, and the words left; null when
 * neither end names one. A role is a field of its own, parted from the name
 * by a separator, a colon or the number ("דנה כהן 050-… ניהול", "מנהלת: דנה
 * כהן"), else the longest run of a name's words at its end, then at its
 * start, that is a role's name ("דנה ניהול 050-…", "מנהלת דנה כהן 050-…").
 * A named role of one word, which may be a first name or a surname ("בר",
 * "ברמן", "טבח"), is read off a name only at its end, with two words left
 * ("דנה כהן בר 050-…"), so never off "בר כהן" or "דנה ברמן". A line that is
 * a role's name and nothing else has no name.
 */
function roleAtEnds(
  text: string,
  roles: RoleMatcher,
): { match: RoleMatch; words: string[] } | null {
  const fields = fieldsOf(text);
  const wordsOf = (some: readonly string[]) =>
    some.join(" ").split(" ").filter(Boolean);
  const words = wordsOf(fields);
  if (words.length <= roles.maxWords) {
    const whole = roles.match(words.join(" "));
    if (whole) return { match: whole, words: [] };
  }
  const first = fields[0];
  const last = fields.at(-1);
  if (fields.length > 1 && first !== undefined && last !== undefined) {
    const atEnd = roles.match(last);
    if (atEnd) return { match: atEnd, words: wordsOf(fields.slice(0, -1)) };
    const atStart = roles.match(first);
    if (atStart) return { match: atStart, words: wordsOf(fields.slice(1)) };
  }
  const most = Math.min(roles.maxWords, words.length - 1);
  for (let count = most; count >= 1; count--) {
    const end = words.slice(-count).join(" ");
    const match = roles.match(end);
    if (match && (words.length - count >= 2 || !roles.nameLike(end))) {
      return { match, words: words.slice(0, -count) };
    }
  }
  for (let count = most; count >= 1; count--) {
    const start = words.slice(0, count).join(" ");
    const match = roles.match(start);
    if (match && !roles.nameLike(start)) {
      return { match, words: words.slice(count) };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Phones

/** Excel's shortened number ("5.01E+08"): its digits are gone. */
const EXCEL_NUMBER = /(?<![\p{L}\d.,])\d(?:[.,]\d+)?E\+\d+(?![\p{L}\d])/giu;
const DIGITS = /\d/g;
/**
 * A word that says what the number after it is ("ת.ז 123456782", "נייד:
 * 050…", "סלולרי: 050…", "מס' טלפון 050…", "Cell: 050…", "טל' 03…", "מס'
 * עובד 12", "שכר: 45", "שכר לשעה 45"): it leaves the name with its number.
 * "טל" alone is a name, so only with its dot or geresh; "עובד" alone is a
 * role ("דנה כהן עובד 050-…"), so only after "מס'"; and "שכר" alone is a
 * surname ("דוד שכר 050-…"), so only with a colon or "לשעה".
 */
const NUMBER_LABEL =
  /(?<![\p{L}\d])(?:ת[."״]?ז\.?|תעודת זהות|מספר זהות|טל[.'׳]|(?:(?:מספר|מס[.'׳]?)\s?)?(?:טלפון|נייד|פלאפון|סלולרי|סלולארי)|(?:מספר|מס[.'׳]?)\s?עובד|שכר(?: לשעה|(?=\s?:))|id|tel|phone|mobile|cell|wage|salary)(?!\p{L})\s?[:.]?\s?(?=\+?\d)/giu;
/** A passport's label, with the letters its number starts with ("דרכון PA1234567"). */
const PASSPORT_LABEL =
  /(?<![\p{L}\d])(?:(?:מספר|מס[.'׳]?)\s?)?(?:דרכון|passport)(?!\p{L})\s?[:.]?\s?[a-z]{0,2}(?=\d)/giu;
/**
 * A number outside a phone's run (`PHONE_RUN`): a digit alone, a sum
 * ("8,500", "₪7,200"). Never one inside a word ("Anna2").
 */
const LONE_NUMBER = String.raw`(?<![\p{L}\d])[₪$€£]?\d+(?:[.,]\d+)*(?![\p{L}\d\-])`;
const NUMBERS = new RegExp(`${PHONE_RUN.source}|${LONE_NUMBER}`, "gu");
/**
 * Where something was taken out of a text (a number, its label): a field of
 * the line ends there, as at a separator (`fieldsOf`). Never typed.
 */
const TAKEN = "\u{E000}";
/** The text without `TAKEN`'s marks. */
const unmarked = (text: string) => text.replaceAll(TAKEN, " ");
/** A word ends right before: a short number after it may be the name's ("דנה כהן 2"). */
const AFTER_WORD = /[\p{L}\p{M}][.'"׳״]?[ ]{1,2}$/u;
/** The most groups of digits a mobile is written in. */
const MOBILE_PARTS = 6;
const digitCount = (text: string) => text.match(DIGITS)?.length ?? 0;

/**
 * The mobile `candidate` is as a whole, in E.164, or null. `00972` reads as
 * `972`. In free text it must start with 0, 972 or +972: Excel's dropped
 * zero ("501234567") exists only in a sheet's column, and anywhere else a
 * 9-digit run starting with 5 may be an ID number.
 */
function mobileOf(candidate: string, sheet: boolean): string | null {
  let digits = candidate.replace(/\D/g, "");
  if (digits.startsWith("00972")) digits = digits.slice(2);
  if (!sheet && !digits.startsWith("0") && !digits.startsWith("972")) {
    return null;
  }
  return normalizeIsraeliMobile(digits);
}

type PhonesFound = {
  /** The distinct mobiles, in E.164, in order. */
  mobiles: string[];
  /** Excel's shortened number is there. */
  excel: boolean;
  /** A run of 7 digits or more that is no mobile: a landline, a foreign number, an ID. */
  other: boolean;
  /**
   * The text without the mobiles, Excel's numbers, the labels of numbers
   * and every number that is not the name's, each marked `TAKEN`.
   */
  rest: string;
  /** What was taken out, but the mobiles. */
  dropped: string[];
  /** The mobiles as written. */
  written: string[];
};

/**
 * The mobiles in a text, and the text without them and without any other
 * number but a name's own. A run that is no mobile as a whole is split on
 * its spaces, and the longest groups from its start are tried, so
 * "050-1234567 123456782" is a mobile and an ID beside it. A run that
 * starts with another country's code ("+380 50 …", "+38 (050) …", "00380
 * 50 …") is one foreign number, never an Israeli mobile read from its end,
 * and Excel's dropped zero is read only from a cell's first group. A number
 * of one or two digits right after the name's words, before the mobile,
 * stays the name's ("דנה כהן 2"); any other, a wage, a year or an age in
 * brackets, goes with the rest.
 */
function findPhones(text: string, sheet: boolean): PhonesFound {
  const mobiles: string[] = [];
  const dropped: string[] = [];
  const written: string[] = [];
  let excel = false;
  let other = false;
  const withoutExcel = text
    .replace(NUMBER_LABEL, TAKEN)
    .replace(PASSPORT_LABEL, TAKEN)
    .replace(EXCEL_NUMBER, (found) => {
      excel = true;
      dropped.push(found);
      return TAKEN;
    });
  const rest = withoutExcel.replace(NUMBERS, (run: string, at: number) => {
    const parts = run.trim().split(/\s+/);
    const digits = run.replace(/\D/g, "");
    const lead = (parts[0] ?? "").replace(/\D/g, "");
    // No country's code starts with 0, so "+054-…" is a stray plus; and
    // after a code of one digit (1, 7) no number starts with 0, so "001
    // 050-…" is a number before the mobile, an employee's, which goes.
    if (
      (run.startsWith("+") && !/^(?:972|0)/.test(digits)) ||
      (parts.length > 1 &&
        lead.length <= 5 &&
        lead.startsWith("00") &&
        !digits.startsWith("00972") &&
        !(lead.length <= 3 && (parts[1] ?? "").startsWith("0")))
    ) {
      if (digits.length >= 7) other = true;
      dropped.push(run.trim());
      return ` ${TAKEN} `;
    }
    // Digits written into a word ("Anna2", "45ש״ח") stay with it.
    const gluedBefore = LETTER.test(withoutExcel.charAt(at - 1));
    const gluedAfter = LETTER.test(withoutExcel.charAt(at + run.length));
    const afterWord = AFTER_WORD.test(
      withoutExcel.slice(Math.max(0, at - 4), at),
    );
    const pieces: string[] = [];
    let loose: string[] = [];
    let looseFrom = 0;
    const letGo = (end: number) => {
      if (loose.length === 0) return;
      const group = loose.join(" ");
      const count = digitCount(group);
      if (count >= 7) other = true;
      const inWord =
        (looseFrom === 0 && gluedBefore) ||
        (end === parts.length && gluedAfter);
      const names =
        looseFrom === 0 &&
        afterWord &&
        mobiles.length === 0 &&
        /^\d{1,2}$/.test(group);
      if (count < 5 && (inWord || names)) {
        pieces.push(group);
      } else {
        dropped.push(group);
        pieces.push(TAKEN);
      }
      loose = [];
    };
    let start = 0;
    while (start < parts.length) {
      // A mobile is a few groups at most ("+972 (0)50 123 45 67"), so a
      // long run of digits costs no more than its length.
      let end = Math.min(parts.length, start + MOBILE_PARTS);
      let found: string | null = null;
      if (digits.length >= 9) {
        for (; end > start; end--) {
          found = mobileOf(
            parts.slice(start, end).join(" "),
            sheet && start === 0,
          );
          if (found) break;
        }
      }
      if (found) {
        letGo(start);
        if (!mobiles.includes(found)) mobiles.push(found);
        written.push(parts.slice(start, end).join(" "));
        pieces.push(TAKEN);
        start = end;
      } else {
        if (loose.length === 0) looseFrom = start;
        loose.push(parts[start] ?? "");
        start++;
      }
    }
    letGo(parts.length);
    return ` ${pieces.join(" ")} `;
  });
  return { mobiles, excel, other, rest, dropped, written };
}

type PhoneRead =
  | { ok: true; phone: string }
  | {
      ok: false;
      problem: "noPhone" | "invalidPhone" | "twoPhones" | "excelNumber";
    };

/** One mobile, or why there is none. */
function phoneRead(found: PhonesFound): PhoneRead {
  const [only, second] = found.mobiles;
  if (only && !second) return { ok: true, phone: only };
  if (second) return { ok: false, problem: "twoPhones" };
  if (found.excel) return { ok: false, problem: "excelNumber" };
  if (found.other) return { ok: false, problem: "invalidPhone" };
  return { ok: false, problem: "noPhone" };
}

const LETTER = /\p{L}/u;

/** A sheet's cell that holds a mobile and nothing else (Excel's shortened one too). */
function isPhoneCell(cell: string): boolean {
  if (!cell) return false;
  const found = findPhones(cell, true);
  return (found.mobiles.length > 0 || found.excel) && !LETTER.test(found.rest);
}

// ---------------------------------------------------------------------------
// Lines and cells

type Delimiter = "tab" | "semicolon" | "comma" | "separators" | "free";

/**
 * The staff list's separators: `|`, or a dash with spaces, unless between
 * digits ("050 - 1234567" is one number). Of a fixed length, so a long run
 * of spaces costs no more than its length; the cells are cleaned after.
 */
const SEPARATOR_SPLIT = /\||(?<!\d)\s[-–]\s|\s[-–]\s(?!\d)/u;
/** What separates fields on a line read as free text, read as a space. */
const FREE_SEPARATORS = /[,;|\t]+|\s[-–]\s/g;
/** A list's number before the name: "1.", "1)", or "1 " and "1 - " when letters follow. */
const NUMBER_MARKER = /^\d{1,3}(?:[.)]\s+|\s+(?:[-–]\s+)?(?=\p{L}))/u;
/** WhatsApp shows a contact nobody saved with "~" before the name. */
const TILDE = /^~\s*/u;

/**
 * The delimiter of the whole paste: the one most of its lines hold. A tab
 * at least half of them, since nobody types one: a sheet's single row under
 * a line typed above it is still its cells.
 */
function delimiterOf(lines: readonly string[]): Delimiter {
  const most = (test: (line: string) => boolean) =>
    lines.filter(test).length * 2 > lines.length;
  if (lines.length === 0) return "free";
  if (lines.filter((line) => line.includes("\t")).length * 2 >= lines.length) {
    return "tab";
  }
  const semicolons = lines.filter((line) => line.includes(";")).length;
  const commas = lines.filter((line) => line.includes(",")).length;
  if (Math.max(semicolons, commas) * 2 > lines.length) {
    if (semicolons !== commas) {
      return semicolons > commas ? "semicolon" : "comma";
    }
    // In as many lines: the one written more often, a semicolon when even
    // (a sheet saved with ";" writes "1,5" for a number).
    const often = (char: string) =>
      lines.reduce((sum, line) => sum + line.split(char).length - 1, 0);
    return often(",") > often(";") ? "comma" : "semicolon";
  }
  if (most((line) => SEPARATOR_SPLIT.test(line))) return "separators";
  return "free";
}

/**
 * A CSV line's cells. A quote is special only at a cell's start, so
 * `אחמ"ש` and `ד"ר` stay as typed; `""` inside a quoted cell is a quote.
 * Null for a quote never closed: the line is read as free text.
 */
function csvCells(line: string, separator: string): string[] | null {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let at = 0; at < line.length; at++) {
    const char = line[at];
    if (quoted) {
      if (char === '"' && line[at + 1] === '"') {
        cell += '"';
        at++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === separator) {
      cells.push(cell);
      cell = "";
    } else if (char === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else {
      cell += char;
    }
  }
  if (quoted) return null;
  cells.push(cell);
  return cells;
}

/** A first cell's bullet, a list's number ("1.", "1)", "1 "), and WhatsApp's "~". */
function withoutMarker(cell: string): string {
  let now = cell;
  for (;;) {
    const next = now
      .replace(BULLET, "")
      .replace(NUMBER_MARKER, "")
      .replace(TILDE, "");
    if (next === now) return now;
    now = next;
  }
}

/**
 * The raw line's cells, each cleaned on its own, the empty ones kept, so a
 * sheet's columns stay in place. `free`: a CSV line whose quote never
 * closed, read as free text whatever the paste's columns are.
 */
function cellsOf(
  raw: string,
  delimiter: Delimiter,
): { cells: string[]; free: boolean } {
  const csv =
    delimiter === "comma" || delimiter === "semicolon"
      ? csvCells(raw, delimiter === "comma" ? "," : ";")
      : undefined;
  const split =
    delimiter === "tab"
      ? raw.split("\t")
      : csv !== undefined
        ? (csv ?? [raw])
        : delimiter === "separators"
          ? raw.split(SEPARATOR_SPLIT)
          : [raw];
  return {
    cells: split.map((cell, index) =>
      index === 0 ? withoutMarker(clean(cell)) : clean(cell),
    ),
    free: csv === null,
  };
}

type Row = {
  line: number;
  text: string;
  cells: string[];
  /** Read as free text whatever the paste's columns are. */
  free: boolean;
};

// ---------------------------------------------------------------------------
// Headers

type HeaderKind = "name" | "first" | "last" | "phone" | "role" | "id";

const HEADER_WORDS: ReadonlyMap<string, HeaderKind> = new Map(
  (
    [
      [
        "name",
        [
          "שם",
          "שם מלא",
          "שם עובד",
          "שם העובד",
          "שם עובד/ת",
          "שם העובד/ת",
          "עובד",
          "עובדת",
          "עובד/ת",
          "name",
          "full name",
          "employee",
          "employee name",
        ],
      ],
      ["first", ["שם פרטי", "השם הפרטי", "פרטי", "first name"]],
      ["last", ["שם משפחה", "שם המשפחה", "משפחה", "last name", "surname"]],
      [
        "phone",
        [
          "נייד",
          "טלפון",
          "טלפון נייד",
          "טל נייד",
          "פלאפון",
          "סלולרי",
          "סלולארי",
          "מספר נייד",
          "מספר טלפון",
          "טל",
          "מס טלפון",
          "phone",
          "phone number",
          "mobile",
          "mobile phone",
          "cell",
        ],
      ],
      ["role", ["תפקיד", "role"]],
      [
        "id",
        [
          "תז",
          "תעודת זהות",
          "מספר זהות",
          "מספר תעודת זהות",
          "דרכון",
          "id",
          "id number",
          "passport",
        ],
      ],
    ] as const
  ).flatMap(([kind, words]) =>
    words.map((word): [string, HeaderKind] => [keyOf(word), kind]),
  ),
);

/**
 * Header words that are also a person's, or a person's name ("טל"): a
 * header only beside another one.
 */
const WORKER_HEADERS = new Set(["עובד", "עובדת", "employee", "טל"].map(keyOf));

/**
 * A header in other words, once a row was read as the header: "מספר
 * פלאפון", "שם העובד המלא", "השם", "עובדים", "Staff", "טלפון הורה" (a
 * second phone column, which blocks), "מס' ת.ז.".
 */
const LOOSE_HEADERS: readonly (readonly [HeaderKind, RegExp])[] = [
  ["id", /זהות|דרכון|passport|(?:^|\s)(?:תז|id)(?:\s|$)/u],
  ["phone", /נייד|טלפון|פלאפון|סלולרי|סלולארי|phone|mobile/u],
  [
    "name",
    /^ה?שם(?:\s|$)|^שמות(?:\s|$)|^ה?עובדים$|^(?:איש|אנשי) צוות$|name|^(?:workers?|staff|employees)$/u,
  ],
  ["role", /תפקיד|role/u],
];

/**
 * A name in other words that is someone else's or something else's: a
 * branch's, a department's, a manager's, a parent's, a user name ("שם
 * הסניף", "שם מנהל", "שם האב", "Username").
 */
const NOT_THE_PERSON =
  /(?:^|\s)ה?(?:סניף|מחלקה|מנהל|מנהלת|אחראי|אחראית|אב|אם|הורה|משתמש|חברה|עסק|חנות)(?:\s|$)|user|branch|compan|department|manager|supervisor|father|mother|parent|business|store|shop/u;
/**
 * A role's name ("שם תפקיד", "שם התפקיד", "Role name"): the role's column.
 * Read with the header's marks, since a name and a role together ("שם /
 * תפקיד", "Name (Role)") is the name's column, its key the same.
 */
const ROLES_NAME =
  /(?:^|\s)ה?שם ה?תפקיד(?:\s|$)|(?:^|\s)role name(?:\s|$)|name of (?:the )?role/u;

/** What a header's cell names exactly, as the header words are written. */
function exactHeaderKind(cell: string): HeaderKind | null {
  return HEADER_WORDS.get(keyOf(cell)) ?? null;
}

/** What a header's cell names, or null for a column nobody asked for. */
function headerKindOf(cell: string): HeaderKind | null {
  const key = keyOf(cell);
  const notTheName =
    NOT_THE_PERSON.test(key) ||
    ROLES_NAME.test(wordKey(cell).replace(/\s+/g, " ").trim());
  return (
    HEADER_WORDS.get(key) ??
    LOOSE_HEADERS.find(
      ([kind, test]) => test.test(key) && !(kind === "name" && notTheName),
    )?.[0] ??
    null
  );
}

/**
 * Whether a row names its columns: a header word exactly, which is no
 * person's word too ("עובד" is one only beside another), or two cells that
 * name columns. A sheet's title in one cell ("שם החנות: …") never is.
 */
function namesColumns(row: Row): boolean {
  const filled = row.cells.filter(Boolean);
  const exact = filled.filter(
    (cell) =>
      exactHeaderKind(cell) !== null && !WORKER_HEADERS.has(keyOf(cell)),
  );
  const named = filled.filter((cell) => headerKindOf(cell) !== null);
  return exact.length >= 1 || named.length >= 2;
}

/**
 * Whether a row holds a mobile in any cell: a cell of digits as a sheet's
 * phone column reads it (Excel's dropped zero), and a cell with words in it
 * as free text is read, so a title's company or ID number ("ח.פ.
 * 514789632") is no mobile.
 */
function holdsMobile(row: Row): boolean {
  return row.cells.some(
    (cell) => findPhones(cell, !LETTER.test(cell)).mobiles.length > 0,
  );
}

// ---------------------------------------------------------------------------
// Columns

type Columns =
  | { kind: "free"; skip: ReadonlySet<number> }
  | {
      kind: "columns";
      phone: number;
      role: number | null;
      name: number[];
      /** A header fixed the columns: no role is read at a name's ends. */
      fixed: boolean;
      /** The lines read as free text all the same (`uneven`), by their number. */
      free: ReadonlySet<number>;
    }
  | {
      kind: "phoneColumns";
      /** The phone columns' headers, when the header named them. */
      headers: string[];
    };

/**
 * Where the name, the number and the role are, read once for the whole
 * paste. `typed`: cells split by anything but a sheet's tabs, so lines
 * typed by hand, which need not keep their places.
 */
function columnsOf(
  rows: readonly Row[],
  header: Row | null,
  roles: RoleMatcher,
  typed: boolean,
): { columns: Columns; ignored: IgnoredColumn[] } {
  const width = Math.max(
    header?.cells.length ?? 0,
    ...rows.map((row) => row.cells.length),
  );
  const all = Array.from({ length: width }, (_, column) => column);
  const kindAt = (column: number): HeaderKind | "other" | "none" => {
    const cell = header?.cells[column] ?? "";
    if (!cell) return "none";
    return headerKindOf(cell) ?? "other";
  };
  const filledIn = (among: readonly Row[], column: number) =>
    among.map((row) => row.cells[column] ?? "").filter(Boolean);
  const mostIn = (
    among: readonly Row[],
    column: number,
    test: (cell: string) => boolean,
  ) => {
    const cells = filledIn(among, column);
    return cells.length > 0 && cells.filter(test).length * 2 > cells.length;
  };
  const open = (column: number) =>
    kindAt(column) === "none" || kindAt(column) === "other";
  const namedIn = (
    among: readonly Row[],
    taken: ReadonlySet<number>,
  ): IgnoredColumn[] =>
    all
      .filter(
        (column) =>
          !taken.has(column) &&
          (filledIn(among, column).length > 0 || kindAt(column) !== "none"),
      )
      .map((column) => {
        const cell = header?.cells[column] ?? "";
        return cell ? { header: cell } : { column: column + 1 };
      });

  const phoneHeaded = all.filter((column) => kindAt(column) === "phone");
  // A headed column of landlines, or an empty one, is nobody's mobile: the
  // headed column of mobiles is the phone, and the other one is left out.
  const mobileHeaded = phoneHeaded.filter((column) =>
    mostIn(rows, column, isPhoneCell),
  );
  let phones =
    phoneHeaded.length > 0
      ? mobileHeaded.length > 0
        ? mobileHeaded
        : phoneHeaded.slice(0, 1)
      : all.filter(
          (column) => open(column) && mostIn(rows, column, isPhoneCell),
        );
  if (typed && phoneHeaded.length === 0 && phones.length > 1) {
    // Typed by hand, a number in another place on a line or two is no
    // column: the phone's column is filled on most lines. One with a
    // mobile beside the phone's on a line is a second phone (a parent's,
    // filled on some lines): never guessed between when a line has it with
    // no mobile of its own in the phone's column, and otherwise left out.
    const full = phones.filter(
      (column) => filledIn(rows, column).length * 2 > rows.length,
    );
    const mobileAt = (row: Row, column: number) =>
      isPhoneCell(row.cells[column] ?? "");
    const second = phones.filter((column) => !full.includes(column));
    const beside = second.some((column) =>
      rows.some(
        (row) =>
          mobileAt(row, column) && full.some((one) => mobileAt(row, one)),
      ),
    );
    const instead = second.some((column) =>
      rows.some(
        (row) =>
          mobileAt(row, column) && !full.some((one) => mobileAt(row, one)),
      ),
    );
    if (full.length > 0 && !(beside && instead)) phones = full;
  }
  if (phones.length > 1) {
    return {
      columns: {
        kind: "phoneColumns",
        headers:
          phoneHeaded.length > 0
            ? phones.map((column) => header?.cells[column] ?? "")
            : [],
      },
      ignored: [],
    };
  }
  const [phone] = phones;
  if (phone === undefined) {
    // Read line by line, as free text: never an ID column, which a header named.
    const skip = new Set(all.filter((column) => kindAt(column) === "id"));
    return {
      columns: { kind: "free", skip },
      ignored: header
        ? namedIn(rows, new Set(all.filter((c) => !skip.has(c))))
        : [],
    };
  }

  // A line that doesn't keep the columns is read as free text: one cell (a
  // line with no delimiter), or, typed by hand with no header, a phone's
  // cell with no mobile on a line that holds one elsewhere, by free text's
  // rule ("052-…, יוסי לוי" among "דנה כהן, 050-…").
  const uneven = (row: Row) => {
    if (row.free || row.cells.length === 1) return true;
    if (!typed || header !== null) return false;
    return (
      findPhones(row.cells[phone] ?? "", true).mobiles.length === 0 &&
      findPhones(row.cells.join(" "), false).mobiles.length > 0
    );
  };
  const read = rows.filter((row) => !uneven(row));
  const free = new Set(rows.filter(uneven).map((row) => row.line));
  const filled = (column: number) => filledIn(read, column);
  const most = (column: number, test: (cell: string) => boolean) =>
    mostIn(read, column, test);

  const isRole = (cell: string) => roles.match(cell) !== null;
  const roleHeaded = all.filter((column) => kindAt(column) === "role");
  const role =
    roleHeaded[0] ??
    all.find(
      (column) =>
        column !== phone &&
        (header ? kindAt(column) === "none" : true) &&
        most(column, isRole),
    ) ??
    null;

  const single = (column: number) =>
    most(column, (cell) => !cell.includes(" "));
  const nameHeaded = all.filter((column) => kindAt(column) === "name");
  const firstHeaded = all.filter((column) => kindAt(column) === "first");
  const lastHeaded = all.filter((column) => kindAt(column) === "last");
  // A name's header word exactly ("שם העובד", "Employee name") before one
  // in other words, wherever each sits; and a first name's column with a
  // last name's before a name's header in other words ("Nickname"), which
  // beside a first name alone is the full name ("שם העובד המלא").
  const exactName = nameHeaded.filter(
    (column) => exactHeaderKind(header?.cells[column] ?? "") === "name",
  );
  const nameColumn =
    exactName[0] ??
    (firstHeaded.length > 0 && lastHeaded.length > 0
      ? undefined
      : nameHeaded[0]);
  const [lastColumn] = lastHeaded;
  let name: number[];
  if (nameColumn !== undefined) {
    // "שם" beside "שם משפחה", "משפחה" or "Surname" holds the first name:
    // the two are joined, the first name first.
    name =
      firstHeaded.length === 0 && lastColumn !== undefined && single(nameColumn)
        ? [nameColumn, lastColumn]
        : [nameColumn];
  } else if (firstHeaded.length + lastHeaded.length > 0) {
    name = [...firstHeaded, ...lastHeaded].slice(0, 2);
  } else {
    const textAmong = (test: (column: number) => boolean) =>
      all.filter(
        (column) =>
          column !== phone &&
          column !== role &&
          test(column) &&
          most(column, (cell) => LETTER.test(cell)),
      );
    let text = textAmong((column) =>
      header ? kindAt(column) === "none" : open(column),
    );
    if (header && text.length === 0) {
      // The name's header in words nobody listed ("צוות"): the header's one
      // column of words is the name, and with two nothing is guessed.
      const other = textAmong((column) => kindAt(column) === "other");
      if (other.length === 1) text = other;
    }
    /**
     * Surnames mostly differ, while a position or a department repeats: at
     * least half the cells are words of their own.
     */
    const varied = (column: number) => {
      const keys = filled(column).map(keyOf);
      return new Set(keys).size * 2 >= keys.length;
    };
    const [first, second] = text;
    // A second column of single words joins the name as its surname: one
    // that varies, holds no digits ("45ש״ח"), and sits before the phone's
    // column if the first does.
    name =
      first === undefined
        ? []
        : second !== undefined &&
            single(first) &&
            single(second) &&
            varied(second) &&
            most(second, (cell) => !/\d/.test(cell)) &&
            !(first < phone && phone < second)
          ? [first, second]
          : [first];
  }
  const taken = new Set<number>([phone, ...name]);
  if (role !== null) taken.add(role);
  return {
    columns: {
      kind: "columns",
      phone,
      role,
      name,
      fixed: header !== null,
      free,
    },
    ignored: namedIn(read, taken),
  };
}

// ---------------------------------------------------------------------------
// A line's person

/**
 * The edges a name never keeps: separators, a list's marks, a colon, a
 * quote left by a cell that never closed it, a slash or a currency's sign
 * whose number went. A geresh at the end stays ("ג׳ורג׳").
 */
const EDGE_START = /^[\s(:.,;|/\-–—~*•·"״₪$€£]+/u;
const EDGE_END = /[\s(:,;|/\-–—"₪$€£]+$/u;

/** A name without the punctuation at its edges; an initial keeps its dot ("שירן א."). */
function trimName(text: string): string {
  let name = text
    // A number in brackets leaves them empty: "אבי (058-1234567)".
    .replace(/\(\s*\)|\[\s*\]/g, " ")
    .replace(/\s+/g, " ")
    .replace(EDGE_START, "")
    .replace(EDGE_END, "");
  if (name.endsWith(")") && !name.includes("(")) {
    name = name.replace(/\)+$/u, "").replace(EDGE_END, "");
  }
  // A sentence's dot goes; an initial's, after a lone letter, stays.
  const undotted = name.replace(/\.+$/u, "");
  if (undotted !== name && /\p{L}\p{L}$/u.test(undotted.slice(-2))) {
    name = undotted;
  }
  return name;
}

type Reading = {
  phone: PhoneRead;
  /** The name's words before a role was read off them. */
  nameText: string;
  role: RoleRead;
  dropped: string[];
  /** Where the role came from, for the trailing-word note. */
  free: boolean;
};

/**
 * A line's fields, as free text reads them: what a separator, a colon or
 * something taken out (`TAKEN`) parts, each without its edges' marks.
 */
function fieldsOf(text: string): string[] {
  return text
    .replace(FREE_SEPARATORS, TAKEN)
    .replace(/:/g, `:${TAKEN}`)
    .split(TAKEN)
    .map(trimName)
    .filter(Boolean);
}

/**
 * A line read as free text: its cells, but those not read, joined by a tab
 * so a short number in a cell of its own is never the name's.
 */
function freeReading(
  text: string,
  roles: RoleMatcher,
  fallback: ImportRoleChoice,
): Reading {
  const found = findPhones(text, false);
  const words = trimName(unmarked(found.rest).replace(FREE_SEPARATORS, " "))
    .split(/\s+/)
    .filter(Boolean);
  const atEnds = roleAtEnds(found.rest, roles);
  return {
    phone: phoneRead(found),
    nameText: trimName((atEnds?.words ?? words).join(" ")),
    role: roleRead(atEnds?.match ?? null, fallback),
    dropped: found.dropped,
    free: true,
  };
}

/** A sheet's row read by its columns. */
function columnReading(
  cells: readonly string[],
  columns: Extract<Columns, { kind: "columns" }>,
  roles: RoleMatcher,
  fallback: ImportRoleChoice,
): Reading {
  const phoneCell = cells[columns.phone] ?? "";
  const phone: PhoneRead = phoneCell
    ? phoneRead(findPhones(phoneCell, true))
    : { ok: false, problem: "noPhone" };
  const nameCells = columns.name
    .map((column) => cells[column] ?? "")
    .filter(Boolean)
    .join(" ");
  // Digits in the name's cells leave the name, a mobile there too: a phone
  // is read from the phone's column only.
  const inName = findPhones(nameCells, false);
  const dropped = [...inName.written, ...inName.dropped];
  const nameText = trimName(unmarked(inName.rest));
  if (columns.role !== null) {
    // A word that names no role of the business, as a job title in a
    // sheet's "תפקיד" ("קופאית"), is left out and said: the line gets the
    // list's role. A role the viewer can't give from a list still stops it.
    const cell = cells[columns.role] ?? "";
    const match = cell ? roles.match(cell) : null;
    return {
      phone,
      nameText,
      role: roleRead(match, fallback),
      dropped: cell && match === null ? [...dropped, cell] : dropped,
      free: false,
    };
  }
  if (columns.fixed) {
    return {
      phone,
      nameText,
      role: roleRead(null, fallback),
      dropped,
      free: false,
    };
  }
  const words = nameText.split(/\s+/).filter(Boolean);
  const atEnds = roleAtEnds(inName.rest, roles);
  return {
    phone,
    nameText: trimName((atEnds?.words ?? words).join(" ")),
    role: roleRead(atEnds?.match ?? null, fallback),
    dropped,
    free: false,
  };
}

type Read = PeopleLine & { free: boolean };

/** What a reading becomes: the person, or the line's first problem. */
function lineOf(
  at: { line: number; last?: number; text: string },
  reading: Reading,
): Read {
  const base = {
    line: at.line,
    ...(at.last !== undefined ? { last: at.last } : {}),
    text: at.text,
    dropped: reading.dropped,
    free: reading.free,
  };
  const problem = (
    problem: PeopleProblem,
    more: { roleLabel?: string; name?: string } = {},
  ): Read => ({
    ...base,
    kind: "problem",
    problem,
    ...(reading.phone.ok ? { phone: reading.phone.phone } : {}),
    ...more,
  });
  if (!reading.phone.ok) return problem(reading.phone.problem);
  if (readsBackwards(reading.nameText)) return problem("reversed");
  const name = parseTeamName(reading.nameText);
  if (!name.ok) {
    return problem(name.error === "required" ? "noName" : "nameTooLong");
  }
  if (!reading.role.ok) {
    return problem(reading.role.problem, {
      roleLabel: reading.role.roleLabel,
      name: name.name,
    });
  }
  const { choice, fromLine } = reading.role;
  return {
    ...base,
    kind: "person",
    person: {
      name: name.name,
      phone: reading.phone.phone,
      role: choice.role,
      namedRole: choice.namedRole,
      roleFromLine: fromLine,
    },
    roleLabel: choice.label,
    notes: [],
  };
}

// ---------------------------------------------------------------------------
// A name line and its number line

/**
 * Contacts copied one field a line ("דנה כהן" / "050-1234567"): when no
 * line of the paste holds both a name and a mobile, each name line with no
 * digits is joined to the line right after it that holds only a mobile, or
 * the other way round, whichever order the paste keeps most.
 */
function pairs(
  rows: readonly Row[],
  readings: readonly Reading[],
): { order: "nameFirst" | "numberFirst"; at: ReadonlySet<number> } | null {
  const nameOnly = (index: number) => {
    const row = rows[index];
    const reading = readings[index];
    return (
      row !== undefined &&
      reading !== undefined &&
      !/\d/.test(row.text) &&
      LETTER.test(reading.nameText)
    );
  };
  const numberOnly = (index: number) => {
    const reading = readings[index];
    if (!reading?.phone.ok || LETTER.test(reading.nameText)) return false;
    return reading.role.ok && !reading.role.fromLine;
  };
  const both = readings.some(
    (reading) => reading.phone.ok && LETTER.test(reading.nameText),
  );
  if (both) return null;
  const starts = (
    first: (i: number) => boolean,
    then: (i: number) => boolean,
  ) => {
    const at = new Set<number>();
    for (let index = 0; index + 1 < rows.length; index++) {
      if (first(index) && then(index + 1)) {
        at.add(index);
        index++;
      }
    }
    return at;
  };
  const nameFirst = starts(nameOnly, numberOnly);
  const numberFirst = starts(numberOnly, nameOnly);
  if (nameFirst.size === 0 && numberFirst.size === 0) return null;
  return numberFirst.size > nameFirst.size
    ? { order: "numberFirst", at: numberFirst }
    : { order: "nameFirst", at: nameFirst };
}

// ---------------------------------------------------------------------------
// The paste

/**
 * A dash of another kind beside a digit, as a phone, WhatsApp or a word
 * processor writes a number ("054‑710‑2201", "054–710–2201", "052−765"):
 * read as "-". Only there, so a name's own dash stays.
 */
const DIGIT_DASH = /(?<=\d\s?)[\u{2010}-\u{2015}\u{2212}](?=\s?\d)/gu;
const CLOCK = String.raw`\d{1,2}:\d{2}(?::\d{2})?(?:\s?[ap]\.?m\.?)?`;
const DAY = String.raw`\d{1,4}[./-]\d{1,2}[./-]\d{1,4}`;
/**
 * What WhatsApp writes before each message when several are copied
 * ("[10:15, 26.11.2026] אורי בן דוד: ") or a chat is exported
 * ("26.11.2026, 10:15 - אורי בן דוד: "): the time, the date and who sent
 * it, never a person of the list.
 */
const WHATSAPP_PREFIX = new RegExp(
  String.raw`^(?:\[(?:${CLOCK},?\s${DAY}|${DAY},?\s${CLOCK})\]\s?|${DAY},?\s${CLOCK}\s[-–]\s)[^:]{1,80}?:\s`,
  "iu",
);

/**
 * The non-empty lines, numbered from 1 as pasted, digits as 0–9, every
 * dash in a number "-", and WhatsApp's own words before a message gone.
 */
function rowsOf(input: string): { line: number; raw: string; text: string }[] {
  return input.split(/\r?\n/).flatMap((line, index) => {
    const digits = westernDigits(line).replace(DIGIT_DASH, "-");
    const cleaned = clean(digits);
    // A message has no tab, so its line loses nothing to cleaning.
    const prefix = digits.includes("\t") ? null : WHATSAPP_PREFIX.exec(cleaned);
    const raw = prefix ? cleaned.slice(prefix[0].length) : digits;
    const text = prefix ? clean(raw) : cleaned;
    return text ? [{ line: index + 1, raw, text }] : [];
  });
}

/** Names compared case aside, the same on every device whatever its language. */
const nameKey = (name: string) => name.toLowerCase();

/**
 * Reads a pasted list of people against the roles the viewer gives, with
 * `fallback`, the list's role, for each line that names none. Empty input
 * is an empty list.
 */
export function parsePeopleList(
  input: string,
  roles: ImportRoles,
  fallback: ImportRoleChoice,
): ParsedPeople {
  if (input.length > PEOPLE_IMPORT_CHARS) {
    return {
      lines: [],
      header: false,
      ignored: [],
      people: 0,
      error: "tooLong",
    };
  }
  const matcher = roleMatcher(roles);
  const raws = rowsOf(input);
  const delimiter = delimiterOf(raws.map((row) => row.raw));
  const rows: Row[] = raws.map((row) => ({
    line: row.line,
    text: row.text,
    ...cellsOf(row.raw, delimiter),
  }));

  // The header: a row naming its columns before any row with a mobile. A
  // sheet's title in its one cell may hold a contact's mobile ("איש קשר:
  // 050-…"), and the search goes on past it.
  let headerAt = -1;
  if (delimiter !== "free") {
    for (const [index, row] of rows.entries()) {
      const title =
        delimiter === "tab" && row.cells.filter(Boolean).length === 1;
      if (holdsMobile(row) && !title) break;
      if (namesColumns(row)) {
        headerAt = index;
        break;
      }
    }
  }
  const header = headerAt >= 0 ? (rows[headerAt] ?? null) : null;
  const peopleRows = rows.slice(headerAt + 1);
  const before = rows.slice(0, Math.max(0, headerAt)).map(
    (row): PeopleLine => ({
      line: row.line,
      text: row.text,
      dropped: [],
      kind: "title",
    }),
  );
  const headerLine: PeopleLine[] = header
    ? [{ line: header.line, text: header.text, dropped: [], kind: "header" }]
    : [];

  // Columns from a header, from most of two lines or more, or from a
  // sheet's single row: its cells, never joined into a name.
  const { columns, ignored } =
    delimiter !== "free" &&
    (header !== null || peopleRows.length >= 2 || delimiter === "tab")
      ? columnsOf(peopleRows, header, matcher, delimiter !== "tab")
      : {
          columns: { kind: "free", skip: new Set<number>() } as Columns,
          ignored: [],
        };

  if (columns.kind === "phoneColumns") {
    return {
      lines: [],
      header: header !== null,
      ignored: [],
      people: peopleRows.length,
      error: "phoneColumns",
      ...(columns.headers.length > 0 ? { phoneHeaders: columns.headers } : {}),
    };
  }

  // A line with nothing to read, letters or digits (a row of dashes): left out.
  const decoration = (row: Row) => !/[\p{L}\d]/u.test(row.text);
  const readings: Reading[] = peopleRows.map((row) =>
    columns.kind === "columns" && !columns.free.has(row.line)
      ? columnReading(row.cells, columns, matcher, fallback)
      : freeReading(
          row.cells
            .filter(
              (_, column) =>
                columns.kind !== "free" || !columns.skip.has(column),
            )
            .join("\t"),
          matcher,
          fallback,
        ),
  );
  const paired =
    columns.kind === "free" && header === null
      ? pairs(peopleRows, readings)
      : null;

  const read: Read[] = [];
  for (let index = 0; index < peopleRows.length; index++) {
    const row = peopleRows[index] as Row;
    const reading = readings[index] as Reading;
    if (decoration(row)) {
      read.push({
        line: row.line,
        text: row.text,
        dropped: [],
        kind: "title",
        free: true,
      });
      continue;
    }
    if (paired?.at.has(index)) {
      const next = peopleRows[index + 1] as Row;
      const nextReading = readings[index + 1] as Reading;
      const [named, numbered] =
        paired.order === "nameFirst"
          ? [reading, nextReading]
          : [nextReading, reading];
      read.push(
        lineOf(
          {
            line: row.line,
            last: next.line,
            text: `${row.text} · ${next.text}`,
          },
          {
            ...named,
            phone: numbered.phone,
            dropped: [...named.dropped, ...numbered.dropped],
          },
        ),
      );
      index++;
      continue;
    }
    read.push(lineOf(row, reading));
  }

  // The same number twice: the same person once, by the same name and the
  // same role, written on the line or the list's; or a conflict.
  const firstOf = new Map<
    string,
    { line: number; name: string; key: string; person: ImportPerson }
  >();
  const lines: Read[] = read.map((line): Read => {
    if (line.kind !== "person") return line;
    const { person } = line;
    const first = firstOf.get(person.phone);
    if (!first) {
      firstOf.set(person.phone, {
        line: line.line,
        name: nameKey(person.name),
        key: roleChoiceKey(person),
        person,
      });
      return line;
    }
    const base = {
      line: line.line,
      ...(line.last !== undefined ? { last: line.last } : {}),
      text: line.text,
      dropped: line.dropped,
      free: line.free,
    };
    if (
      first.name === nameKey(person.name) &&
      first.key === roleChoiceKey(person)
    ) {
      // The first line is the one sent, as naming its role when either
      // does: an invite waiting takes the role a line wrote.
      if (person.roleFromLine) first.person.roleFromLine = true;
      return { ...base, kind: "sameLine", first: first.line };
    }
    return {
      ...base,
      kind: "problem",
      problem: "duplicate",
      phone: person.phone,
      name: person.name,
      first: first.line,
    };
  });

  const persons = lines.filter(
    (line): line is Extract<Read, { kind: "person" }> => line.kind === "person",
  );
  // The same name with another number.
  const byName = new Map<string, number[]>();
  for (const line of persons) {
    const key = nameKey(line.person.name);
    byName.set(key, [...(byName.get(key) ?? []), line.line]);
  }
  for (const line of persons) {
    const others = (byName.get(nameKey(line.person.name)) ?? []).filter(
      (other) => other !== line.line,
    );
    const [other] = others;
    if (other !== undefined) {
      line.notes.push({ kind: "sameNameList", line: other });
    }
  }

  const people = lines.filter(
    (line) =>
      line.kind === "person" ||
      line.kind === "problem" ||
      line.kind === "sameLine",
  ).length;

  // The same last word in many names, in free text: maybe a role.
  if (header === null) {
    const byLast = new Map<string, Extract<Read, { kind: "person" }>[]>();
    for (const line of persons) {
      if (!line.free) continue;
      const words = line.person.name.split(" ");
      const last = words.at(-1);
      if (words.length < 2 || !last) continue;
      const key = keyOf(last);
      byLast.set(key, [...(byLast.get(key) ?? []), line]);
    }
    for (const group of byLast.values()) {
      if (group.length < 3 || group.length * 10 < people) continue;
      const word = group[0]?.person.name.split(" ").at(-1) ?? "";
      for (const line of group) {
        line.notes.push({ kind: "trailingWord", word, count: group.length });
      }
    }
  }

  const shown: PeopleLine[] = [
    ...before,
    ...headerLine,
    ...lines.map(({ free: _free, ...line }) => line as PeopleLine),
  ].sort((a, b) => a.line - b.line);

  if (people > PEOPLE_IMPORT_MAX) {
    return {
      lines: [],
      header: header !== null,
      ignored,
      people,
      error: "tooMany",
    };
  }
  return {
    lines: shown,
    header: header !== null,
    ignored,
    people,
    error: shown.some((line) => line.kind === "problem") ? "invalid" : null,
  };
}

// ---------------------------------------------------------------------------
// Against the team

/** An invite not claimed yet, as the screen checks a paste against it. */
export type KnownInvite = {
  id: string;
  phone: string;
  name: string | null;
  role: Role;
  namedRole: string | null;
  /** No link was ever made for it, so nobody holds one. */
  linkPending: boolean;
  /** Its link ran out. */
  expired: boolean;
  /**
   * The viewer may update it: its role is a manager's or a worker's, one
   * they give (`canResendInvite`, so a held named role is not), and not an
   * owner's alone for them.
   */
  touchable: boolean;
};

/** The team a paste is checked against: only this business's, as its screen reads it. */
export type KnownTeam = {
  members: readonly { phone: string; name: string | null }[];
  invites: readonly KnownInvite[];
  /** Invites waiting: unclaimed, and their link unsent or still open. */
  waiting: number;
};

/** The team as a paste is checked against it: members with a number, and the invites. */
export function knownTeamOf(
  members: readonly { phone: string | null; name: string | null }[],
  invites: readonly KnownInvite[],
): KnownTeam {
  return {
    members: members.flatMap((member) =>
      member.phone ? [{ phone: member.phone, name: member.name }] : [],
    ),
    invites,
    waiting: invites.filter((invite) => invite.linkPending || !invite.expired)
      .length,
  };
}

/** What happens to a line of people, against the team. */
export type ImportOutcome =
  /** A new invite. */
  | "new"
  /** An invite with no link yet: its name and role change. */
  | "update"
  /** An invite with no link yet: its name changes, its role stays. */
  | "updateName"
  /** An invite with no link yet: its role changes. */
  | "updateRole"
  /** An invite with no link yet, as the line says already. */
  | "same"
  | "member"
  /** An invite with a link: left as it is. */
  | "invited"
  /** An invite with no link yet that the viewer may not change: left as it is. */
  | "locked"
  /** An invite whose link ran out: "קישור חדש" on the Team screen opens it. */
  | "expired"
  /** An owner's or an accountant's invite: never changed by a list. */
  | "otherRole";

/** A line checked against the team. */
export type CheckedLine = PeopleLine & {
  outcome?: ImportOutcome;
  /** The team's name for the member with this number. */
  memberName?: string | null;
  /** The role of the invite already waiting, for the words that name it. */
  invite?: RoleChoice;
};

export type TeamCheck = {
  lines: CheckedLine[];
  /** New and updated, in the order of the lines: what the import sends. */
  send: (ImportPerson & { line: number })[];
  counts: Record<ImportOutcome | "problems", number> & {
    /** What is sent, by the role each ends with (`roleChoiceKey`). */
    byRole: Record<string, number>;
  };
  /** Why the import can't go now, decided once in this order. */
  blocked:
    | "tooLong"
    | "tooMany"
    | "phoneColumns"
    | "invalid"
    | "tooManyOpen"
    | "nothingNew"
    | null;
};

const WRITTEN = new Set<ImportOutcome>([
  "new",
  "update",
  "updateName",
  "updateRole",
]);

/**
 * The paste against the team the page loaded. A line whose number is a
 * member's, or holds an invite this import leaves alone (one with a link,
 * one the viewer may not change, an owner's or an accountant's), is left out
 * with that outcome, whatever its name or role says: so the owner's own
 * line, an accountant on the team and a second paste of the same sheet never
 * block. Only a line that would be written is held to its problem.
 * `elsewhere` holds the numbers the database found on another business's
 * staff when the console sent the list (its 23505 `elsewhere`, by the rows'
 * places, which the screen maps to their numbers): a line that would be
 * written with one of them is to fix (`problem: "elsewhere"`), so the list
 * waits until it is removed. A line left out is never one, as the database
 * asks only what it writes.
 */
export function againstTeam(
  parsed: ParsedPeople,
  known: KnownTeam,
  elsewhere: ReadonlySet<string> = new Set(),
): TeamCheck {
  const members = new Map(known.members.map((m) => [m.phone, m]));
  const invites = new Map(known.invites.map((i) => [i.phone, i]));
  const teamNames = new Map<string, string>();
  for (const member of known.members) {
    if (member.name) teamNames.set(nameKey(member.name), member.name);
  }

  const checkedLine = (line: PeopleLine): CheckedLine => {
    const phone =
      line.kind === "person"
        ? line.person.phone
        : line.kind === "problem"
          ? line.phone
          : undefined;
    if (phone === undefined) return line;
    const member = members.get(phone);
    if (member) return { ...line, outcome: "member", memberName: member.name };
    const invite = invites.get(phone);
    if (invite) {
      const role = { role: invite.role, namedRole: invite.namedRole };
      if (!isStaffRole(invite.role)) {
        return { ...line, outcome: "otherRole", invite: role };
      }
      if (!invite.linkPending) {
        return { ...line, outcome: invite.expired ? "expired" : "invited" };
      }
      if (!invite.touchable) return { ...line, outcome: "locked" };
      if (line.kind !== "person") return line;
      const { person } = line;
      const kept = parseTeamName(invite.name ?? "");
      const sameName = kept.ok && kept.name === person.name;
      const sameRole =
        !person.roleFromLine ||
        (person.role === invite.role && person.namedRole === invite.namedRole);
      const outcome: ImportOutcome =
        sameName && sameRole
          ? "same"
          : sameRole
            ? "updateName"
            : sameName
              ? "updateRole"
              : "update";
      return { ...line, outcome, invite: role };
    }
    if (line.kind !== "person") return line;
    const namesake = teamNames.get(nameKey(line.person.name));
    return namesake
      ? {
          ...line,
          outcome: "new",
          notes: [...line.notes, { kind: "sameNameTeam", name: namesake }],
        }
      : { ...line, outcome: "new" };
  };

  const lines = parsed.lines.map((line): CheckedLine => {
    const checked = checkedLine(line);
    if (
      checked.kind !== "person" ||
      !checked.outcome ||
      !WRITTEN.has(checked.outcome) ||
      !elsewhere.has(checked.person.phone)
    ) {
      return checked;
    }
    // On another business's staff: never written, until the line goes.
    const { line: at, last, text, dropped, person, roleLabel } = checked;
    return {
      line: at,
      ...(last !== undefined ? { last } : {}),
      text,
      dropped,
      kind: "problem",
      problem: "elsewhere",
      phone: person.phone,
      name: person.name,
      roleLabel,
    };
  });

  const counts: TeamCheck["counts"] = {
    new: 0,
    update: 0,
    updateName: 0,
    updateRole: 0,
    same: 0,
    member: 0,
    invited: 0,
    locked: 0,
    expired: 0,
    otherRole: 0,
    problems: 0,
    byRole: {},
  };
  const send: TeamCheck["send"] = [];
  for (const line of lines) {
    if (line.outcome) counts[line.outcome]++;
    else if (line.kind === "problem") counts.problems++;
    if (line.kind !== "person" || !line.outcome || !WRITTEN.has(line.outcome)) {
      continue;
    }
    send.push({ ...line.person, line: line.line });
    const ends: RoleChoice =
      line.outcome === "updateName" && line.invite
        ? line.invite
        : { role: line.person.role, namedRole: line.person.namedRole };
    const key = roleChoiceKey(ends);
    counts.byRole[key] = (counts.byRole[key] ?? 0) + 1;
  }

  const blocked: TeamCheck["blocked"] =
    parsed.error === "tooLong" ||
    parsed.error === "tooMany" ||
    parsed.error === "phoneColumns"
      ? parsed.error
      : counts.problems > 0
        ? "invalid"
        : known.waiting + counts.new > WAITING_INVITES_MAX
          ? "tooManyOpen"
          : parsed.people > 0 && send.length === 0
            ? "nothingNew"
            : null;
  return { lines, send, counts, blocked };
}

/**
 * The role an invite a list wrote ends with, by what the database answered
 * for its row, never by the preview's outcome, which read the team as the
 * page loaded it: a new invite, or one updated from a line that named its
 * role, has the role sent; one updated from a line that named none keeps
 * its own, which the screen knows only from the invite it read
 * (`line.invite`). Null when it read none: an invite made meanwhile,
 * elsewhere, whose role the screen never saw.
 */
export function writtenRoleOf(
  status: "created" | "updated",
  person: ImportPerson,
  line: CheckedLine | undefined,
): RoleChoice | null {
  if (status === "created" || person.roleFromLine) {
    return { role: person.role, namedRole: person.namedRole };
  }
  return line?.invite ?? null;
}

/** Where a checked line is shown: to fix, to invite, or left out. */
export function groupOf(line: CheckedLine): "fix" | "invite" | "leftOut" {
  if (line.outcome) return WRITTEN.has(line.outcome) ? "invite" : "leftOut";
  return line.kind === "problem" ? "fix" : "leftOut";
}

/** The lines as a computer's table lists them: to fix, new, updated, left out. */
export function tableOrder(lines: readonly CheckedLine[]): CheckedLine[] {
  const rank = (line: CheckedLine) => {
    const group = groupOf(line);
    if (group === "fix") return 0;
    if (group === "invite") return line.outcome === "new" ? 1 : 2;
    return 3;
  };
  return [...lines].sort((a, b) => rank(a) - rank(b) || a.line - b.line);
}

// ---------------------------------------------------------------------------
// What the import sends

/** One person as the server takes them again, already as the screen read them. */
export const peopleImportRow = z.strictObject({
  name: z
    .string()
    .max(400)
    .refine((name) => {
      const kept = parseTeamName(name);
      return kept.ok && kept.name === name;
    }),
  phone: z
    .string()
    .refine(
      (phone) =>
        /^\+9725\d{8}$/.test(phone) && normalizeIsraeliMobile(phone) === phone,
    ),
  role: z.enum(["manager", "worker"]),
  namedRole: z.uuid().nullable(),
  roleFromLine: z.boolean(),
});

/** A whole import: 1 to `PEOPLE_IMPORT_MAX` people, each number once. */
export const peopleImportRows = z
  .array(peopleImportRow)
  .min(1)
  .max(PEOPLE_IMPORT_MAX)
  .refine(
    (rows) => new Set(rows.map((row) => row.phone)).size === rows.length,
    "Each number once",
  );
