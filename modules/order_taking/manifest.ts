import { defineManifest } from "@domain/modules";
import { z } from "zod";

/**
 * Taking orders (waiter mode, Orel, 17 November 2026, issue #191): the people
 * a business chooses take orders on their phones and send each item to the
 * department that prepares it. The key is internal; its name is one string
 * (`modules.order_taking.name`), "קבלת הזמנות" until Orel names it.
 *
 * P1 is the menu and the places in the database alone
 * (supabase/migrations/20261117000500_order_taking_menu.sql): categories that
 * each route to a department, items with VAT-inclusive prices in agorot and
 * their choices (@domain/order-taking), "sold out", and the places. Off in
 * every template and business, so nothing reads it until a later phase
 * switches it on; the demo restaurant has a sample menu waiting. No tab: the
 * shell's bar is full, and the mode draws its own items later.
 */
export const manifest = defineManifest({
  key: "order_taking",
  requires: [],
  nav: null,
  homeWidget: null,
  // Running the menu: its categories, items, prices and choices, the places,
  // the import, and "sold out" for any item (private.runs_orders). View is
  // the floor: every staff member reads the menu, and marks sold out what
  // their own department prepares. Owners and the team switch it per role.
  permissions: [
    {
      key: "order_taking.edit",
      area: "order_taking",
      defaultRole: "manager",
      settable: true,
    },
  ],
  // Its settings (who takes orders, the clock rule) come with orders (P3).
  settings: z.object({}),
});
