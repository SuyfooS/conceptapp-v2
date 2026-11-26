import { describe, expect, it } from "vitest";
import {
  BULLET,
  clean,
  FINAL_FIRST,
  readsBackwards,
  westernDigits,
} from "./pasted-text";

const LRM = String.fromCodePoint(0x200e);
const RLM = String.fromCodePoint(0x200f);
const BOM = String.fromCodePoint(0xfeff);
const ISOLATE = String.fromCodePoint(0x2067);
const POP = String.fromCodePoint(0x2069);
const NBSP = String.fromCodePoint(0xa0);
const NARROW = String.fromCodePoint(0x202f);

describe("clean", () => {
  it("drops direction marks, isolates and the byte order mark", () => {
    expect(clean(`${BOM}${RLM}דנה${LRM} ${ISOLATE}כהן${POP}`)).toBe("דנה כהן");
  });

  it("collapses every kind of space, tabs too, and trims", () => {
    expect(clean(`  דנה\t\tכהן${NBSP}050${NARROW}123  `)).toBe(
      "דנה כהן 050 123",
    );
  });

  it("leaves an empty line empty", () => {
    expect(clean(`${LRM}  \t `)).toBe("");
  });
});

describe("BULLET", () => {
  it("is a dash, a star or a dot before the line", () => {
    for (const bullet of ["- ", "* ", "• ", "·"]) {
      expect(`${bullet}דנה`.replace(BULLET, "")).toBe("דנה");
    }
    expect("+ גבינה".replace(BULLET, "")).toBe("+ גבינה");
  });
});

describe("readsBackwards", () => {
  it("finds a word that starts with a final letter, as a PDF copies Hebrew", () => {
    expect(readsBackwards("ןהכ הנד")).toBe(true);
    expect(readsBackwards("62 לצינש")).toBe(false);
    expect(FINAL_FIRST.test("(םולש")).toBe(true);
  });

  it("reads plain Hebrew and other scripts as they are", () => {
    expect(readsBackwards("דנה כהן")).toBe(false);
    expect(readsBackwards("Анна Петрова")).toBe(false);
    expect(readsBackwards("")).toBe(false);
  });
});

describe("westernDigits", () => {
  it("reads Arabic-Indic and Extended Arabic-Indic digits as 0-9", () => {
    expect(westernDigits("٠٥٠١٢٣٤٥٦٧")).toBe("0501234567");
    expect(westernDigits("۰۵۲۷۶۵۴۳۲۱")).toBe("0527654321");
    expect(westernDigits("דנה 050")).toBe("דנה 050");
  });
});
