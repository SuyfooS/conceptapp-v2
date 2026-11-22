import { describe, expect, it } from "vitest";
import {
  type BankFieldValue,
  bankFieldFromPaste,
  EMPTY_BANK,
} from "./bank-field";

/*
 * The hiring file's account (profile H5a, plan §8.1): what the paste box
 * does with what the bank's app copies. A whole account fills all three
 * parts, a branch and an account keep the bank chosen, and a number read in
 * is a new one to check, so "המספר נכון, לשמור" is taken back: a doubted
 * account never reaches the code step unconfirmed.
 */

const KEPT: BankFieldValue = {
  bank: 12,
  branch: "600",
  account: "100002",
  kept: true,
};

describe("bankFieldFromPaste", () => {
  it("fills the bank, the branch and the account from a whole account", () => {
    expect(bankFieldFromPaste("12-571-041116", EMPTY_BANK)).toEqual({
      value: { bank: 12, branch: "571", account: "041116", kept: false },
      pasted: "",
      unread: false,
    });
  });

  it("replaces a bank already chosen with the one pasted", () => {
    const read = bankFieldFromPaste("10-936-07869660", KEPT);
    expect(read.value.bank).toBe(10);
    expect(read.value.branch).toBe("936");
    expect(read.value.account).toBe("07869660");
  });

  it("keeps the bank chosen for a branch and an account", () => {
    expect(
      bankFieldFromPaste("571-041116", { ...EMPTY_BANK, bank: 20 }),
    ).toEqual({
      value: { bank: 20, branch: "571", account: "041116", kept: false },
      pasted: "",
      unread: false,
    });
  });

  it("takes back a number kept past its warning, for any paste it reads", () => {
    expect(bankFieldFromPaste("12-600-100002", KEPT).value.kept).toBe(false);
    expect(bankFieldFromPaste("600-100002", KEPT).value.kept).toBe(false);
    expect(
      bankFieldFromPaste("IL84 0125 7100 0000 0041 116", KEPT).value.kept,
    ).toBe(false);
  });

  it("changes no part for text it can't read, and keeps it in the box", () => {
    const read = bankFieldFromPaste("hello", KEPT);
    expect(read.value).toBe(KEPT);
    expect(read.pasted).toBe("hello");
    expect(read.unread).toBe(false);
  });

  it("says it couldn't read only once there are six digits", () => {
    // Typed a digit at a time, it says nothing yet.
    for (const typed of ["1", "12", "12-5", "12-57", "1234"]) {
      expect(bankFieldFromPaste(typed, EMPTY_BANK).unread, typed).toBe(false);
    }
    // Six digits it can't read: said.
    expect(bankFieldFromPaste("1234-5678-041116", EMPTY_BANK)).toEqual({
      value: EMPTY_BANK,
      pasted: "1234-5678-041116",
      unread: true,
    });
    expect(bankFieldFromPaste("123456", EMPTY_BANK).unread).toBe(true);
  });
});
