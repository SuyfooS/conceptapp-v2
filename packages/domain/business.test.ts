import { describe, expect, it } from "vitest";
import {
  firstStepWithError,
  NEW_BUSINESS_FIELDS,
  NEW_BUSINESS_STEPS,
  normalizeSlug,
  parseNewBusiness,
} from "./business";
import { ACCENT_PRESETS, accentTokens } from "./color";

const valid = {
  template: "restaurant",
  name: "  קפה   נועה ",
  slug: "Cafe Noa",
  address: " רחוב הרצל 1, חיפה ",
  accent: "#2563EB",
};

describe("normalizeSlug", () => {
  it("lower-cases and turns spaces and underscores into single hyphens", () => {
    expect(normalizeSlug("  Cafe  Noa_TLV ")).toBe("cafe-noa-tlv");
    expect(normalizeSlug("--bar--42--")).toBe("bar-42");
  });

  it("keeps characters the check must reject", () => {
    expect(normalizeSlug("קפה")).toBe("קפה");
    expect(normalizeSlug("cafe.noa")).toBe("cafe.noa");
  });
});

describe("parseNewBusiness", () => {
  it("returns the tidied business", () => {
    expect(parseNewBusiness(valid)).toEqual({
      ok: true,
      value: {
        template: "restaurant",
        name: "קפה נועה",
        slug: "cafe-noa",
        address: "רחוב הרצל 1, חיפה",
        accent: "#2563eb",
      },
    });
  });

  it("stores an empty address as null", () => {
    const result = parseNewBusiness({ ...valid, address: "   " });
    expect(result.ok && result.value.address).toBeNull();
  });

  it("stores the readable version of a pale accent", () => {
    const result = parseNewBusiness({ ...valid, accent: "#ffee00" });
    const tokens = accentTokens("#ffee00");
    expect(tokens.adjusted).toBe(true);
    expect(result.ok && result.value.accent).toBe(tokens.accent);
  });

  it("names every missing field", () => {
    expect(parseNewBusiness({})).toEqual({
      ok: false,
      errors: {
        template: "required",
        name: "required",
        slug: "required",
        accent: "required",
      },
    });
  });

  it.each([
    ["ab", "tooShort"],
    ["a".repeat(41), "tooLong"],
    ["קפה-נועה", "invalid"],
    ["cafe.noa", "invalid"],
    ["admin", "reserved"],
    ["Sign In", "reserved"],
  ])("rejects the slug %s as %s", (slug, error) => {
    expect(parseNewBusiness({ ...valid, slug })).toEqual({
      ok: false,
      errors: { slug: error },
    });
  });

  it("rejects an unknown template, a long name and address, a bad colour", () => {
    expect(
      parseNewBusiness({
        ...valid,
        template: "bakery",
        name: "א".repeat(81),
        address: "א".repeat(201),
        accent: "blue",
      }),
    ).toEqual({
      ok: false,
      errors: {
        template: "invalid",
        name: "tooLong",
        address: "tooLong",
        accent: "invalid",
      },
    });
  });

  it("ignores non-string values instead of throwing", () => {
    const result = parseNewBusiness({ ...valid, name: 42 });
    expect(result).toEqual({ ok: false, errors: { name: "required" } });
  });

  it("checks only the fields of one step when asked", () => {
    expect(
      parseNewBusiness({ template: "cafe-bar" }, NEW_BUSINESS_STEPS[0]).ok,
    ).toBe(true);
    expect(
      parseNewBusiness({ name: "x", slug: "admin" }, NEW_BUSINESS_STEPS[1]),
    ).toEqual({ ok: false, errors: { slug: "reserved" } });
  });
});

describe("wizard steps", () => {
  it("ask every field exactly once", () => {
    expect(NEW_BUSINESS_STEPS.flat().sort()).toEqual(
      [...NEW_BUSINESS_FIELDS].sort(),
    );
  });

  it("go back to the first step with an error", () => {
    expect(firstStepWithError({ accent: "invalid" })).toBe(2);
    expect(firstStepWithError({ slug: "taken", accent: "invalid" })).toBe(1);
    expect(firstStepWithError({})).toBe(0);
  });
});

describe("accent presets", () => {
  it("are readable as they are and unique", () => {
    for (const { hex } of ACCENT_PRESETS) {
      expect(accentTokens(hex)).toMatchObject({ accent: hex, adjusted: false });
    }
    expect(new Set(ACCENT_PRESETS.map((p) => p.hex)).size).toBe(
      ACCENT_PRESETS.length,
    );
  });
});
