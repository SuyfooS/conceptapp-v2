import { describe, expect, it } from "vitest";
import {
  accountHint,
  checkBankAccount,
  MASAV_RULES,
  parseIsraeliIban,
  rulesOn,
  splitPastedAccount,
} from "./bank-account";
import { BANKS } from "./banks";

const DAY = "2026-11-09";
const check = (bank: number, branch: number, account: string) =>
  checkBankAccount({ bank, branch, account }, DAY);

// Valid vectors are Masav's own examples (16.09.2026) where it gives one; the
// rest (HSBC, Leumi's other types, the branch exceptions, Beinleumi's step (b))
// are built by its rule.
describe("checkBankAccount: valid", () => {
  it.each([
    ["Leumi, type 330", 10, 936, "07869660"],
    ["Leumi, only through type 110", 10, 800, "12340060"],
    // Built from Masav's Leumi example by the rule: the same body, each type's H X.
    ["Leumi, type 340", 10, 936, "07869650"],
    ["Leumi, type 180", 10, 936, "07869610"],
    ["Leumi, type 128", 10, 936, "07869662"],
    ["Leumi, last two digits 0, so the check is 00", 10, 936, "07803700"],
    ["Arab Israel Bank, by Leumi's rule", 34, 936, "07869660"],
    ["Hapoalim", 12, 571, "041116"],
    ["Yahav", 4, 284, "050067"],
    ["Discount", 11, 1, "000032018"],
    ["Mercantile, by Discount's rule", 17, 999, "000032018"],
    ["Mizrahi, branch 406 counted as 6", 20, 406, "160778"],
    // Counted as 406 it would fail (remainder 8): 800 and up keep their number.
    ["Mizrahi, branch 806 counted as itself", 20, 806, "160772"],
    ["Beinleumi", 31, 1, "000032018"],
    ["U-Bank, by Beinleumi's rule", 26, 1, "000032018"],
    ["PAGI, by Beinleumi's rule", 52, 1, "000032018"],
    // Step (a) fails (remainder 9); the six rightmost hold.
    ["Beinleumi, only through step (b)", 31, 1, "100032018"],
    ["U-Bank, only through step (b)", 26, 1, "100032018"],
    // Longer than Masav's 2-6 characters for the group, by step (a).
    ["Beinleumi, nine digits", 31, 1, "123456789"],
    ["Beinleumi, by Otsar's rule (bank 31 only)", 31, 571, "000041116"],
    ["Otsar Ha-Hayal", 14, 571, "041116"],
    ["Otsar Ha-Hayal, remainder 2 in branch 385", 14, 385, "041111"],
    ["Otsar Ha-Hayal, remainder 4 in branch 363", 14, 363, "041110"],
    ["Massad", 46, 571, "041116"],
    ["Massad, remainder 2 in branch 154", 46, 154, "041116"],
    ["Israel Post Finance", 9, 1, "059121900"],
    ["Citibank", 22, 1, "700241017"],
    ["One Zero", 18, 1, "123456771"],
    ["Ofek", 15, 1, "123456771"],
    ["GROW", 35, 100, "1234593"],
    ["GMT", 69, 1, "123456771"],
    ["GMT, branch 900 and up", 69, 900, "12345"],
    ["Monox", 79, 19, "012345637"],
    ["Phoenix Gamma", 94, 501, "999950049"],
    ["Esh Bank", 3, 1, "247652342"],
    ["Nima", 21, 1, "16632427"],
    ["Re-Weave", 58, 1, "162144279"],
    ["Isracard", 1, 1, "1234563"],
    ["Max", 6, 1, "223456782"],
    ["HSBC branch 101, seventh digit 4", 23, 101, "123456400"],
    ["HSBC branch 102, ending in 001", 23, 102, "123456001"],
  ])("%s: %s / %s / %s", (_name, bank, branch, account) => {
    expect(check(bank, branch, account)).toEqual({
      status: "valid",
      account: { bank, branch, account },
    });
  });

  it("pads to the stored form", () => {
    expect(check(12, 571, "41116")).toEqual({
      status: "valid",
      account: { bank: 12, branch: 571, account: "041116" },
    });
    expect(check(11, 1, "32018")).toEqual({
      status: "valid",
      account: { bank: 11, branch: 1, account: "000032018" },
    });
  });

  it("reads an account as typed or pasted", () => {
    for (const typed of [
      "04111-6",
      "04111־6",
      "041 116",
      "\u200F041116",
      "\u0660\u0664\u0661\u0661\u0661\u0666",
      "000041116",
    ]) {
      expect(check(12, 571, typed), typed).toEqual({
        status: "valid",
        account: { bank: 12, branch: 571, account: "041116" },
      });
    }
  });
});

describe("checkBankAccount: warnings", () => {
  it.each([
    ["Hapoalim", 12, 571, "041117"],
    ["Leumi", 10, 936, "07869661"],
    [
      "Leumi, no type 110 when digits 5-6 are not 00, 20 or 23",
      10,
      800,
      "12341057",
    ],
    ["Yahav", 4, 284, "050068"],
    ["Discount", 11, 1, "000032019"],
    ["Mizrahi", 20, 406, "160779"],
    ["Beinleumi", 31, 1, "000032019"],
    ["U-Bank, which has no Otsar step", 26, 571, "041116"],
    ["Otsar Ha-Hayal", 14, 571, "041117"],
    // The digits valid in 385 and 363 above, in a branch without their remainders.
    ["Otsar Ha-Hayal, remainder 6 outside branch 385", 14, 571, "041111"],
    ["Otsar Ha-Hayal, remainder 5 outside branch 363", 14, 571, "041110"],
    ["Leumi, one off a check of 00", 10, 936, "07803701"],
    ["Massad", 46, 571, "041117"],
    // The digits valid in 154 above, in a branch that allows only 0 (at 571
    // they give 0, so 155 shows it).
    ["Massad, remainder 9 outside the listed branches", 46, 155, "041116"],
    ["Israel Post Finance", 9, 1, "059121901"],
    ["Citibank", 22, 1, "700241018"],
    ["One Zero", 18, 1, "123456772"],
    ["GROW", 35, 100, "1234594"],
    ["GMT", 69, 1, "123456772"],
    ["Monox", 79, 19, "012345638"],
    ["Phoenix Gamma", 94, 501, "999950055"],
    ["Esh Bank", 3, 1, "247652341"],
    ["Nima", 21, 1, "16632428"],
    ["Re-Weave", 58, 1, "162144278"],
    ["Isracard", 1, 1, "1234564"],
    ["Max", 6, 1, "223456783"],
    ["HSBC branch 101", 23, 101, "123456500"],
    ["HSBC branch 102", 23, 102, "123456002"],
  ])("checkDigit, %s: %s / %s / %s", (_name, bank, branch, account) => {
    const result = check(bank, branch, account);
    expect(result.status).toBe("warning");
    expect(result.status === "warning" && result.warning).toBe("checkDigit");
  });

  it("keeps the account as typed when it warns, so the person may save past it", () => {
    expect(check(12, 571, "041117")).toEqual({
      status: "warning",
      warning: "checkDigit",
      account: { bank: 12, branch: 571, account: "041117" },
    });
  });

  it.each([
    ["Hapoalim, seven digits", 12, 571, "1234567"],
    ["Hapoalim, three digits", 12, 571, "116"],
    ["Isracard, eight digits", 1, 1, "12345678"],
    ["GROW, five digits", 35, 100, "12345"],
    ["Leumi, nine digits", 10, 936, "107869660"],
  ])("length, %s", (_name, bank, branch, account) => {
    const result = check(bank, branch, account);
    expect(result.status === "warning" && result.warning).toBe("length");
  });

  it("warns of a branch Phoenix Gamma doesn't have", () => {
    expect(check(94, 503, "999950049")).toEqual({
      status: "warning",
      warning: "branch",
      account: { bank: 94, branch: 503, account: "999950049" },
    });
  });

  it("warns of a closed bank, even when its old rule holds", () => {
    expect(check(13, 607, "11710022")).toEqual({
      status: "warning",
      warning: "closedBank",
      account: { bank: 13, branch: 607, account: "11710022" },
    });
    // Before it closed, the same account was valid.
    expect(
      checkBankAccount(
        { bank: 13, branch: 607, account: "11710022" },
        "2022-06-01",
      ).status,
    ).toBe("valid");
  });

  it("gives a wrong check digit at a closed bank as that", () => {
    const result = check(13, 607, "11710023");
    expect(result.status === "warning" && result.warning).toBe("checkDigit");
  });

  it("warns of a bank it doesn't know, keeping the digits", () => {
    expect(check(99, 1, "0123456")).toEqual({
      status: "warning",
      warning: "unknownBank",
      account: { bank: 99, branch: 1, account: "123456" },
    });
  });
});

describe("checkBankAccount: no rule", () => {
  it.each([
    ["Bank of Jerusalem", 54, 1, "123"],
    ["SBI", 39, 1, "123456789"],
    ["HSBC in another branch", 23, 103, "123456789"],
    ["GROW, branch 900 and up", 35, 900, "12345678"],
  ])("%s is unchecked", (_name, bank, branch, account) => {
    expect(check(bank, branch, account)).toEqual({
      status: "unchecked",
      account: { bank, branch, account },
    });
  });
});

describe("checkBankAccount: unusable", () => {
  it.each([
    ["bank", 0, 571, "041116"],
    ["bank", 1000, 571, "041116"],
    ["bank", 12.5, 571, "041116"],
    ["branch", 12, 1000, "1"],
    ["branch", 12, -1, "1"],
    ["branch", 12, Number.NaN, "1"],
    ["account", 12, 571, "04111a"],
    ["account", 12, 571, ""],
    ["account", 12, 571, "000000"],
    ["account", 12, 571, "1234567890"],
  ])("%s: %s / %s / %s", (problem, bank, branch, account) => {
    expect(check(bank, branch, account)).toEqual({
      status: "unusable",
      problem,
    });
  });
});

describe("the rules", () => {
  it("cover every bank in the list, by its own code or its group's", () => {
    const rules = rulesOn(DAY).rules;
    for (const bank of BANKS) {
      expect(rules[bank.group ?? bank.code], String(bank.code)).toBeDefined();
    }
  });

  it("are dated, newest last", () => {
    const days = MASAV_RULES.map((set) => set.from);
    expect(days).toEqual([...days].sort());
    expect(rulesOn("2026-09-16")).toBe(MASAV_RULES[0]);
    // Nothing older is kept: an earlier day gets the first set.
    expect(rulesOn("2026-01-01")).toBe(MASAV_RULES[0]);
    expect(rulesOn(DAY)).toBe(MASAV_RULES.at(-1));
  });
});

describe("accountHint", () => {
  it.each([
    ["041116", "1116"],
    ["000032018", "2018"],
    ["12345", "2345"],
    ["1234", "234"],
    ["123", "123"],
    ["12", "012"],
  ])("of %s is %s", (account, hint) => {
    expect(accountHint(account)).toBe(hint);
    expect(hint).toMatch(/^\d{3,4}$/);
  });
});

describe("parseIsraeliIban", () => {
  it("reads bank, branch and account", () => {
    expect(parseIsraeliIban("IL84 0125 7100 0000 0041 116")).toEqual({
      bank: 12,
      branch: 571,
      account: "41116",
    });
    expect(parseIsraeliIban("il840125710000000041116")).toEqual({
      bank: 12,
      branch: 571,
      account: "41116",
    });
    expect(parseIsraeliIban("IBAN: IL84-0125-7100-0000-0041-116")).toEqual({
      bank: 12,
      branch: 571,
      account: "41116",
    });
  });

  it.each([
    ["a wrong check", "IL84 0125 7100 0000 0041 117"],
    ["wrong check digits", "IL85 0125 7100 0000 0041 116"],
    ["a digit short", "IL84 0125 7100 0000 0041 11"],
    ["a digit over", "IL84 0125 7100 0000 0041 1160"],
    ["another country", "DE84 0125 7100 0000 0041 116"],
    ["nothing", ""],
  ])("refuses %s", (_name, text) => {
    expect(parseIsraeliIban(text)).toBeNull();
  });
});

describe("splitPastedAccount", () => {
  const full = {
    kind: "full",
    bank: 12,
    branch: 571,
    account: "041116",
    from: "groups",
  };

  it.each([
    "12-571-041116",
    "12 571 041116",
    "12/571/041116",
    "12\u2013571\u2013041116",
    "\u200F12\u200F-571-041116",
    "בנק 12, סניף 571, חשבון 041116",
    "סניף 571 חשבון 041116 בנק 12",
    "Bank 12 Branch 571 Account 041116",
    "\u0661\u0662-\u0665\u0667\u0661-\u0660\u0664\u0661\u0661\u0661\u0666",
    "12-571-04111-6",
    "012-571-041116",
    // Labels without a branch and an account, read by position, which agrees.
    "Account: 12-571-041116",
    "בנק 12, 571-041116",
  ])("reads %s", (text) => {
    expect(splitPastedAccount(text)).toEqual(full);
  });

  it("reads a branch and an account", () => {
    expect(splitPastedAccount("571-041116")).toEqual({
      kind: "branchAndAccount",
      branch: 571,
      account: "041116",
    });
    expect(splitPastedAccount("בנק הפועלים, סניף 571, חשבון 04111-6")).toEqual({
      kind: "branchAndAccount",
      branch: 571,
      account: "041116",
    });
    expect(
      splitPastedAccount("חשבון בבנק לאומי: סניף 936 חשבון 078696/60"),
    ).toEqual({ kind: "branchAndAccount", branch: 936, account: "07869660" });
    // A bank named in words: the digits after it are the branch.
    expect(splitPastedAccount("בנק הפועלים 571-041116")).toEqual({
      kind: "branchAndAccount",
      branch: 571,
      account: "041116",
    });
    // A branch label alone, by position, which agrees with it.
    expect(splitPastedAccount("סניף 571 041116")).toEqual({
      kind: "branchAndAccount",
      branch: 571,
      account: "041116",
    });
  });

  it("reads labels when other details follow", () => {
    expect(
      splitPastedAccount("בנק 12, סניף 571, חשבון 041116, ת.ז. 123456782"),
    ).toEqual(full);
  });

  it("reads an IBAN, which then checks and stores like a typed account", () => {
    const pasted = splitPastedAccount("IL84 0125 7100 0000 0041 116");
    expect(pasted).toEqual({
      kind: "full",
      bank: 12,
      branch: 571,
      account: "41116",
      from: "iban",
    });
    if (pasted.kind !== "full") return;
    expect(checkBankAccount(pasted, DAY)).toEqual({
      status: "valid",
      account: { bank: 12, branch: 571, account: "041116" },
    });
  });

  it.each([
    ["an IBAN whose mod 97 fails", "IL84 0125 7100 0000 0041 117"],
    ["words", "hello"],
    ["nothing", ""],
    ["one group", "1234"],
    ["a bank code of four digits", "1234-5678-041116"],
    ["an account of ten digits", "12-571-1234567890"],
    ["more groups than an account has", "12-571-041116-123"],
    // By position the bank would become the branch.
    ["a bank and an account, no branch", "Bank 12, account 041116"],
    ["a bank and an account, no branch, in Hebrew", "בנק 12 חשבון 041116"],
    ["a bank and a branch, no account", "בנק 12 סניף 571"],
  ])("finds nothing in %s", (_name, text) => {
    expect(splitPastedAccount(text)).toEqual({ kind: "none" });
  });
});
