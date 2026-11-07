import { describe, expect, it } from "vitest";
import {
  businessDetailProblem,
  checkBusinessDetailsChange,
} from "./business-details";
import { accentTokens } from "./color";

describe("a change to a business's details", () => {
  it("is stored tidied", () => {
    expect(
      checkBusinessDetailsChange({
        name: "  Café   Noa ",
        address: " Herzl  5,  Haifa ",
      }),
    ).toEqual({
      ok: true,
      patch: { name: "Café Noa", address: "Herzl 5, Haifa" },
    });
  });

  it("names one detail or more, and leaves the others", () => {
    expect(checkBusinessDetailsChange({ shabbatCity: "jerusalem" })).toEqual({
      ok: true,
      patch: { shabbatCity: "jerusalem" },
    });
  });

  it("takes an empty address as no address", () => {
    for (const address of ["", "   ", null]) {
      expect(checkBusinessDetailsChange({ address })).toEqual({
        ok: true,
        patch: { address: null },
      });
    }
  });

  it("stores a colour in lower case, darkened when it isn't readable", () => {
    expect(checkBusinessDetailsChange({ accent: "#2563EB" })).toEqual({
      ok: true,
      patch: { accent: "#2563eb" },
    });
    const pale = accentTokens("#ffff66");
    expect(pale.adjusted).toBe(true);
    expect(checkBusinessDetailsChange({ accent: "#FFFF66" })).toEqual({
      ok: true,
      patch: { accent: pale.accent },
    });
  });

  it("refuses what isn't a change", () => {
    for (const change of [null, undefined, "name", [], [{ name: "X" }], {}]) {
      expect(checkBusinessDetailsChange(change)).toEqual({
        ok: false,
        problem: "invalid",
      });
    }
  });

  it("refuses a detail it doesn't know, even beside good ones", () => {
    for (const change of [
      { slug: "elsewhere" },
      { name: "Fine", template: "restaurant" },
      { toString: "x" },
    ]) {
      expect(checkBusinessDetailsChange(change).ok).toBe(false);
    }
  });

  it("refuses a value that can't be stored", () => {
    for (const change of [
      { name: "" },
      { name: "   " },
      { name: 5 },
      { name: "x".repeat(81) },
      { accent: "blue" },
      { accent: "#12345" },
      { accent: null },
      { address: "x".repeat(201) },
      { address: 5 },
      { shabbatCity: "Jerusalem" },
      { shabbatCity: "toString" },
      { shabbatCity: null },
    ]) {
      expect(
        checkBusinessDetailsChange(change),
        JSON.stringify(change),
      ).toEqual({ ok: false, problem: "invalid" });
    }
  });
});

describe("what the screen says about a detail as typed", () => {
  it("names the problem", () => {
    expect(businessDetailProblem("name", " ")).toBe("required");
    expect(businessDetailProblem("name", "x".repeat(81))).toBe("tooLong");
    expect(businessDetailProblem("address", "x".repeat(201))).toBe("tooLong");
    expect(businessDetailProblem("accent", "")).toBe("required");
    expect(businessDetailProblem("accent", "#zzzzzz")).toBe("invalid");
    expect(businessDetailProblem("shabbatCity", "atlantis")).toBe("invalid");
  });

  it("is quiet when it can be saved", () => {
    expect(businessDetailProblem("name", "Café Noa")).toBeNull();
    expect(businessDetailProblem("address", "")).toBeNull();
    expect(businessDetailProblem("accent", "#0f766e")).toBeNull();
    expect(businessDetailProblem("shabbatCity", "eilat")).toBeNull();
  });
});
