import { describe, expect, it } from "vitest";
import * as door from "./passive-sign-in";
import {
  DEMO_BUSINESSES,
  DEMO_PEOPLE,
  demoBusinessesOf,
  demoBusinessOf,
  demoEmailOf,
  doorPath,
  isDemoBusiness,
  phoneSignInPath,
  renewsDemoWeek,
  signInPath,
} from "./passive-sign-in";

describe("the door's addresses", () => {
  // The demo door per site (Orel, 22 November 2026): the same address on
  // both, and the proxy's one hop to whichever door this site has.
  it("keeps /enter as the door on every site", () => {
    expect(signInPath).toBe("/enter");
    expect(phoneSignInPath).toBe("/sign-in");
  });

  it("sends a signed-out person to the demo's door only where it is open", () => {
    expect(doorPath(true)).toBe("/enter");
    expect(doorPath(false)).toBe("/sign-in");
  });

  it("has no constant left that closes the door in code", () => {
    // The setting is DEMO_DOOR, read in @db/env alone.
    expect(Object.keys(door)).not.toContain("PASSIVE_SIGN_IN");
  });
});

describe("demoEmailOf", () => {
  it("knows the people on offer, at an address that can't receive mail", () => {
    for (const person of DEMO_PEOPLE) {
      expect(demoEmailOf(person)).toMatch(/@demo\.conceptapp\.invalid$/);
    }
    expect(new Set(DEMO_PEOPLE.map(demoEmailOf)).size).toBe(DEMO_PEOPLE.length);
  });

  it("keeps the addresses the demo data already has", () => {
    expect(demoEmailOf("owner")).toBe("owner@demo.conceptapp.invalid");
    expect(demoEmailOf("manager")).toBe("manager@demo.conceptapp.invalid");
    expect(demoEmailOf("worker")).toBe("worker@demo.conceptapp.invalid");
    expect(demoEmailOf("shopOwner")).toBe("shop-owner@demo.conceptapp.invalid");
    expect(demoEmailOf("accountant")).toBe(
      "accountant@demo.conceptapp.invalid",
    );
  });

  it("refuses anyone else a client asks for", () => {
    for (const person of [
      "platform_admin",
      "owner@demo.conceptapp.invalid",
      "shop-owner",
      "worker2",
      "",
      null,
      undefined,
      {},
    ]) {
      expect(demoEmailOf(person)).toBeNull();
    }
  });
});

describe("demo businesses", () => {
  it("offers every staff person in exactly one business, the accountant in both", () => {
    for (const person of DEMO_PEOPLE) {
      const offeredIn = DEMO_BUSINESSES.filter((b) =>
        (b.people as readonly string[]).includes(person),
      ).map((b) => b.key);
      expect(offeredIn.length, person).toBe(person === "accountant" ? 2 : 1);
    }
    expect(
      DEMO_BUSINESSES.flatMap((b) => [...b.people])
        .filter((person) => person !== "accountant")
        .sort(),
    ).toEqual(DEMO_PEOPLE.filter((person) => person !== "accountant").sort());
    expect(demoBusinessesOf("accountant").map((b) => b.slug)).toEqual([
      "demo-restaurant",
      "demo-shop",
    ]);
  });

  it("finds each person's business", () => {
    expect(demoBusinessOf("manager").slug).toBe("demo-restaurant");
    expect(demoBusinessOf("shopWorker").slug).toBe("demo-shop");
    // The accountant comes in where the door offered her (payroll P3b).
    expect(demoBusinessOf("accountant", "shop").slug).toBe("demo-shop");
    expect(demoBusinessOf("accountant", "restaurant").slug).toBe(
      "demo-restaurant",
    );
  });

  it("never opens a business a person isn't in, whatever a client sends", () => {
    expect(demoBusinessOf("shopWorker", "restaurant").slug).toBe("demo-shop");
    expect(demoBusinessOf("worker", "shop").slug).toBe("demo-restaurant");
    for (const key of ["", "cafe", null, undefined, {}]) {
      expect(demoBusinessOf("accountant", key).slug).toBe("demo-restaurant");
    }
  });

  it("renews only the shop's schedule", () => {
    expect(DEMO_BUSINESSES.filter((b) => b.renews).map((b) => b.key)).toEqual([
      "shop",
    ]);
    expect(renewsDemoWeek("demo-shop")).toBe(true);
    for (const slug of ["demo-restaurant", "cafe-noa", "", null, undefined]) {
      expect(renewsDemoWeek(slug)).toBe(false);
    }
  });

  it("knows both demo businesses, and nothing else, as a demo", () => {
    expect(isDemoBusiness("demo-restaurant")).toBe(true);
    expect(isDemoBusiness("demo-shop")).toBe(true);
    for (const slug of ["cafe-noa", "demo", "", null, undefined]) {
      expect(isDemoBusiness(slug)).toBe(false);
    }
  });
});
