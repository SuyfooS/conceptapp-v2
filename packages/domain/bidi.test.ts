import { describe, expect, it } from "vitest";
import { isolate, LRI, PDI } from "./bidi";

describe("isolate", () => {
  it("holds what it is given, as it is, between LRI and PDI", () => {
    expect([...LRI].map((c) => c.codePointAt(0))).toEqual([0x2066]);
    expect([...PDI].map((c) => c.codePointAt(0))).toEqual([0x2069]);
    expect(isolate("16:00–23:30")).toBe(`${LRI}16:00–23:30${PDI}`);
    expect(isolate("")).toBe(`${LRI}${PDI}`);
  });

  it("adds exactly two characters and changes nothing inside", () => {
    const words = "1.11 · 08:14";
    const held = isolate(words);
    expect(held).toHaveLength(words.length + 2);
    expect(held.slice(1, -1)).toBe(words);
  });
});
