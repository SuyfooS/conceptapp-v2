import { describe, expect, it } from "vitest";
import { isMissingColumn, isMissingFunction } from "./missing";

describe("isMissingFunction", () => {
  it("knows a function the project doesn't have yet, from PostgREST or Postgres", () => {
    expect(isMissingFunction({ code: "PGRST202" })).toBe(true);
    expect(isMissingFunction({ code: "42883" })).toBe(true);
  });

  it("leaves every other error, and none, to the caller", () => {
    expect(isMissingFunction({ code: "42501" })).toBe(false);
    expect(isMissingFunction({ code: "55000" })).toBe(false);
    expect(isMissingFunction({ code: "42703" })).toBe(false);
    expect(isMissingFunction({})).toBe(false);
    expect(isMissingFunction(null)).toBe(false);
  });
});

describe("isMissingColumn", () => {
  it("knows a column the project doesn't have yet", () => {
    expect(isMissingColumn({ code: "42703" })).toBe(true);
  });

  it("is not a missing function, a missing table, or any other error", () => {
    expect(isMissingColumn({ code: "PGRST202" })).toBe(false);
    expect(isMissingColumn({ code: "42883" })).toBe(false);
    expect(isMissingColumn({ code: "PGRST205" })).toBe(false);
    expect(isMissingColumn({ code: "42501" })).toBe(false);
    expect(isMissingColumn({})).toBe(false);
    expect(isMissingColumn(null)).toBe(false);
  });
});
