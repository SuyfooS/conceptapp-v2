import { getOrderMode } from "@db/orders";
import { isStaff } from "@domain/modules";
import {
  type OrderModeItem,
  orderModeEntry,
  orderModeItems,
} from "@domain/order-screens";
import type { OrderMode } from "@domain/orders";
import { cache } from "react";
import { currentMember } from "../member";
import { currentModules } from "../modules";

/** Where the signed-in person stands in waiter mode, and which items they get. */
export type OrderModeReach = {
  mode: OrderMode;
  items: OrderModeItem[];
  /** Where its ways in lead. */
  entry: OrderModeItem;
};

/**
 * Waiter mode for the signed-in person, once per request (P4): the frame's
 * items, Home's card and the clock's and the profile's rows all read it.
 * Null while the module is off, for someone off the staff (an accountant,
 * or the team viewing as one), for someone the mode gives no item, before
 * the migration reaches the project, and when the read fails (logged by its
 * code, as the lists' count is): no screen of the app goes down with it.
 */
export const currentOrderMode = cache(
  async (): Promise<OrderModeReach | null> => {
    const [member, enabled] = await Promise.all([
      currentMember(),
      currentModules(),
    ]);
    const membership = member?.membership;
    if (!membership || !enabled.includes("order_taking")) return null;
    if (!isStaff(membership.role)) return null;
    try {
      const mode = await getOrderMode(membership.business.id);
      if (!mode || mode === "notYet") return null;
      const items = orderModeItems(mode);
      if (items.length === 0) return null;
      return { mode, items, entry: orderModeEntry(mode) };
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code: unknown }).code)
          : "without a code";
      console.error("reading the mode failed", code);
      return null;
    }
  },
);
