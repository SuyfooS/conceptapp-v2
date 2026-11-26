import { describe, expect, it } from "vitest";
import { isolate, LRI, PDI } from "./bidi";

describe("isolate", () => {
  it("holds what it is given, as it is, between LRI and PDI", () => {
    expect(LRI).toBe("⁦");
    expect(PDI).toBe("⁩");
    expect(isolate("16:00–23:30")).toBe("⁦16:00–23:30⁩");
    expect(isolate("")).toBe("⁦⁩");
  });

  it("adds exactly two characters and changes nothing inside", () => {
    const words = "1.11 · 08:14";
    const held = isolate(words);
    expect(held).toHaveLength(words.length + 2);
    expect(held.slice(1, -1)).toBe(words);
  });
});
