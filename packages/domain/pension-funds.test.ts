import { describe, expect, it } from "vitest";
import {
  isPensionFund,
  PENSION_FUND_KEYS,
  PENSION_FUNDS,
  PENSION_FUNDS_AS_OF,
  UNKNOWN_FUND,
} from "./pension-funds";

describe("the pension funds", () => {
  it("are the nine comprehensive funds, each once", () => {
    expect(PENSION_FUNDS).toHaveLength(9);
    const ids = PENSION_FUNDS.map((fund) => fund.authorityId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(PENSION_FUND_KEYS).size).toBe(PENSION_FUND_KEYS.length);
  });

  it("have keys the database takes, with unknown last", () => {
    // employee_details' pension_fund: ^[a-z0-9_]{1,40}$
    for (const key of PENSION_FUND_KEYS) {
      expect(key).toMatch(/^[a-z0-9_]{1,40}$/);
    }
    expect(PENSION_FUND_KEYS.at(-1)).toBe(UNKNOWN_FUND);
    expect(PENSION_FUND_KEYS).toHaveLength(PENSION_FUNDS.length + 1);
  });

  it("know their own keys and nothing else", () => {
    expect(isPensionFund("harel")).toBe(true);
    expect(isPensionFund(UNKNOWN_FUND)).toBe(true);
    expect(isPensionFund("Harel")).toBe(false);
    expect(isPensionFund(null)).toBe(false);
  });

  it("are dated by the report they come from", () => {
    expect(PENSION_FUNDS_AS_OF).toMatch(/^\d{4}-\d{2}$/);
  });
});
