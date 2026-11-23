import { describe, expect, it } from "vitest";
import type { Viewer } from "./modules";
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
  keptNameOf,
  mayClearBio,
  normalizeBio,
  PROFILE_LOCALES,
  profileLocaleOf,
  seenBioOf,
} from "./profile";
import { TEAM_NAME_MAX } from "./team";

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

describe("the app's language", () => {
  it("reads what the database stores, Hebrew for anything else", () => {
    for (const locale of PROFILE_LOCALES) {
      expect(profileLocaleOf(locale)).toBe(locale);
    }
    expect(profileLocaleOf(null)).toBe("he");
    expect(profileLocaleOf("fr")).toBe("he");
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
    expect(checkProfileChange({ addressForm: "m", locale: "en" })).toEqual({
      ok: true,
      patch: { address_form: "m", locale: "en" },
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

  it("keeps their own name as the team keeps a name", () => {
    expect(checkProfileChange({ name: " נועה   כהן " })).toEqual({
      ok: true,
      patch: { full_name: "נועה כהן" },
    });
    expect(checkProfileChange({ name: "נועה\n\tכהן" })).toEqual({
      ok: true,
      patch: { full_name: "נועה כהן" },
    });
    // e and a combining diaeresis become ë.
    expect(checkProfileChange({ name: "Noe\u0308l" })).toEqual({
      ok: true,
      patch: { full_name: "No\u00ebl" },
    });
    // What nobody sees is dropped, a maqaf or a dash stays.
    expect(checkProfileChange({ name: "נועה\u0007 כהן" })).toEqual({
      ok: true,
      patch: { full_name: "נועה כהן" },
    });
    expect(checkProfileChange({ name: "ורד צוות-לוי" })).toEqual({
      ok: true,
      patch: { full_name: "ורד צוות-לוי" },
    });
  });

  it("takes a name of 80 characters and no more, and never none", () => {
    expect(checkProfileChange({ name: "א".repeat(TEAM_NAME_MAX) })).toEqual({
      ok: true,
      patch: { full_name: "א".repeat(TEAM_NAME_MAX) },
    });
    expect(checkProfileChange({ name: "א".repeat(TEAM_NAME_MAX + 1) })).toEqual(
      { ok: false, problem: "nameTooLong" },
    );
    // An emoji is one character, as Postgres counts it.
    expect(checkProfileChange({ name: "🙂".repeat(TEAM_NAME_MAX) }).ok).toBe(
      true,
    );
    // Spaces that collapsing drops don't count.
    expect(
      checkProfileChange({ name: ` ${"א".repeat(TEAM_NAME_MAX)} ` }).ok,
    ).toBe(true);
    for (const name of ["", "   ", "\u0007"]) {
      expect(checkProfileChange({ name }), JSON.stringify(name)).toEqual({
        ok: false,
        problem: "nameRequired",
      });
    }
  });

  it("takes no name nobody sees, and none that turns its sentences around", () => {
    // A zero-width space, direction marks, a word joiner, a soft hyphen, a
    // filler, a joiner: pasted alone, still no name.
    for (const name of [
      "\u200B",
      "\u200F\u200E",
      "\u2060",
      "\u00AD",
      "\u3164",
      " \u200B\u200D ",
    ]) {
      expect(checkProfileChange({ name }), JSON.stringify(name)).toEqual({
        ok: false,
        problem: "nameRequired",
      });
    }
    // A right-to-left override or an isolate goes, so a sentence with the
    // name in it ("X מוסר/ת, Y לוקח/ת") keeps its order.
    expect(checkProfileChange({ name: "\u202Eנועה כהן" })).toEqual({
      ok: true,
      patch: { full_name: "נועה כהן" },
    });
    expect(checkProfileChange({ name: "\u2067נועה\u2069 כהן\u200B" })).toEqual({
      ok: true,
      patch: { full_name: "נועה כהן" },
    });
  });

  it("checks a name with the rest of the change", () => {
    expect(checkProfileChange({ name: "נועה כהן", cover: "dots" })).toEqual({
      ok: true,
      patch: { full_name: "נועה כהן", cover: "dots" },
    });
    expect(
      checkProfileChange({ name: "  ", cover: "dots", addressForm: "f" }),
    ).toEqual({ ok: false, problem: "nameRequired" });
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
      // The column always holds a language: none, or one the app lacks, is no change.
      { locale: null },
      { locale: "fr" },
      { bio: 5 },
      // A name is never cleared, and is text.
      { name: null },
      { name: 42 },
      { name: "א".repeat(401) },
      { full_name: "נועה כהן" },
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

describe("keptNameOf", () => {
  it("is none when the business keeps their own name for them", () => {
    expect(keptNameOf("נועה כהן", "נועה כהן")).toBeNull();
    // As the team keeps names: a stored double space is the same name.
    expect(keptNameOf("נועה  כהן", "נועה כהן")).toBeNull();
    // And one stored with its letters decomposed.
    expect(keptNameOf("No\u00ebl", "Noe\u0308l")).toBeNull();
  });

  it("is the business's own name for them when it differs", () => {
    expect(keptNameOf("נועה כ.", "נועה כהן")).toBe("נועה כ.");
    // Someone the business named who has no name of their own.
    expect(keptNameOf("נועה כ.", null)).toBe("נועה כ.");
    expect(keptNameOf("נועה כ.", undefined)).toBe("נועה כ.");
  });

  it("is none when the business keeps none", () => {
    expect(keptNameOf(null, "נועה כהן")).toBeNull();
    expect(keptNameOf(null, null)).toBeNull();
    expect(keptNameOf("", "נועה כהן")).toBeNull();
  });
});

describe("mayClearBio", () => {
  // As the database answers by default: managers edit the team, workers
  // don't (the roles plan's R6).
  const EDITS = ["team.view", "team.edit"];
  const owner: Viewer = { role: "owner", perms: [] };
  const manager: Viewer = { role: "manager", perms: EDITS };
  const worker: Viewer = { role: "worker", perms: [] };

  it("lets owners clear anyone's line and managers anyone's but an owner's", () => {
    expect(mayClearBio(owner, "owner")).toBe(true);
    expect(mayClearBio(owner, "manager")).toBe(true);
    expect(mayClearBio(owner, "worker")).toBe(true);
    expect(mayClearBio(manager, "manager")).toBe(true);
    expect(mayClearBio(manager, "worker")).toBe(true);
    expect(mayClearBio(manager, "owner")).toBe(false);
  });

  it("lets workers clear nobody's", () => {
    expect(mayClearBio(worker, "worker")).toBe(false);
    expect(mayClearBio(worker, "manager")).toBe(false);
  });

  it("follows team edit, within the rank (R6)", () => {
    // A worker raised to edit the team clears a worker's line, never a
    // manager's; a manager lowered to view, or to none, clears nobody's.
    const raised: Viewer = { role: "worker", perms: EDITS };
    expect(mayClearBio(raised, "worker")).toBe(true);
    expect(mayClearBio(raised, "manager")).toBe(false);
    expect(
      mayClearBio({ role: "manager", perms: ["team.view"] }, "worker"),
    ).toBe(false);
    expect(mayClearBio({ role: "manager", perms: [] }, "worker")).toBe(false);
  });

  it("leaves an accountant's line to those above their rank (R6)", () => {
    // An accountant reads at a worker's rank: a worker raised to edit the
    // team doesn't clear their line, a manager and an owner do.
    expect(mayClearBio({ role: "worker", perms: EDITS }, "accountant")).toBe(
      false,
    );
    expect(mayClearBio(manager, "accountant")).toBe(true);
    expect(mayClearBio(owner, "accountant")).toBe(true);
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
