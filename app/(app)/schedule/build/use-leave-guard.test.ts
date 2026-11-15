import { describe, expect, it } from "vitest";
import { leavesScreen } from "./use-leave-guard";

const at = (path: string) => new URL(path, "https://app.example");

describe("leavesScreen", () => {
  it("is another page", () => {
    expect(leavesScreen(at("/home"), at("/schedule/build"))).toBe(true);
    expect(
      leavesScreen(at("/schedule?week=2026-11-15"), at("/schedule/build")),
    ).toBe(true);
  });

  it("is the builder's other week", () => {
    const next = at("/schedule/build");
    const running = at("/schedule/build?week=2026-11-15");
    expect(leavesScreen(running, next)).toBe(true);
    expect(leavesScreen(next, running)).toBe(true);
    expect(leavesScreen(at("/schedule/build?week=2026-11-22"), running)).toBe(
      true,
    );
  });

  it("is not the same page and week", () => {
    const running = at("/schedule/build?week=2026-11-15");
    expect(leavesScreen(at("/schedule/build?week=2026-11-15"), running)).toBe(
      false,
    );
    expect(
      leavesScreen(at("/schedule/build?week=2026-11-15#day"), running),
    ).toBe(false);
    expect(leavesScreen(at("/schedule/build?x=1"), at("/schedule/build"))).toBe(
      false,
    );
  });

  it("leaves another site to the browser", () => {
    expect(
      leavesScreen(new URL("https://elsewhere.example/"), at("/schedule")),
    ).toBe(false);
  });
});
