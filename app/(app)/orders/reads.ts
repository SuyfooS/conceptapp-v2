import type { OrderRead } from "@db/orders";
import type { Favourites } from "@domain/orders";
import { notFound } from "next/navigation";

/**
 * A screen's first read, as the server drew it: the answer, or null for a
 * taker off a shift (the screen says so and waits); not found while the
 * module is off, for anyone it isn't for, and before the migration.
 */
export function readOf<T>(read: OrderRead<T>): T | null {
  if (read === "closed" || read === "notYet") notFound();
  if (read === "same") return null;
  if (typeof read === "object" && read !== null && "off" in read) return null;
  return read as T;
}

/** The items ordered most lately, or none when they can't be read now. */
export function favouriteItems(
  read: Exclude<OrderRead<Favourites>, "same">,
): string[] {
  return typeof read === "object" && "items" in read ? read.items : [];
}
