"use client";

import type { Menu, OrderPlace } from "@domain/order-taking";
import type {
  MyOrders,
  OrderDetail,
  OrderFloor,
  OrderPrep,
} from "@domain/orders";
import { FloorView } from "./floor-view";
import { MineView } from "./mine-view";
import { OrderView, type OrderWhere } from "./order-view";
import { useOrdersRead } from "./orders-provider";
import { PrepView } from "./prep-view";

/*
 * The mode's screens in the app (waiter mode P4): each takes what the server
 * drew it with and what the mode's sync heard since, whichever is newer
 * (`useOrdersRead`), and draws the view the twins draw too.
 */

export function FloorScreen({
  floor,
  menu,
}: {
  floor: OrderFloor | null;
  menu: Menu | null;
}) {
  const read = useOrdersRead({ floor, menu }, { floor: true });
  return <FloorView floor={read.floor} places={read.menu?.places ?? []} />;
}

/** Only an open order is added to; one closed since reads as none. */
const openOnly = (order: OrderDetail | null | undefined) =>
  order === undefined ? undefined : order?.status === "open" ? order : null;

export function OrderScreen({
  place,
  takeaway,
  order,
  menu,
  favourites,
  floor,
}: {
  /** The place, or null for a takeaway. */
  place: OrderPlace | null;
  /** The takeaway's order, or null for a new one; unused for a place. */
  takeaway: string | null;
  /** Its open order as the server read it, if it has one. */
  order: OrderDetail | null;
  menu: Menu | null;
  favourites: string[];
  floor: OrderFloor | null;
}) {
  // A place's order is the one the floor has open there now: it opens, closes
  // and moves while the screen is on.
  const held = useOrdersRead({ floor, menu }, { floor: true });
  const id = place
    ? (held.floor?.orders.find((o) => o.place === place.id)?.id ?? null)
    : takeaway;
  const read = useOrdersRead(
    { order: id ? { id, detail: order?.id === id ? order : undefined } : null },
    {},
  );
  const where: OrderWhere = place
    ? { kind: "place", place }
    : { kind: "takeaway", order: takeaway };
  // Undefined while an order just opened is read for the first time.
  const detail = id ? openOnly(read.order) : null;
  return (
    <OrderView
      where={where}
      order={detail}
      menu={held.menu}
      favourites={favourites}
      floor={held.floor}
    />
  );
}

export function MineScreen({ mine }: { mine: MyOrders | null }) {
  const read = useOrdersRead({ mine });
  return <MineView mine={read.mine} />;
}

export function PrepScreen({ prep }: { prep: OrderPrep | null }) {
  const read = useOrdersRead({ prep }, { prep: true });
  return <PrepView prep={read.prep} />;
}
