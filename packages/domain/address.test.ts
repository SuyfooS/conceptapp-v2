import { describe, expect, it } from "vitest";
import {
  addressProblems,
  addressSchema,
  cityCodeSchema,
  houseNumberSchema,
  normalizeHouseNumber,
  normalizeZip,
  zipSchema,
} from "./address";

describe("normalizeZip", () => {
  it.each(["6100001", "61000 01", "6100-001", " 6100001 ", "\u200F6100001"])(
    "reads %s as 6100001",
    (input) => {
      expect(normalizeZip(input)).toBe("6100001");
    },
  );

  it.each(["610000", "61000011", "0000000", "61000a1", ""])(
    "refuses %s",
    (input) => {
      expect(normalizeZip(input)).toBeNull();
    },
  );

  it("is a schema too", () => {
    expect(zipSchema.parse("61000 01")).toBe("6100001");
    const result = zipSchema.safeParse("610000");
    expect(result.error?.issues[0]?.message).toBe("zip");
  });
});

describe("normalizeHouseNumber", () => {
  it.each([
    ["12", "12"],
    ["12א", "12א"],
    ["12 א", "12א"],
    ["12A", "12A"],
    ["12a", "12A"],
    ["1234", "1234"],
    ["012", "12"],
    [" 7 ", "7"],
  ])("reads %s as %s", (input, expected) => {
    expect(normalizeHouseNumber(input)).toBe(expected);
    expect(houseNumberSchema.parse(input)).toBe(expected);
  });

  it.each(["12אב", "12345", "0", "א", "12/3", "12-14", ""])(
    "refuses %s",
    (input) => {
      expect(normalizeHouseNumber(input)).toBeNull();
      expect(houseNumberSchema.safeParse(input).success).toBe(false);
    },
  );
});

describe("cityCodeSchema", () => {
  it("is a whole number from 1 to 9999", () => {
    expect(cityCodeSchema.safeParse(5000).success).toBe(true);
    for (const bad of [0, 10000, 12.5]) {
      expect(cityCodeSchema.safeParse(bad).success, String(bad)).toBe(false);
    }
  });
});

describe("addressSchema", () => {
  const telAviv = 5000;

  it("takes a street with its number, apartment and zip optional", () => {
    expect(
      addressSchema.parse({
        kind: "street",
        cityCode: telAviv,
        street: "  הרצל ",
        number: "12 א",
      }),
    ).toEqual({
      kind: "street",
      cityCode: telAviv,
      street: "הרצל",
      number: "12א",
    });
    expect(
      addressSchema.safeParse({
        kind: "street",
        cityCode: telAviv,
        street: "הרצל",
        number: "12",
        apartment: "3",
        zip: "6100001",
      }).success,
    ).toBe(true);
  });

  it("refuses a street without a number", () => {
    expect(
      addressSchema.safeParse({
        kind: "street",
        cityCode: telAviv,
        street: "הרצל",
      }).success,
    ).toBe(false);
  });

  it("takes a neighbourhood without a number", () => {
    expect(
      addressSchema.safeParse({
        kind: "area",
        cityCode: telAviv,
        area: "נווה צדק",
      }).success,
    ).toBe(true);
  });

  it("takes a P.O. box of digits only", () => {
    expect(
      addressSchema.parse({
        kind: "poBox",
        cityCode: telAviv,
        poBox: " 12345 ",
      }),
    ).toEqual({ kind: "poBox", cityCode: telAviv, poBox: "12345" });
    for (const poBox of ["12א", "1234567", ""]) {
      expect(
        addressSchema.safeParse({ kind: "poBox", cityCode: telAviv, poBox })
          .success,
        poBox,
      ).toBe(false);
    }
  });

  it.each([
    ["a street of 61 characters", { street: "א".repeat(61) }],
    ["a street on two lines", { street: "הרצל\nתל אביב" }],
    ["an empty street", { street: "   " }],
    ["a bad zip", { zip: "123" }],
    ["a bad house number", { number: "12345" }],
    ["no city", { cityCode: undefined }],
  ])("refuses %s", (_name, change) => {
    expect(
      addressSchema.safeParse({
        kind: "street",
        cityCode: telAviv,
        street: "הרצל",
        number: "12",
        ...change,
      }).success,
    ).toBe(false);
  });

  it("takes a street of 60 characters", () => {
    expect(
      addressSchema.safeParse({
        kind: "street",
        cityCode: telAviv,
        street: "א".repeat(60),
        number: "1",
      }).success,
    ).toBe(true);
  });
});

describe("addressProblems", () => {
  const telAviv = 5000;
  const street = {
    kind: "street",
    cityCode: telAviv,
    street: "הרצל",
    number: "12",
  };

  it("finds none in an address the schema takes", () => {
    expect(addressProblems(street)).toEqual({});
    expect(
      addressProblems({ ...street, apartment: "3ב", zip: "61000 01" }),
    ).toEqual({});
  });

  it.each([
    ["an old five-digit zip", { zip: "61000" }, { zip: "invalid" }],
    [
      "an apartment of 11 characters",
      { apartment: "1".repeat(11) },
      { apartment: "tooLong" },
    ],
    [
      "a street of 61 characters",
      { street: "א".repeat(61) },
      { street: "tooLong" },
    ],
    [
      "a street on two lines",
      { street: "הרצל\nתל אביב" },
      { street: "invalid" },
    ],
    [
      "a house number of five digits",
      { number: "12345" },
      { number: "invalid" },
    ],
    [
      "two at once",
      { zip: "61000", apartment: "1".repeat(11) },
      { zip: "invalid", apartment: "tooLong" },
    ],
  ])("says %s under its own field", (_name, change, expected) => {
    expect(addressProblems({ ...street, ...change })).toEqual(expected);
  });

  it("says a place too long and a P.O. box of seven digits", () => {
    expect(
      addressProblems({
        kind: "area",
        cityCode: telAviv,
        area: "א".repeat(61),
      }),
    ).toEqual({ area: "tooLong" });
    expect(
      addressProblems({ kind: "poBox", cityCode: telAviv, poBox: "1234567" }),
    ).toEqual({ poBox: "invalid" });
  });

  it("leaves what is empty to the count of what is missing", () => {
    expect(addressProblems({ ...street, street: "  " })).toEqual({});
    expect(addressProblems({ ...street, cityCode: undefined })).toEqual({});
    expect(
      addressProblems({ kind: "street", cityCode: telAviv, street: "הרצל" }),
    ).toEqual({});
  });

  it("names a field for every refusal of an address with nothing missing", () => {
    for (const change of [
      { zip: "123" },
      { zip: "0000000" },
      { zip: "61000011" },
      { number: "0" },
      { number: "12/3" },
      { apartment: "דירה מספר 12" },
      { street: "א".repeat(70) },
      { street: "הרצל\u0007" },
    ]) {
      const address = { ...street, ...change };
      expect(addressSchema.safeParse(address).success).toBe(false);
      expect(
        Object.keys(addressProblems(address)),
        JSON.stringify(change),
      ).not.toHaveLength(0);
    }
  });
});
