import { describe, expect, it } from "vitest";
import {
  avatarHue,
  firstNameOf,
  initialsOf,
  shortNames,
  shortNamesAmong,
  shownName,
} from "./people";

describe("shownName", () => {
  it("is the business's name for someone, else their own", () => {
    expect(shownName("נועה כהן-לוי", "נועה כהן")).toBe("נועה כהן-לוי");
    expect(shownName(null, "  נועה כהן ")).toBe("נועה כהן");
    expect(shownName(undefined, "נועה כהן")).toBe("נועה כהן");
    expect(shownName("   ", "נועה כהן")).toBe("נועה כהן");
  });

  it("is null when neither is written", () => {
    expect(shownName(null, null)).toBe(null);
    expect(shownName(undefined, "  ")).toBe(null);
  });
});

describe("firstNameOf", () => {
  it("takes the first word, whatever the spacing", () => {
    expect(firstNameOf("נועה כהן")).toBe("נועה");
    expect(firstNameOf("  שירן  ")).toBe("שירן");
  });

  it("is empty for an empty name", () => {
    expect(firstNameOf("")).toBe("");
  });
});

describe("shortNames", () => {
  it("keeps first names", () => {
    expect(shortNames(["נועה כהן", "  איתי  מזרחי ", "שירן"])).toEqual([
      "נועה",
      "איתי",
      "שירן",
    ]);
  });

  it("keeps the full name where a first name repeats", () => {
    expect(shortNames(["נועה כהן", "נועה לוי", "איתי מזרחי"])).toEqual([
      "נועה כהן",
      "נועה לוי",
      "איתי",
    ]);
  });
});

describe("shortNamesAmong", () => {
  const shift = ["נועה כהן", "נועה לוי", "איתי מזרחי"];

  it("keeps a full name when the whole list repeats its first name", () => {
    // Only one of the two Noas is away: the line still says which.
    expect(shortNamesAmong(["נועה כהן"], shift)).toEqual(["נועה כהן"]);
    expect(shortNamesAmong(["נועה לוי", "נועה כהן"], shift)).toEqual([
      "נועה לוי",
      "נועה כהן",
    ]);
  });

  it("keeps first names where the list has no other", () => {
    expect(shortNamesAmong(["איתי מזרחי"], shift)).toEqual(["איתי"]);
    expect(shortNamesAmong(["נועה כהן"], ["נועה כהן", "שירן"])).toEqual([
      "נועה",
    ]);
  });

  it("leaves a name not on the list whole", () => {
    expect(shortNamesAmong(["מי שכבר לא בצוות"], shift)).toEqual([
      "מי שכבר לא בצוות",
    ]);
  });

  it("is empty for nobody", () => {
    expect(shortNamesAmong([], shift)).toEqual([]);
  });
});

describe("initialsOf", () => {
  it("takes the first letter of the first two words", () => {
    expect(initialsOf("נועה כהן")).toBe("נכ");
    expect(initialsOf("  שירן  ")).toBe("ש");
    expect(initialsOf("דנה בת שבע לוי")).toBe("דב");
  });

  it("is empty for an empty name", () => {
    expect(initialsOf("")).toBe("");
  });
});

describe("avatarHue", () => {
  it("is stable and in range", () => {
    expect(avatarHue("נועה כהן")).toBe(avatarHue("נועה כהן"));
    for (const name of ["", "א", "נועה כהן", "Yoav Levi"]) {
      expect(avatarHue(name)).toBeGreaterThanOrEqual(0);
      expect(avatarHue(name)).toBeLessThan(360);
    }
  });

  it("tells people apart", () => {
    expect(avatarHue("נועה כהן")).not.toBe(avatarHue("יואב לוי"));
  });
});
