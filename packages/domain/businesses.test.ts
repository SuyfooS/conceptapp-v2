import { describe, expect, it } from "vitest";
import {
  BUSINESS_COOKIE,
  canSwitchBusiness,
  chosenMembership,
  DEPARTURE_SEEN_COOKIE,
  departureToTell,
  type MembershipChoice,
  switcherOrder,
} from "./businesses";

const shop: MembershipChoice = {
  businessId: "b-shop",
  role: "accountant",
  since: "2026-11-01T08:00:00Z",
};
const restaurant: MembershipChoice = {
  businessId: "b-restaurant",
  role: "accountant",
  since: "2026-11-05T08:00:00Z",
};
const bakery: MembershipChoice = {
  businessId: "b-bakery",
  role: "owner",
  since: "2026-11-09T08:00:00Z",
};

describe("chosenMembership", () => {
  it("opens the business the cookie names, when it is one of theirs", () => {
    expect(chosenMembership([shop, restaurant], "b-restaurant")).toBe(
      restaurant,
    );
    expect(chosenMembership([shop, restaurant, bakery], "b-shop")).toBe(shop);
  });

  it("never trusts a cookie for a business they aren't in", () => {
    expect(chosenMembership([shop, restaurant], "b-elsewhere")).toBe(shop);
    expect(chosenMembership([bakery], "b-shop")).toBe(bakery);
    expect(chosenMembership([shop, restaurant], "")).toBe(shop);
  });

  it("changes nothing for someone in one business", () => {
    for (const cookie of [null, undefined, "b-restaurant", "nonsense"]) {
      expect(chosenMembership([restaurant], cookie)).toBe(restaurant);
    }
  });

  it("without a choice, opens their place on a staff first", () => {
    expect(chosenMembership([shop, restaurant, bakery], null)).toBe(bakery);
  });

  it("then the business they joined first", () => {
    expect(chosenMembership([restaurant, shop], undefined)).toBe(shop);
    // The same moment: by the business's id, so it never flips between reads.
    const twin = { ...restaurant, since: shop.since };
    expect(chosenMembership([twin, shop], null)).toBe(twin);
  });

  it("is null for someone in no business", () => {
    expect(chosenMembership([], "b-shop")).toBeNull();
  });
});

describe("switcherOrder", () => {
  const names: Record<string, string> = {
    "b-shop": "חנות הדגמה",
    "b-restaurant": "מסעדת הדגמה",
    "b-bakery": "מאפיית הבוקר",
  };
  const of = (m: MembershipChoice) => ({
    role: m.role,
    name: names[m.businessId] ?? "",
  });

  it("lists their place on a staff first, then the rest by name", () => {
    expect(
      switcherOrder([restaurant, shop, bakery], of).map((m) => m.businessId),
    ).toEqual(["b-bakery", "b-shop", "b-restaurant"]);
  });

  it("keeps the same order whatever order they come in", () => {
    const once = switcherOrder([shop, restaurant], of);
    expect(switcherOrder([restaurant, shop], of)).toEqual(once);
  });
});

describe("canSwitchBusiness", () => {
  it("offers a switch only with more than one business", () => {
    expect(canSwitchBusiness(0)).toBe(false);
    expect(canSwitchBusiness(1)).toBe(false);
    expect(canSwitchBusiness(2)).toBe(true);
  });

  it("keeps its cookie under a name of its own", () => {
    expect(BUSINESS_COOKIE).toBe("ca_business");
  });
});

// Orel's decision 3 of 14 November 2026: whoever was taken off a team is told
// nothing then, and next time they open the app it says so.
describe("departureToTell", () => {
  // The latest first, as public.own_departures gives them.
  const cafe = { businessId: "b-cafe", leftAt: "2026-11-24T08:00:00+00:00" };
  const shop = { businessId: "b-shop", leftAt: "2026-11-20T08:00:00+00:00" };
  const both = [cafe, shop];

  it("tells someone with no business left the latest, every time", () => {
    expect(departureToTell(null, both, null)).toBe(cafe);
    expect(departureToTell(null, both, cafe.leftAt)).toBe(cafe);
    expect(departureToTell(null, [], null)).toBeNull();
  });

  it("tells someone with another business each departure once, the earliest first", () => {
    expect(departureToTell("b-other", both, null)).toBe(shop);
    expect(departureToTell("b-other", both, shop.leftAt)).toBe(cafe);
    expect(departureToTell("b-other", both, cafe.leftAt)).toBeNull();
    expect(departureToTell("b-other", both, "2026-11-22T00:00:00.000Z")).toBe(
      cafe,
    );
  });

  it("whichever business was open when it happened", () => {
    // Nothing here depends on the business cookie: a departure from a
    // business that wasn't open is told the same.
    expect(departureToTell("b-shop-staff", [cafe], null)).toBe(cafe);
  });

  it("treats a cookie that is no moment as nothing seen", () => {
    expect(departureToTell("b-other", both, "not-a-moment")).toBe(shop);
    expect(departureToTell("b-other", both, "")).toBe(shop);
  });

  it("tells nothing when they left nothing", () => {
    expect(departureToTell("b-other", [], null)).toBeNull();
  });

  it("keeps its cookie under a name of its own", () => {
    expect(DEPARTURE_SEEN_COOKIE).toBe("ca_departure_seen");
  });
});
