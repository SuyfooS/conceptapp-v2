import type { OrdersPaths } from "./orders-types";

/** Where the mode's screens lead in the app (waiter mode P4). */
export const appOrdersPaths: OrdersPaths = {
  floor: "/orders",
  mine: "/orders/mine",
  prep: "/orders/prep",
  menu: "/orders/menu",
  place: (id) => `/orders/place/${id}`,
  takeaway: (order) =>
    order ? `/orders/takeaway/${order}` : "/orders/takeaway",
  clock: "/clock",
  leave: "/home",
  menuPlaces: "/orders/menu/places",
  menuImport: "/orders/menu/import",
};
