import { describe, expect, it } from "vitest";
import {
  DEMO_BUSINESSES,
  DEMO_PEOPLE,
  demoBusinessesOf,
  demoBusinessOf,
  demoEmailOf,
  renewsDemoWeek,
} from "./passive-sign-in";

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
});
