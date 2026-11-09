import { describe, expect, it } from "vitest";
import {
  ADDRESS_FORMS,
  addressFormOf,
  BIO_MAX,
  bioLength,
  COVER_PRESETS,
  checkProfileChange,
  coverOf,
  DEFAULT_COVER,
  formArg,
  mayClearBio,
  normalizeBio,
  seenBioOf,
} from "./profile";

describe("covers", () => {
  it("draws a stored preset as itself", () => {
    expect(coverOf("dots")).toBe("dots");
    for (const preset of COVER_PRESETS) expect(coverOf(preset)).toBe(preset);
  });

  it("draws the default for nothing, or a key it no longer has", () => {
    expect(coverOf(null)).toBe("glow");
    expect(coverOf(undefined)).toBe("glow");
    expect(coverOf("")).toBe("glow");
    expect(coverOf("nope")).toBe("glow");
    expect(DEFAULT_COVER).toBe("glow");
  });

  it("has eight, each a key the database takes", () => {
    expect(COVER_PRESETS).toHaveLength(8);
    expect(new Set(COVER_PRESETS).size).toBe(8);
    // The table's check: ^[a-z][a-z0-9_]{0,23}$
    for (const preset of COVER_PRESETS) {
      expect(preset).toMatch(/^[a-z][a-z0-9_]{0,23}$/);
    }
  });
});

describe("forms of address", () => {
  it("reads what the database stores", () => {
    for (const form of ADDRESS_FORMS) expect(addressFormOf(form)).toBe(form);
    expect(addressFormOf(null)).toBeNull();
    expect(addressFormOf("n")).toBeNull();
    expect(addressFormOf(1)).toBeNull();
  });

  it("speaks without gender until one is chosen", () => {
    expect(formArg(null)).toBe("x");
    expect(formArg(undefined)).toBe("x");
    expect(formArg("f")).toBe("f");
    expect(formArg("m")).toBe("m");
    expect(formArg("x")).toBe("x");
  });
});

describe("the line about yourself", () => {
  it("is one line, trimmed", () => {
    expect(normalizeBio(" a \n b ")).toBe("a b");
    expect(normalizeBio("a\t\tb\r\nc")).toBe("a b c");
    expect(normalizeBio("a  b")).toBe("a b");
    expect(normalizeBio("a\u0007b")).toBe("ab");
    expect(normalizeBio("   ")).toBe("");
  });

  it("is kept in one Unicode form", () => {
    // e and a combining acute become é.
    expect(normalizeBio("é")).toBe("é");
  });

  it("counts characters as Postgres does", () => {
    expect(bioLength("👍".repeat(2))).toBe(2);
    expect(bioLength("שלום")).toBe(4);
    expect(bioLength("")).toBe(0);
  });
});

describe("checkProfileChange", () => {
  it("turns the screen's names into the database's", () => {
    expect(checkProfileChange({ cover: "dots", addressForm: "f" })).toEqual({
      ok: true,
      patch: { cover: "dots", address_form: "f" },
    });
    expect(checkProfileChange({ addressForm: null })).toEqual({
      ok: true,
      patch: { address_form: null },
    });
  });

  it("keeps the line as it is stored", () => {
    expect(checkProfileChange({ bio: "  בבוקר\nבקופה " })).toEqual({
      ok: true,
      patch: { bio: "בבוקר בקופה" },
    });
    expect(checkProfileChange({ bio: "  " })).toEqual({
      ok: true,
      patch: { bio: null },
    });
    expect(checkProfileChange({ bio: null })).toEqual({
      ok: true,
      patch: { bio: null },
    });
  });

  it("takes 160 characters and no more", () => {
    expect(checkProfileChange({ bio: "x".repeat(BIO_MAX) }).ok).toBe(true);
    expect(checkProfileChange({ bio: "x".repeat(161) })).toEqual({
      ok: false,
      problem: "bioTooLong",
    });
    // Spaces that normalizing drops don't count.
    expect(checkProfileChange({ bio: ` ${"x".repeat(160)} ` }).ok).toBe(true);
    expect(checkProfileChange({ bio: "👍".repeat(160) }).ok).toBe(true);
  });

  it("refuses nothing, and anything it doesn't know", () => {
    expect(checkProfileChange({})).toEqual({ ok: false, problem: "empty" });
    expect(checkProfileChange({ bio: undefined })).toEqual({
      ok: false,
      problem: "empty",
    });
    for (const change of [
      { phone: 1 },
      { cover: "Waves!" },
      { cover: "nope" },
      { addressForm: "n" },
      { bio: 5 },
      "bio",
      null,
      [],
    ]) {
      expect(checkProfileChange(change), JSON.stringify(change)).toEqual({
        ok: false,
        problem: "invalid",
      });
    }
  });
});

describe("mayClearBio", () => {
  it("lets owners clear anyone's line and managers anyone's but an owner's", () => {
    expect(mayClearBio("owner", "owner")).toBe(true);
    expect(mayClearBio("owner", "manager")).toBe(true);
    expect(mayClearBio("owner", "worker")).toBe(true);
    expect(mayClearBio("manager", "manager")).toBe(true);
    expect(mayClearBio("manager", "worker")).toBe(true);
    expect(mayClearBio("manager", "owner")).toBe(false);
  });

  it("lets workers clear nobody's", () => {
    expect(mayClearBio("worker", "worker")).toBe(false);
    expect(mayClearBio("worker", "manager")).toBe(false);
  });
});

describe("seenBioOf", () => {
  it("takes the line as the screen read it, unchanged", () => {
    expect(seenBioOf("בבוקר בקופה")).toBe("בבוקר בקופה");
    expect(seenBioOf("א".repeat(BIO_MAX))).toBe("א".repeat(BIO_MAX));
    expect(seenBioOf("🙂".repeat(BIO_MAX))).toBe("🙂".repeat(BIO_MAX));
  });

  it("refuses what can't be a kept line", () => {
    expect(seenBioOf("")).toBeNull();
    expect(seenBioOf(null)).toBeNull();
    expect(seenBioOf(undefined)).toBeNull();
    expect(seenBioOf(42)).toBeNull();
    expect(seenBioOf("א".repeat(BIO_MAX + 1))).toBeNull();
  });
});
