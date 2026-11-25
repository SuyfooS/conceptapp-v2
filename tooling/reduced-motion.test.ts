import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("app/globals.css", "utf8");

/** The declarations inside the reduced-motion block, comments taken out. */
function reducedMotion(): Map<string, string> {
  const at = css.indexOf("@media (prefers-reduced-motion: reduce)");
  if (at < 0) throw new Error("No reduced-motion block in app/globals.css");
  const open = css.indexOf("{", css.indexOf("{", at) + 1);
  const close = css.indexOf("}", open);
  const body = css.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, "");
  return new Map(
    [...body.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)].map(
      (m) => [m[1], m[2]?.trim()] as [string, string],
    ),
  );
}

describe("reduced motion", () => {
  it("turns transitions off, so nothing shown is still hidden when focused", () => {
    // A very short transition is still one of visibility: an element shown in
    // the same drawing as the focus put on it refuses that focus for a frame.
    const rules = reducedMotion();
    expect(rules.get("transition-duration")).toBe("0s !important");
    expect(rules.get("transition-delay")).toBe("0s !important");
  });

  it("keeps animations ending, as Radix waits for animationend", () => {
    const rules = reducedMotion();
    expect(rules.get("animation-duration")).toBe("0.01ms !important");
    expect(rules.get("animation-iteration-count")).toBe("1 !important");
  });

  it("is the one block for every element and its pseudo-elements", () => {
    const at = css.indexOf("@media (prefers-reduced-motion: reduce)");
    const selector = css.slice(
      css.indexOf("{", at) + 1,
      css.indexOf("{", css.indexOf("{", at) + 1),
    );
    expect(selector.replace(/\s+/g, "")).toBe("*,*::before,*::after");
  });
});
