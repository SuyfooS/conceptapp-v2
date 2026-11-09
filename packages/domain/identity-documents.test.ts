import { describe, expect, it } from "vitest";
import {
  documentHint,
  ID_KINDS,
  ISO_COUNTRIES,
  identityDocumentSchema,
  normalizeDocumentNumber,
  otherDocumentSchema,
  passportSchema,
} from "./identity-documents";

describe("the country list", () => {
  it("is ISO 3166-1's 249 codes plus Kosovo, each once", () => {
    expect(ISO_COUNTRIES).toHaveLength(250);
    expect(new Set(ISO_COUNTRIES).size).toBe(250);
    expect(ISO_COUNTRIES).toContain("XK");
    for (const code of ISO_COUNTRIES) expect(code).toMatch(/^[A-Z]{2}$/);
  });

  // The screen names countries with Intl.DisplayNames, so each code needs a name there.
  it.each(["he", "en"])("has a name for every code in %s", (locale) => {
    const names = new Intl.DisplayNames([locale], {
      type: "region",
      fallback: "none",
    });
    for (const code of ISO_COUNTRIES) {
      expect(names.of(code), code).toBeTruthy();
    }
  });
});

describe("normalizeDocumentNumber", () => {
  it.each([
    ["ab 123-456", "AB123456"],
    ["AB1234567", "AB1234567"],
    ["\uFF21\uFF22123", "AB123"],
    ["\u200FAB\u2013123", "AB123"],
  ])("reads %s as %s", (input, expected) => {
    expect(normalizeDocumentNumber(input)).toBe(expected);
  });

  it.each(["שלום1", "AB.123", "AB/123", "\u00DF123", ""])(
    "refuses %s",
    (input) => {
      expect(normalizeDocumentNumber(input)).toBeNull();
    },
  );
});

describe("documentHint", () => {
  it("is the last four characters", () => {
    expect(documentHint("AB1234567")).toBe("4567");
    expect(documentHint("A123")).toBe("A123");
  });
});

describe("passportSchema", () => {
  it("takes a number and a country, and stores the number normalized", () => {
    expect(
      passportSchema.parse({ number: "ab 1234567", country: "UA" }),
    ).toEqual({ number: "AB1234567", country: "UA" });
  });

  it("takes an expiry date", () => {
    const passport = { number: "AB1234567", country: "UA" };
    expect(
      passportSchema.safeParse({ ...passport, expiresOn: "2031-05-01" })
        .success,
    ).toBe(true);
  });

  it.each([
    ["a number too short", { number: "1234", country: "UA" }],
    ["a number too long", { number: "A".repeat(21), country: "UA" }],
    ["a number in Hebrew", { number: "אב123456", country: "UA" }],
    ["no country", { number: "AB1234567" }],
    ["an unknown country", { number: "AB1234567", country: "ZZ" }],
    ["a lower-case country", { number: "AB1234567", country: "ua" }],
    [
      "a day that doesn't exist",
      { number: "AB1234567", country: "UA", expiresOn: "2026-02-30" },
    ],
    [
      "an expiry before 2000",
      { number: "AB1234567", country: "UA", expiresOn: "1999-12-31" },
    ],
    [
      "an expiry after 2100",
      { number: "AB1234567", country: "UA", expiresOn: "2101-01-01" },
    ],
  ])("refuses %s", (_name, input) => {
    expect(passportSchema.safeParse(input).success).toBe(false);
  });
});

describe("otherDocumentSchema", () => {
  const asylum = "תעודת מבקש מקלט";

  it("takes a name and a number, country and expiry optional", () => {
    expect(
      otherDocumentSchema.parse({ name: ` ${asylum} `, number: "1234" }),
    ).toEqual({
      name: asylum,
      number: "1234",
    });
    expect(
      otherDocumentSchema.safeParse({
        name: asylum,
        number: "1234",
        country: "ER",
        expiresOn: "2027-01-31",
      }).success,
    ).toBe(true);
  });

  it.each([
    ["a one-letter name", { name: "א", number: "1234" }],
    ["a name on two lines", { name: "אב\nגד", number: "1234" }],
    ["a name too long", { name: "א".repeat(41), number: "1234" }],
    ["a number too short", { name: asylum, number: "123" }],
    ["an unknown country", { name: asylum, number: "1234", country: "ZZ" }],
  ])("refuses %s", (_name, input) => {
    expect(otherDocumentSchema.safeParse(input).success).toBe(false);
  });
});

describe("identityDocumentSchema", () => {
  it("has a shape for each kind", () => {
    expect(
      identityDocumentSchema.options.map((o) => o.shape.kind.value),
    ).toEqual([...ID_KINDS]);
  });

  it("takes an Israeli ID and stores its nine digits", () => {
    expect(identityDocumentSchema.parse({ kind: "il", number: "18" })).toEqual({
      kind: "il",
      number: "000000018",
    });
  });

  it("refuses an Israeli ID whose check digit fails", () => {
    expect(
      identityDocumentSchema.safeParse({ kind: "il", number: "000000019" })
        .success,
    ).toBe(false);
  });

  it("takes a passport", () => {
    expect(
      identityDocumentSchema.safeParse({
        kind: "passport",
        number: "AB1234567",
        country: "UA",
      }).success,
    ).toBe(true);
  });

  it("refuses an unknown kind", () => {
    expect(
      identityDocumentSchema.safeParse({ kind: "licence", number: "1234" })
        .success,
    ).toBe(false);
  });
});
