import { describe, expect, it } from "vitest";
import { isAppPath } from "./app-path";

describe("isAppPath", () => {
  it("takes a path inside the app", () => {
    expect(isAppPath("/schedule/shifts")).toBe(true);
    expect(isAppPath("/clock/team?month=2026-11")).toBe(true);
  });

  it("refuses anything that could leave it", () => {
    for (const url of [
      "//evil.example",
      "https://evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "schedule",
      "/\tschedule",
      "",
      null,
      42,
    ]) {
      expect(isAppPath(url), String(url)).toBe(false);
    }
  });
});
