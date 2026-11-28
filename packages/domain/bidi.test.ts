import { describe, expect, it } from "vitest";
import { FSI, isolate, isolateName, LRI, PDI } from "./bidi";

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

// An invite's WhatsApp message names the business first (closing the pilot,
// PR 4): held so, a name in Latin letters leaves the Hebrew sentence right to
// left, and keeps its own order inside.
describe("isolateName", () => {
  it("holds a name between FSI and PDI, as it is", () => {
    expect([...FSI].map((c) => c.codePointAt(0))).toEqual([0x2068]);
    expect(isolateName("Bakery 12")).toBe(`${FSI}Bakery 12${PDI}`);
    expect(isolateName("קפה & בר #1")).toBe(`${FSI}קפה & בר #1${PDI}`);
    expect(isolateName("")).toBe(`${FSI}${PDI}`);
  });

  it("drops the isolates and pops a name holds, so its own stays whole", () => {
    expect(isolateName(`Caf\u00e9 ${PDI}noir${PDI}`)).toBe(
      `${FSI}Caf\u00e9 noir${PDI}`,
    );
    expect(isolateName(`${LRI}24/7\u2067${FSI}`)).toBe(`${FSI}24/7${PDI}`);
    // Other marks are the name's own, kept.
    expect(isolateName("\u200fשירן")).toBe(`${FSI}\u200fשירן${PDI}`);
  });
});
