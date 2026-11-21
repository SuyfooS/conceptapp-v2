import {
  isStationWriteFailure,
  type OrderStationRefusal,
  type StationWriteFailure,
} from "@domain/order-stations";
import { type DatabaseRefusal, orderFailureOf } from "./order-failures";

/*
 * Why the database refused a station of the orders
 * (supabase/migrations/20261124000100_order_taking_stations.sql, its errors
 * in the header), for the station's screen. Kept apart from
 * @db/order-stations, which is server only, so it is tested on its own.
 */

/**
 * The station's own refusals (42501): a secret that is no station's, a
 * station stopped, of another kind, or of a business with taking orders off.
 * Null for any other refusal.
 */
export function orderStationRefusalOf(
  error: DatabaseRefusal,
): OrderStationRefusal | null {
  if (error.code !== "42501") return null;
  switch (error.hint) {
    case "stopped":
      return "stopped";
    case "shows":
      return "notOrders";
    case "off":
      return "off";
    default:
      return /not a station/i.test(error.message) ? "notStation" : null;
  }
}

/**
 * Why a station's write was refused: the station's own refusals first, then
 * as any write to the orders (@db/order-failures), and "failed" for one a
 * station can't meet. `what` names the write in the server's log.
 */
export function orderStationFailureOf(
  error: DatabaseRefusal,
  what: string,
): StationWriteFailure {
  const refusal = orderStationRefusalOf(error);
  if (refusal) return refusal;
  const failure = orderFailureOf(error, what);
  return isStationWriteFailure(failure) ? failure : "failed";
}

/**
 * Why a kitchen's sold-out mark was refused (station_set_item_available),
 * in an item's words, not an order's: the station's own refusals first; an
 * item removed meanwhile, or none of the business's (55000 'archived', P0002
 * 'Unknown item'), is `itemGone`; one that no longer goes to the screen's
 * department (42501 with no hint) is `notHere`; anything else as any
 * station's write.
 */
export function orderStationItemFailureOf(
  error: DatabaseRefusal,
  what: string,
): StationWriteFailure {
  const refusal = orderStationRefusalOf(error);
  if (refusal) return refusal;
  if (
    error.code === "P0002" ||
    (error.code === "55000" && error.hint === "archived")
  ) {
    return "itemGone";
  }
  if (error.code === "42501" && !error.hint) return "notHere";
  return orderStationFailureOf(error, what);
}
