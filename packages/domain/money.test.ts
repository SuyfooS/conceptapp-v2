import { describe, expect, it } from "vitest";
import {
  formatShekels,
  MAX_HOURLY_AGOROT,
  moneyLocale,
  parseShekels,
} from "./money";

describe("parseShekels", () => {
  it("reads shekels as typed, in agorot", () => {
    expect(parseShekels("38")).toBe(3800);
    expect(parseShekels("38.5")).toBe(3850);
    expect(parseShekels("38.50")).toBe(3850);
    expect(parseShekels("38,5")).toBe(3850);
    expect(parseShekels("38,50")).toBe(3850);
    expect(parseShekels(" 38 ₪ ")).toBe(3800);
    expect(parseShekels("₪38.05")).toBe(3805);
    expect(parseShekels("0.01")).toBe(1);
    expect(parseShekels("0")).toBe(0);
  });

  it("lets through the marks pasted text carries", () => {
    expect(parseShekels("‏38.00 ₪")).toBe(3800);
    expect(parseShekels("⁦38.00 ₪⁩")).toBe(3800);
  });

  it("refuses more than two decimals, signs, separators and words", () => {
    expect(parseShekels("38.505")).toBeNull();
    expect(parseShekels("-38")).toBeNull();
    expect(parseShekels("+38")).toBeNull();
    expect(parseShekels("1,000")).toBeNull();
    expect(parseShekels("38.")).toBeNull();
    expect(parseShekels(".5")).toBeNull();
    expect(parseShekels("38 שקל")).toBeNull();
    expect(parseShekels("")).toBeNull();
    expect(parseShekels("   ")).toBeNull();
    expect(parseShekels("1e3")).toBeNull();
  });

  it("refuses more than an hourly wage may be, unless told otherwise", () => {
    expect(parseShekels("1000")).toBe(MAX_HOURLY_AGOROT);
    expect(parseShekels("1000.01")).toBeNull();
    expect(parseShekels("1000.01", 200_000)).toBe(100_001);
  });
});

describe("formatShekels", () => {
  it("writes agorot as shekels with two decimals", () => {
    expect(formatShekels(3540, "he")).toBe("35.40 ₪");
    expect(formatShekels(3800, "he")).toBe("38.00 ₪");
    expect(formatShekels(5, "he")).toBe("0.05 ₪");
    expect(formatShekels(3540, "en")).toBe("₪35.40");
  });

  it("groups thousands and keeps a sign", () => {
    expect(formatShekels(100_000, "he")).toBe("1,000.00 ₪");
    expect(formatShekels(123_456_789, "en")).toBe("₪1,234,567.89");
    expect(formatShekels(-1250, "he")).toBe("-12.50 ₪");
  });

  it("reads back what it writes, below a thousand", () => {
    for (const agorot of [1, 99, 3432, 3540, 99_999]) {
      expect(parseShekels(formatShekels(agorot, "he"))).toBe(agorot);
      expect(parseShekels(formatShekels(agorot, "en"))).toBe(agorot);
    }
  });
});

describe("moneyLocale", () => {
  it("is Hebrew unless English is asked for", () => {
    expect(moneyLocale("en")).toBe("en");
    expect(moneyLocale("he")).toBe("he");
    expect(moneyLocale("fr")).toBe("he");
  });
});
