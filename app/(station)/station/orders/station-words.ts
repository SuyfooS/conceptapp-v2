"use client";

import type { StationWriteFailure } from "@domain/order-stations";
import {
  type FixWrite,
  failureWords,
  fixFailureWords,
  type OrdersT,
} from "@/app/(app)/orders/orders-parts";

/**
 * Why a station's write was refused, in the orders' words; a refusal the
 * page says itself (stopped meanwhile, no station, someone signed in) says
 * the screen is being checked, as the page is read again. A sold-out mark
 * refused for its item says so in an item's words (removed, or no longer
 * this screen's), never an order's.
 */
export function stationFailureWords(
  t: OrdersT,
  checking: string,
  failure: StationWriteFailure,
  what?: FixWrite,
): string {
  switch (failure) {
    case "notStation":
    case "stopped":
    case "signedIn":
    case "notOrders":
      return checking;
    case "itemGone":
      return t("station.failure.itemGone");
    case "notHere":
      return t("station.failure.notHere");
    default:
      return what
        ? fixFailureWords(t, failure, what)
        : failureWords(t, failure);
  }
}
