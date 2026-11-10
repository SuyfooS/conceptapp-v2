import { describe, expect, it } from "vitest";
import {
  DEMO_BUSINESSES,
  DEMO_PEOPLE,
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
  it("offers every person in exactly one business", () => {
    const offered = DEMO_BUSINESSES.flatMap((b) => [...b.people]);
    expect(offered.sort()).toEqual([...DEMO_PEOPLE].sort());
  });

  it("finds each person's business", () => {
    expect(demoBusinessOf("manager").slug).toBe("demo-restaurant");
    expect(demoBusinessOf("shopWorker").slug).toBe("demo-shop");
    // In the shop alone, until a login may be in several businesses (P3b).
    expect(demoBusinessOf("accountant").slug).toBe("demo-shop");
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
