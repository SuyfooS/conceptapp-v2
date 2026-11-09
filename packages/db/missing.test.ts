import { describe, expect, it } from "vitest";
import { isMissingFunction } from "./missing";

describe("isMissingFunction", () => {
  it("knows a function the project doesn't have yet, from PostgREST or Postgres", () => {
    expect(isMissingFunction({ code: "PGRST202" })).toBe(true);
    expect(isMissingFunction({ code: "42883" })).toBe(true);
  });

  it("leaves every other error, and none, to the caller", () => {
    expect(isMissingFunction({ code: "42501" })).toBe(false);
    expect(isMissingFunction({ code: "55000" })).toBe(false);
    expect(isMissingFunction({})).toBe(false);
    expect(isMissingFunction(null)).toBe(false);
  });
});
