import { describe, expect, it } from "vitest";
import {
  ARRIVAL_MS,
  arrivalOf,
  type BusinessChoice,
} from "./business-switcher";

/*
 * A switch of business, heard (accessibility, part 1): once the screens are
 * drawn for the business a switch asked for, and only then, the page says
 * so. A switch refused (the page still in the other business) or asked for
 * too long ago says nothing.
 */

const business = (id: string, current: boolean): BusinessChoice => ({
  id,
  name: id === "shop" ? "The shop" : "The restaurant",
  accent: "#1d5fa8",
  role: "Accountant",
  unread: 0,
  current,
});

const inShop = [business("shop", true), business("restaurant", false)];
const inRestaurant = [business("shop", false), business("restaurant", true)];
const asked = { id: "restaurant", name: "The restaurant", at: 1_000 };

describe("arrivalOf", () => {
  it("is the business asked for, once the page is drawn for it", () => {
    expect(arrivalOf(asked, inRestaurant, 3_000)).toEqual(inRestaurant[1]);
  });

  it("is none while the page is still in another business, a refused switch", () => {
    expect(arrivalOf(asked, inShop, 3_000)).toBeNull();
  });

  it("is none for a switch asked for too long ago", () => {
    expect(arrivalOf(asked, inRestaurant, 1_000 + ARRIVAL_MS)).toEqual(
      inRestaurant[1],
    );
    expect(arrivalOf(asked, inRestaurant, 1_001 + ARRIVAL_MS)).toBeNull();
  });

  it("is none with nothing asked for", () => {
    expect(arrivalOf(null, inRestaurant, 3_000)).toBeNull();
  });
});
