import { describe, expect, it } from "vitest";
import {
  ACCENT_PRESETS,
  accentTokens,
  contrastRatio,
  DARK_SURFACES,
  INK,
  LIGHT_SURFACES,
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
      for (const surface of LIGHT_SURFACES) {
        expect(contrastRatio(t.accent, surface)).toBeGreaterThanOrEqual(3);
      }
      expect(contrastRatio(t.accent, t.accentInk)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each([
    ...ACCENT_PRESETS.map((p) => p.hex),
    "#9000ff",
    "#ffd400",
    "#f4c2c2",
    "#7dd3fc",
    "#ffffff",
    "#000000",
    "#1c1b19",
    "#450a0a",
  ])("gives %s a readable pair on dark surfaces", (hex) => {
    const t = accentTokens(hex);
    for (const surface of DARK_SURFACES) {
      expect(contrastRatio(t.accentDark, surface)).toBeGreaterThanOrEqual(3);
    }
    expect(contrastRatio(t.accentDark, t.accentDarkInk)).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it("keeps a colour already readable on dark surfaces", () => {
    const t = accentTokens("#3b82f6");
    expect(t.accentDark).toBe(t.accent);
  });

  it("lifts a dark accent for dark surfaces", () => {
    const t = accentTokens("#8b2635");
    expect(t.accent).toBe("#8b2635");
    expect(contrastRatio(t.accentDark, "#17181b")).toBeGreaterThan(
      contrastRatio(t.accent, "#17181b"),
    );
  });

  it("adjusts none of the presets", () => {
    for (const preset of ACCENT_PRESETS) {
      expect(accentTokens(preset.hex).adjusted).toBe(false);
    }
  });

  it("rejects input that is not a colour", () => {
    expect(() => accentTokens("burgundy")).toThrow();
  });
});
