import { describe, expect, it } from "vitest";
import { DEMO_PEOPLE, demoEmailOf } from "./passive-sign-in";

describe("demoEmailOf", () => {
  it("knows the people on offer, at an address that can't receive mail", () => {
    for (const person of DEMO_PEOPLE) {
      expect(demoEmailOf(person)).toMatch(/@demo\.conceptapp\.invalid$/);
    }
    expect(new Set(DEMO_PEOPLE.map(demoEmailOf)).size).toBe(DEMO_PEOPLE.length);
  });

  it("refuses anyone else a client asks for", () => {
    for (const person of [
      "platform_admin",
      "owner@demo.conceptapp.invalid",
      "",
      null,
      undefined,
      {},
    ]) {
      expect(demoEmailOf(person)).toBeNull();
    }
  });
});
