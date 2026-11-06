import { describe, expect, it } from "vitest";
import { avatarHue, firstNameOf, initialsOf } from "./people";

describe("firstNameOf", () => {
  it("takes the first word, whatever the spacing", () => {
    expect(firstNameOf("נועה כהן")).toBe("נועה");
    expect(firstNameOf("  שירן  ")).toBe("שירן");
  });

  it("is empty for an empty name", () => {
    expect(firstNameOf("")).toBe("");
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
