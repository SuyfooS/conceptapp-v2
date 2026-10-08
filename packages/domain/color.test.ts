import { describe, expect, it } from "vitest";
import {
  accentTokens,
  contrastRatio,
  INK,
  parseHex,
  readableInk,
  WHITE,
} from "./color";

describe("contrastRatio", () => {
  it("is 21 for black on white and 1 for a colour on itself", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#8b2635", "#8b2635")).toBeCloseTo(1, 5);
  });
  it("reads three-digit hex", () => {
    expect(parseHex("#fff")).toEqual([255, 255, 255]);
    expect(parseHex("nope")).toBeNull();
  });
});

describe("readableInk", () => {
  it("puts white on dark accents and ink on light ones", () => {
    expect(readableInk("#8b2635")).toBe(WHITE);
    expect(readableInk("#ffd400")).toBe(INK);
  });
});

describe("accentTokens", () => {
  it.each(["#8b2635", "#9000ff", "#1f7a4d"])("keeps %s as chosen", (hex) => {
    const t = accentTokens(hex);
    expect(t.adjusted).toBe(false);
    expect(t.accent).toBe(hex);
  });

  it.each(["#ffd400", "#f4c2c2", "#7dd3fc", "#ffffff"])(
    "darkens %s until buttons and their text are readable",
    (hex) => {
      const t = accentTokens(hex);
      expect(t.adjusted).toBe(true);
      expect(contrastRatio(t.accent, WHITE)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(t.accent, t.accentInk)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("rejects input that is not a colour", () => {
    expect(() => accentTokens("burgundy")).toThrow();
  });
});
