import { describe, expect, it } from "vitest";
import { builtInRoleWord, wordKey } from "./staff-list";

describe("builtInRoleWord", () => {
  it("reads the built-in roles' own words, slashes and gershayim aside", () => {
    expect(
      [
        "מנהלת",
        "מנהל/ת",
        'אחמ"ש',
        "Manager",
        "עובד/ת",
        "עובדת",
        "employee",
        "staff",
        "בעלים",
        "owner",
        "מנהלת חשבונות",
        "מנהל/ת חשבונות",
        "רואה חשבון",
        "bookkeeper",
      ].map(builtInRoleWord),
    ).toEqual([
      "manager",
      "manager",
      "manager",
      "manager",
      "worker",
      "worker",
      "worker",
      "worker",
      "owner",
      "owner",
      "accountant",
      "accountant",
      "accountant",
      "accountant",
    ]);
  });

  it("reads an owner's and a shift lead's two words as one", () => {
    expect(
      [
        "בעל העסק",
        "בעלת העסק",
        "בעל/ת העסק",
        "בעלי העסק",
        "הבעלים",
        "Business owner",
        "אחראי משמרת",
        "אחראית משמרת",
        "אחראי/ת משמרת",
        "מנהל משמרת",
        "מנהלת משמרת",
        "Shift manager",
        "shift lead",
      ].map(builtInRoleWord),
    ).toEqual([
      "owner",
      "owner",
      "owner",
      "owner",
      "owner",
      "owner",
      "manager",
      "manager",
      "manager",
      "manager",
      "manager",
      "manager",
      "manager",
    ]);
    // Their second word alone is no role.
    expect(builtInRoleWord("העסק")).toBeNull();
    expect(builtInRoleWord("משמרת")).toBeNull();
  });

  it("is null for anything else", () => {
    expect(builtInRoleWord("ניהול")).toBeNull();
    expect(builtInRoleWord("חשבונות")).toBeNull();
    expect(builtInRoleWord("")).toBeNull();
    expect(builtInRoleWord("דנה")).toBeNull();
  });
});

describe("wordKey", () => {
  it("drops quotes, gershayim, brackets, colons and dots, case aside", () => {
    expect(wordKey('ת"ז')).toBe("תז");
    expect(wordKey("ת.ז.")).toBe("תז");
    expect(wordKey("טל'")).toBe("טל");
    expect(wordKey("(Role):")).toBe("role");
  });
});
