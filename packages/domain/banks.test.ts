import { describe, expect, it } from "vitest";
import {
  BANKS,
  bankOf,
  banksOn,
  formatBankCode,
  isClosedOn,
  parseBankCode,
} from "./banks";

describe("the bank list", () => {
  it("has each code once, in order", () => {
    const codes = BANKS.map((bank) => bank.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toEqual([...codes].sort((a, b) => a - b));
    for (const code of codes) {
      expect(Number.isInteger(code) && code >= 1 && code <= 999).toBe(true);
    }
  });

  it("points every group and merger at a bank in the list that has none of its own", () => {
    for (const bank of BANKS) {
      if (bank.group !== null) {
        expect(bankOf(bank.group)?.group, String(bank.code)).toBeNull();
      }
      if (bank.mergedInto !== undefined) {
        expect(bankOf(bank.mergedInto), String(bank.code)).toBeDefined();
        expect(bank.until, String(bank.code)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it("puts the Masav groups where Masav does", () => {
    expect(bankOf(34)?.group).toBe(10);
    expect(bankOf(17)?.group).toBe(11);
    expect(bankOf(26)?.group).toBe(31);
    expect(bankOf(52)?.group).toBe(31);
  });

  it("knows no bank outside the list", () => {
    expect(bankOf(99)).toBeUndefined();
    expect(bankOf(37)).toBeUndefined(); // a Palestinian Authority bank, not in Masav
  });
});

describe("banksOn", () => {
  it("leaves out a bank closed by then", () => {
    const codes = banksOn("2026-11-09").map((bank) => bank.code);
    expect(codes).not.toContain(13);
    expect(codes).toContain(12);
    expect(codes).toContain(20);
    expect(codes).toHaveLength(BANKS.length - 1);
  });

  it("still offers it up to its last day", () => {
    expect(banksOn("2022-12-31").map((bank) => bank.code)).toContain(13);
  });

  it("agrees with isClosedOn", () => {
    const igud = bankOf(13);
    expect(igud && isClosedOn(igud, "2023-01-01")).toBe(true);
    expect(igud && isClosedOn(igud, "2022-12-31")).toBe(false);
  });
});

describe("parseBankCode", () => {
  it.each([
    ["09", 9],
    ["9", 9],
    [" 9 ", 9],
    ["009", 9],
    ["12", 12],
    ["120", 120],
    ["999", 999],
    ["\u0661\u0662", 12],
  ])("reads %s as %s", (input, expected) => {
    expect(parseBankCode(input)).toBe(expected);
  });

  it.each(["0", "00", "1000", "12a", "", "-12", "1 2"])(
    "refuses %s",
    (input) => {
      expect(parseBankCode(input)).toBeNull();
    },
  );
});

describe("formatBankCode", () => {
  it.each([
    [9, "09"],
    [12, "12"],
    [120, "120"],
  ])("writes %s as %s", (code, expected) => {
    expect(formatBankCode(code)).toBe(expected);
  });
});
