import { describe, expect, it } from "vitest";
import { bankBlock, documentChanged, localeToSave } from "./flow-rules";

// The flow's small decisions (profile H5a), each as the review found it
// going wrong: step 0 taking the file back to a language left behind, a
// document's new country dropped unsaid, an account kept back with no
// words.

describe("localeToSave", () => {
  it("follows the file's language until one is picked on step 0", () => {
    // The language button made it English: step 0 saves nothing of it.
    expect(localeToSave(null, "en")).toBeNull();
    expect(localeToSave(null, "he")).toBeNull();
  });

  it("saves one picked there, and only when it differs", () => {
    expect(localeToSave("en", "he")).toBe("en");
    expect(localeToSave("he", "en")).toBe("he");
    expect(localeToSave("en", "en")).toBeNull();
  });
});

describe("documentChanged", () => {
  const passport = { country: "FR", expiresOn: "2030-01-01", name: null };

  it("sees a new country, expiry or name of a saved document", () => {
    expect(documentChanged(passport, { ...passport, country: "BE" })).toBe(
      true,
    );
    expect(documentChanged(passport, { ...passport, expiresOn: null })).toBe(
      true,
    );
    expect(
      documentChanged(
        { country: null, expiresOn: null, name: "אשרת שהייה" },
        { country: null, expiresOn: null, name: "אשרת עבודה" },
      ),
    ).toBe(true);
  });

  it("sees nothing when only the number may change", () => {
    expect(documentChanged(passport, { ...passport })).toBe(false);
    expect(
      documentChanged(
        { country: null, expiresOn: null, name: null },
        { country: null, expiresOn: null, name: "" },
      ),
    ).toBe(false);
  });
});

describe("bankBlock", () => {
  const typed = {
    empty: 0,
    holderOther: false,
    unusable: false,
    warning: false,
    kept: false,
  };

  it("lets a whole account go", () => {
    expect(bankBlock(typed)).toBeNull();
    expect(bankBlock({ ...typed, warning: true, kept: true })).toBeNull();
  });

  it("says a warning not kept, though nothing is missing", () => {
    expect(bankBlock({ ...typed, warning: true })).toBe("warning");
  });

  it("says first what the person meets first", () => {
    expect(bankBlock({ ...typed, empty: 2, warning: true })).toBe("missing");
    expect(bankBlock({ ...typed, holderOther: true, unusable: true })).toBe(
      "other",
    );
    expect(bankBlock({ ...typed, unusable: true, warning: true })).toBe(
      "unusable",
    );
  });
});
