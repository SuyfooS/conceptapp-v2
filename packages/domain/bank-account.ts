import { BANKS_SOURCES, bankOf, isClosedOn, parseBankCode } from "./banks";
import { cleanTyped } from "./typed-text";

/*
 * A bank account for wages: bank, branch and account number, checked against
 * Masav's rules for each participant. The rules change often and Masav's own
 * document says each participant approved its part, so a failed check only
 * warns: the person may save past it, and the account is then flagged for a
 * holder (bank_review = 'warned', H4). Only what the database cannot store is
 * refused.
 *
 * The rules are dated data, like the minimum wage: a new Masav document is a
 * new entry in MASAV_RULES, by PR, and the old one stays for older days.
 *
 * Notation, as in Masav's document: the branch is three digits S T U; the
 * account is up to nine, A B C D E F G H - X, check digit(s) last. "Pad n"
 * means zeros on the left to n digits, before the check and in the stored form.
 * Lengths count digits without leading zeros, so a "nine digits" rule reads as
 * "at most nine": a zero on the left never changes the account.
 */

export const MASAV_RULES_AS_OF = "2026-09-16";

export type BankAccount = { bank: number; branch: number; account: string };

export type BankWarning =
  | "checkDigit"
  | "length"
  | "branch"
  | "unknownBank"
  | "closedBank";

/**
 * What the check says, never a refusal (Masav's rules change often):
 * valid; a warning the person may save past, which flags the account for a
 * holder (bank_review = 'warned' in H4); unchecked for a bank with no rule.
 * Only what the database cannot store is unusable.
 */
export type BankAccountCheck =
  | { status: "valid"; account: BankAccount }
  | { status: "warning"; warning: BankWarning; account: BankAccount }
  | { status: "unchecked"; account: BankAccount }
  | { status: "unusable"; problem: "bank" | "branch" | "account" };

/** What one rule says about an account: it holds, its check fails, the bank has no such branch, or it has no rule here. */
export type RuleOutcome = "valid" | "checkDigit" | "branch" | "unchecked";

export type AccountRule = {
  /** How many digits the account has, check digits included, leading zeros not counted. */
  length: { min: number; max: number };
  /** Zeros on the left to this many digits, before the check and in the stored form. */
  pad?: number;
  /** `digits` is the account padded to `pad` (or without leading zeros when there is none). */
  check: (account: {
    bank: number;
    branch: number;
    digits: string;
  }) => RuleOutcome;
};

export type RuleSet = {
  /** The first day these rules apply, YYYY-MM-DD. */
  from: string;
  source: string;
  /** By the code of the bank, or of the Masav group it belongs to (`Bank.group`). */
  rules: Readonly<Record<number, AccountRule>>;
};

// ---------------------------------------------------------------------------
// The arithmetic the rules share.

/** The sum of each digit times the weight under it, both read from the left. */
function weighted(digits: string, weights: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < weights.length; i++) {
    sum += Number(digits[i] ?? 0) * (weights[i] ?? 0);
  }
  return sum;
}

/** A number of digits mod 97, a digit at a time (no BigInt needed). */
function mod97(digits: string): number {
  let rest = 0;
  for (const digit of digits) rest = (rest * 10 + Number(digit)) % 97;
  return rest;
}

const branch3 = (branch: number) => String(branch).padStart(3, "0");
const holds = (ok: boolean): RuleOutcome => (ok ? "valid" : "checkDigit");

const BRANCH_WEIGHTS = [9, 8, 7] as const;
const SIX_WEIGHTS = [6, 5, 4, 3, 2, 1] as const;
const NINE_WEIGHTS = [9, 8, 7, 6, 5, 4, 3, 2, 1] as const;
const LEUMI_BRANCH_WEIGHTS = [10, 9, 8] as const;
const LEUMI_WEIGHTS = [7, 6, 5, 4, 3, 2] as const;

/** Branch × 9,8,7 plus the six rightmost account digits × 6..1, mod 11. */
function branchAndSix(branch: number, digits: string): number {
  return (
    (weighted(branch3(branch), BRANCH_WEIGHTS) +
      weighted(digits.slice(-6).padStart(6, "0"), SIX_WEIGHTS)) %
    11
  );
}

/** Nine digits × 9..1, mod `m`. */
const nine = (digits: string, m: number) => weighted(digits, NINE_WEIGHTS) % m;

/** Otsar Ha-Hayal's remainders, which the Beinleumi group also tries for bank 31. */
function otsarHolds(branch: number, digits: string): boolean {
  const remainder = branchAndSix(branch, digits);
  if ([385, 384, 365, 347].includes(branch)) return [0, 2].includes(remainder);
  if ([363, 362, 361].includes(branch)) return [0, 2, 4].includes(remainder);
  return remainder === 0;
}

const MASSAD_TWO_BRANCHES = [
  154, 166, 178, 181, 183, 191, 192, 503, 505, 507, 515, 516, 527, 539,
];

/**
 * ISO 7064 98 - mod 97, the mod 97 participants' rule: the two check digits
 * are 98 minus the rest of the number (branch and account body) mod 97.
 */
function mod97Holds(body: string, last2: string): boolean {
  return 98 - mod97(body) === Number(last2);
}

const NO_RULE: AccountRule = {
  length: { min: 1, max: 9 },
  check: () => "unchecked",
};

// ---------------------------------------------------------------------------
// Masav, "בדיקות חוקיות מספרי חשבון", as of 16.09.2026.

const RULES_2026_09_16: Readonly<Record<number, AccountRule>> = {
  // 1. Leumi group (10, with 34). B C D E F G - H X: branch × 10,9,8 and the
  // first six × 7..2, plus each account type; for each sum, its last two
  // digits are 0 → check 00, else 100 minus them. Type 110 only when digits
  // 5–6 are 00, 20 or 23. Valid if any type gives H X. (Leumi's 2024 change
  // log mentions branch 864; the rule itself has no exception for it.)
  10: {
    length: { min: 1, max: 8 },
    pad: 8,
    check: ({ branch, digits }) => {
      const sum =
        weighted(branch3(branch), LEUMI_BRANCH_WEIGHTS) +
        weighted(digits.slice(0, 6), LEUMI_WEIGHTS);
      const hx = Number(digits.slice(6));
      const types = [330, 340, 180, 128];
      if (["00", "20", "23"].includes(digits.slice(4, 6))) types.push(110);
      return holds(
        types.some((type) => {
          const last = (sum + type) % 100;
          return (last === 0 ? 0 : 100 - last) === hx;
        }),
      );
    },
  },
  // 2. Hapoalim: 4–6 digits; remainders 0, 2, 4, 6.
  12: {
    length: { min: 4, max: 6 },
    pad: 6,
    check: ({ branch, digits }) =>
      holds([0, 2, 4, 6].includes(branchAndSix(branch, digits))),
  },
  // 3. Yahav: five digits and a check; remainders 0, 2.
  4: {
    length: { min: 1, max: 6 },
    pad: 6,
    check: ({ branch, digits }) =>
      holds([0, 2].includes(branchAndSix(branch, digits))),
  },
  // 4. Discount group (11, with 17): nine digits × 9..1; remainders 0, 2, 4; no branch.
  11: {
    length: { min: 1, max: 9 },
    pad: 9,
    check: ({ digits }) => holds([0, 2, 4].includes(nine(digits, 11))),
  },
  // 5. Mizrahi Tefahot: as Hapoalim, branches 401–799 less 400 first; remainders 0, 2, 4.
  20: {
    length: { min: 1, max: 6 },
    pad: 6,
    check: ({ branch, digits }) => {
      const counted = branch >= 401 && branch <= 799 ? branch - 400 : branch;
      return holds([0, 2, 4].includes(branchAndSix(counted, digits)));
    },
  },
  // 6. Union Bank (closed, merged into Mizrahi in December 2022): branch ×
  // 10,9,8 and the first six × 7..2, plus H X as a two-digit number; the last
  // two digits are 90, 72, 70, 60 or 20. A valid one still warns closedBank.
  13: {
    length: { min: 1, max: 8 },
    pad: 8,
    check: ({ branch, digits }) => {
      const sum =
        weighted(branch3(branch), LEUMI_BRANCH_WEIGHTS) +
        weighted(digits.slice(0, 6), LEUMI_WEIGHTS) +
        Number(digits.slice(6));
      return holds([90, 72, 70, 60, 20].includes(sum % 100));
    },
  },
  // 7. Beinleumi group (31, with 26 and 52): (a) nine digits × 9..1,
  // remainders 0, 6; else (b) the six rightmost × 6..1, remainders 0, 6; else,
  // for bank 31 only, (c) Otsar Ha-Hayal's rule. Masav writes 2-6 characters
  // for this group, but steps (a) and (b) only differ when the account has
  // more than six digits, so a longer account passes here without a length
  // warning.
  31: {
    length: { min: 1, max: 9 },
    pad: 9,
    check: ({ bank, branch, digits }) =>
      holds(
        [0, 6].includes(nine(digits, 11)) ||
          [0, 6].includes(weighted(digits.slice(-6), SIX_WEIGHTS) % 11) ||
          (bank === 31 && otsarHolds(branch, digits)),
      ),
  },
  // 8. Otsar Ha-Hayal: branch and the six rightmost; remainder 0, with the
  // branches Masav lists for 0, 2 and for 0, 2, 4.
  14: {
    length: { min: 1, max: 6 },
    pad: 6,
    check: ({ branch, digits }) => holds(otsarHolds(branch, digits)),
  },
  // 9. Massad: branch and the six rightmost; remainder 0, or 0, 2 in the listed branches.
  46: {
    length: { min: 1, max: 6 },
    pad: 6,
    check: ({ branch, digits }) => {
      const remainder = branchAndSix(branch, digits);
      return holds(
        MASSAD_TWO_BRANCHES.includes(branch)
          ? [0, 2].includes(remainder)
          : remainder === 0,
      );
    },
  },
  // 10. Israel Post Finance (the Postal Bank): nine digits × 9..1 (the rightmost × 1), mod 10 is 0.
  9: {
    length: { min: 1, max: 9 },
    pad: 9,
    check: ({ digits }) => holds(nine(digits, 10) === 0),
  },
  // 11. Citibank: the first eight × 3,2,7,6,5,4,3,2; 11 minus the sum mod 11 is the ninth.
  22: {
    length: { min: 1, max: 9 },
    pad: 9,
    check: ({ digits }) =>
      holds(
        11 - (weighted(digits, [3, 2, 7, 6, 5, 4, 3, 2]) % 11) ===
          Number(digits[8]),
      ),
  },
  // 12. Bank of Jerusalem: no rule.
  54: NO_RULE,
  // 13. HSBC: nine digits; in branch 101 the seventh from the left is 4 or 9;
  // branch 102 has one account, ending in 001; no rule for other branches.
  23: {
    length: { min: 1, max: 9 },
    pad: 9,
    check: ({ branch, digits }) => {
      if (branch === 101) return holds(["4", "9"].includes(digits[6] ?? ""));
      if (branch === 102) return holds(digits.endsWith("001"));
      return "unchecked";
    },
  },
  // 14. One Zero: seven digits and two check digits, mod 97 after the branch's three.
  18: {
    length: { min: 1, max: 9 },
    pad: 9,
    check: ({ branch, digits }) =>
      holds(mod97Holds(branch3(branch) + digits.slice(0, 7), digits.slice(7))),
  },
  // 15. SBI (State Bank of India): no rule.
  39: NO_RULE,
  // 16. Esh Bank: nine digits × 9..1, mod 11 is 0; no branch.
  3: {
    length: { min: 1, max: 9 },
    pad: 9,
    check: ({ digits }) => holds(nine(digits, 11) === 0),
  },
  // 17. GROW: 4–6 digits and two check digits, mod 97 after the branch, the
  // account without zeros added; branches 900 and up are not checked.
  35: {
    length: { min: 6, max: 8 },
    check: ({ branch, digits }) => {
      if (branch >= 900) return "unchecked";
      return holds(
        mod97Holds(String(branch) + digits.slice(0, -2), digits.slice(-2)),
      );
    },
  },
  // 18. Ofek Credit Union: as One Zero.
  15: {
    length: { min: 1, max: 9 },
    pad: 9,
    check: ({ branch, digits }) =>
      holds(mod97Holds(branch3(branch) + digits.slice(0, 7), digits.slice(7))),
  },
  // 19. Nima Shefa Israel: eight digits × 8..1, remainders 0, 2.
  21: {
    length: { min: 1, max: 8 },
    pad: 8,
    check: ({ digits }) =>
      holds([0, 2].includes(weighted(digits, [8, 7, 6, 5, 4, 3, 2, 1]) % 11)),
  },
  // 20. Re-Weave: nine digits × 9,2,3,4,5,6,7,8,1, mod 11 is 0; no branch.
  58: {
    length: { min: 1, max: 9 },
    pad: 9,
    check: ({ digits }) =>
      holds(weighted(digits, [9, 2, 3, 4, 5, 6, 7, 8, 1]) % 11 === 0),
  },
  // 21. Isracard: branch × 10,9,8 and seven digits × 7..1, mod 11 is 0; 4–7 digits.
  1: {
    length: { min: 4, max: 7 },
    pad: 7,
    check: ({ branch, digits }) =>
      holds(
        (weighted(branch3(branch), LEUMI_BRANCH_WEIGHTS) +
          weighted(digits, [7, 6, 5, 4, 3, 2, 1])) %
          11 ===
          0,
      ),
  },
  // 22. GMT: ISO 7064 98 - mod 97 over the branch's three digits and the
  // account, not padded; 5–9 digits. Masav: branches 900 and up are valid.
  69: {
    length: { min: 5, max: 9 },
    check: ({ branch, digits }) => {
      if (branch >= 900) return "valid";
      return holds(
        mod97Holds(branch3(branch) + digits.slice(0, -2), digits.slice(-2)),
      );
    },
  },
  // 23. Monox: as One Zero, the account padded with zeros.
  79: {
    length: { min: 1, max: 9 },
    pad: 9,
    check: ({ branch, digits }) =>
      holds(mod97Holds(branch3(branch) + digits.slice(0, 7), digits.slice(7))),
  },
  // 24. Phoenix Gamma: branch, account and check digits divide by 97; branches 501 and 502.
  94: {
    length: { min: 1, max: 9 },
    pad: 9,
    check: ({ branch, digits }) => {
      if (branch !== 501 && branch !== 502) return "branch";
      return holds(mod97(branch3(branch) + digits) === 0);
    },
  },
  // 25. Max It Finance: the digits before the check × 9, 8, 7… from the
  // right; the sum mod 10 is the check digit. No branch.
  6: {
    length: { min: 1, max: 9 },
    check: ({ digits }) => {
      const body = digits.slice(0, -1);
      let sum = 0;
      for (let i = 0; i < body.length; i++) {
        sum += Number(body[body.length - 1 - i]) * (9 - i);
      }
      return holds(sum % 10 === Number(digits.slice(-1)));
    },
  },
};

const FIRST_RULES: RuleSet = {
  from: "2026-09-16",
  source: BANKS_SOURCES.masav,
  rules: RULES_2026_09_16,
};

/** Masav's rule sets, newest last; a new document is a new entry, by PR. */
export const MASAV_RULES: readonly RuleSet[] = [FIRST_RULES];

/**
 * The rules in force on `day` (YYYY-MM-DD): the newest set that starts on or
 * before it. A day before the first set gets the first set: nothing older is
 * kept, and an account from then is checked by today's first rules.
 */
export function rulesOn(day: string): RuleSet {
  let found = FIRST_RULES;
  for (const set of MASAV_RULES) if (set.from <= day) found = set;
  return found;
}

// ---------------------------------------------------------------------------
// The check.

/**
 * The account's digits without leading zeros, or null when the database could
 * not store it: empty, all zeros, more than nine digits, or anything but digits
 * once cleaned and with spaces, dashes, dots and slashes dropped.
 */
function significantDigits(account: string): string | null {
  const typed = cleanTyped(account).replace(/[\s./-]/g, "");
  if (!/^\d+$/.test(typed)) return null;
  const digits = typed.replace(/^0+/, "");
  return digits.length >= 1 && digits.length <= 9 ? digits : null;
}

/**
 * Checks an account against the rules in force on `day` (YYYY-MM-DD, the
 * business's today, passed in by the caller: the domain reads no clock).
 * `account` is digits as typed; the result carries its stored form.
 */
export function checkBankAccount(
  input: { bank: number; branch: number; account: string },
  day: string,
): BankAccountCheck {
  const { bank, branch } = input;
  if (!Number.isInteger(bank) || bank < 1 || bank > 999) {
    return { status: "unusable", problem: "bank" };
  }
  if (!Number.isInteger(branch) || branch < 0 || branch > 999) {
    return { status: "unusable", problem: "branch" };
  }
  const digits = significantDigits(input.account);
  if (digits === null) return { status: "unusable", problem: "account" };

  const known = bankOf(bank);
  if (!known) {
    return {
      status: "warning",
      warning: "unknownBank",
      account: { bank, branch, account: digits },
    };
  }
  const rule = rulesOn(day).rules[known.group ?? known.code];
  if (!rule) {
    return { status: "unchecked", account: { bank, branch, account: digits } };
  }
  const account: BankAccount = {
    bank,
    branch,
    account: rule.pad ? digits.padStart(rule.pad, "0") : digits,
  };
  if (digits.length < rule.length.min || digits.length > rule.length.max) {
    return { status: "warning", warning: "length", account };
  }
  const outcome = rule.check({ bank, branch, digits: account.account });
  if (outcome === "checkDigit" || outcome === "branch") {
    return { status: "warning", warning: outcome, account };
  }
  if (isClosedOn(known, day)) {
    return { status: "warning", warning: "closedBank", account };
  }
  return outcome === "valid"
    ? { status: "valid", account }
    : { status: "unchecked", account };
}

/** The last four digits, or three for a shorter account, for `bank_account_hint`. */
export function accountHint(account: string): string {
  const digits = account.padStart(3, "0");
  return digits.length > 4 ? digits.slice(-4) : digits.slice(-3);
}

// ---------------------------------------------------------------------------
// Pasted numbers.

export type PastedAccount =
  | {
      kind: "full";
      bank: number;
      branch: number;
      account: string;
      from: "groups" | "iban";
    }
  | { kind: "branchAndAccount"; branch: number; account: string }
  | { kind: "none" };

/**
 * An Israeli IBAN, found in `text`: IL, two check digits, then the bank (3),
 * branch (3) and account (13), with or without spaces or dashes.
 */
const ISRAELI_IBAN = /(?<![A-Z])IL ?(\d{2})((?:[ -]?\d){19})(?![ -]?\d)/;

/**
 * An Israeli IBAN (IL, 2 check digits, bank 3, branch 3, account 13) as bank,
 * branch and account; null unless its mod-97 holds (ISO 13616) and the account
 * fits in nine digits. Never stored: it can be computed again when asked for.
 */
export function parseIsraeliIban(text: string): BankAccount | null {
  const match = ISRAELI_IBAN.exec(cleanTyped(text).toUpperCase());
  if (!match?.[1] || !match[2]) return null;
  const check = match[1];
  const bban = match[2].replace(/[ -]/g, "");
  // The BBAN, then "IL" as 18 21, then the check digits: mod 97 is 1.
  if (mod97(`${bban}1821${check}`) !== 1) return null;
  const bank = Number(bban.slice(0, 3));
  const branch = Number(bban.slice(3, 6));
  const account = bban.slice(6).replace(/^0+/, "");
  if (bank < 1 || account.length < 1 || account.length > 9) return null;
  return { bank, branch, account };
}

/** A branch as pasted: one to three digits. */
function pastedBranch(group: string | undefined): number | null {
  return group !== undefined && /^\d{1,3}$/.test(group) ? Number(group) : null;
}

/**
 * The account in the groups after the branch: one group, or one and a check
 * digit or two after a dash ("04111-6"). After a label, groups after those
 * are ignored (other details may follow); by position, they make it no
 * account. Null unless it could be stored.
 */
function pastedAccount(
  groups: readonly string[],
  afterLabel: boolean,
): string | null {
  const [first, second] = groups;
  if (first === undefined) return null;
  const withCheck = second !== undefined && second.length <= 2;
  if (!afterLabel && groups.length > (withCheck ? 2 : 1)) return null;
  const joined = withCheck ? first + second : first;
  const account = joined.length > 9 ? joined.replace(/^0+/, "") : joined;
  return /^\d{1,9}$/.test(account) && /[1-9]/.test(account) ? account : null;
}

/** By position: bank, branch, account; or branch, account. */
function fromGroups(groups: readonly string[]): PastedAccount {
  if (groups.length >= 3) {
    const bank = parseBankCode(groups[0] ?? "");
    const branch = pastedBranch(groups[1]);
    const account = pastedAccount(groups.slice(2), false);
    if (bank !== null && branch !== null && account !== null) {
      return { kind: "full", bank, branch, account, from: "groups" };
    }
  }
  if (groups.length >= 2) {
    const branch = pastedBranch(groups[0]);
    const account = pastedAccount(groups.slice(1), false);
    if (branch !== null && account !== null) {
      return { kind: "branchAndAccount", branch, account };
    }
  }
  return { kind: "none" };
}

const LABELLED =
  /(?<bank>בנק|\bbank\b)|(?<branch>סניף|\bbranch\b)|(?<account>חשבון|\baccount\b|\bacct\b)|(?<digits>\d+)/giu;

/** The groups of digits after each label, until the next label. */
type Labelled = Record<"bank" | "branch" | "account", string[]>;

/** The labels in `text`, in any order ("סניף 571 חשבון 041116 בנק 12"). */
function readLabels(text: string): Labelled {
  const found: Labelled = { bank: [], branch: [], account: [] };
  let label: keyof Labelled | null = null;
  for (const match of text.matchAll(LABELLED)) {
    const groups = match.groups ?? {};
    if (groups.digits !== undefined) {
      if (label) found[label].push(groups.digits);
      continue;
    }
    label = groups.bank ? "bank" : groups.branch ? "branch" : "account";
  }
  return found;
}

/** By label; null without a branch and an account label. */
function fromLabels(found: Labelled): PastedAccount | null {
  const branch = pastedBranch(found.branch[0]);
  const account = pastedAccount(found.account, true);
  if (branch === null || account === null) return null;
  const bank =
    found.bank[0] === undefined ? null : parseBankCode(found.bank[0]);
  return bank === null
    ? { kind: "branchAndAccount", branch, account }
    : { kind: "full", bank, branch, account, from: "groups" };
}

/**
 * Whether a split by position agrees with the labels it did not read: the
 * first digits after a bank label must be its bank, after a branch label its
 * branch. Account labels are not compared: "Account: 12-571-041116" is meant
 * to be split by position.
 */
function agreesWithLabels(split: PastedAccount, found: Labelled): boolean {
  const [bankDigits] = found.bank;
  // A bank named in words ("בנק הפועלים 571-041116") has no digits of its
  // own after the label: the branch and the account follow it, unlabelled.
  const namedBank =
    split.kind === "branchAndAccount" &&
    found.bank.length === 2 &&
    found.branch.length === 0 &&
    found.account.length === 0 &&
    pastedBranch(found.bank[0]) === split.branch;
  if (
    bankDigits !== undefined &&
    !namedBank &&
    (split.kind !== "full" || split.bank !== parseBankCode(bankDigits))
  ) {
    return false;
  }
  const [branchDigits] = found.branch;
  if (
    branchDigits !== undefined &&
    (split.kind === "none" || split.branch !== pastedBranch(branchDigits))
  ) {
    return false;
  }
  return true;
}

/**
 * Reads what a bank app copies: "12-571-041116", with dashes, spaces,
 * slashes, labels or an IBAN. A check digit after a dash joins the account
 * ("12-571-04111-6"). Labels without both a branch and an account fall back
 * to position, kept only when it agrees with them. Wherever the text could be
 * read two ways it gives nothing rather than a wrong split: a mistyped IBAN,
 * or "Bank 12, account 041116", which by position would make 12 the branch.
 */
export function splitPastedAccount(text: string): PastedAccount {
  const clean = cleanTyped(text);
  if (/(?<![a-z])il ?\d/i.test(clean)) {
    const iban = parseIsraeliIban(clean);
    return iban ? { kind: "full", ...iban, from: "iban" } : { kind: "none" };
  }
  const found = readLabels(clean);
  const byLabel = fromLabels(found);
  if (byLabel) return byLabel;
  const byPosition = fromGroups(clean.match(/\d+/g) ?? []);
  return agreesWithLabels(byPosition, found) ? byPosition : { kind: "none" };
}
