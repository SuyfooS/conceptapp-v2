import { describe, expect, it } from "vitest";
import {
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
