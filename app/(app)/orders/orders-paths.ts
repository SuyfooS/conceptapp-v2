import type { OrdersPaths } from "./orders-types";

/** Where the mode's screens lead in the app (waiter mode P4, the till since P5). */
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
  till: (order) => `/orders/till/${order}`,
};

/** A draft's screen in the app, by its key (`draftKey`): a place, a takeaway, or a new one. */
export function draftPath(draft: string): string {
  if (draft.startsWith("place:")) {
    return appOrdersPaths.place(draft.slice("place:".length));
  }
  const takeaway = draft.startsWith("takeaway:")
    ? draft.slice("takeaway:".length)
    : "new";
  return appOrdersPaths.takeaway(takeaway === "new" ? null : takeaway);
}
