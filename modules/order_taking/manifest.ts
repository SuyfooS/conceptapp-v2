import { defineManifest } from "@domain/modules";
import { z } from "zod";

/**
 * Taking orders (waiter mode, Orel, 17 November 2026, issue #191): the people
 * a business chooses take orders on their phones and send each item to the
 * department that prepares it. The key is internal; its name is one string
 * (`modules.order_taking.name`): "קבלת הזמנות", and "מצב מלצרות" in the
 * restaurant's and the café's templates (their wording; Orel, 20 November
 * 2026).
 *
 * P1 is the menu and the places in the database
 * (supabase/migrations/20261117000500_order_taking_menu.sql): categories that
 * each route to a department, items with VAT-inclusive prices in agorot and
 * their choices (@domain/order-taking), "sold out", and the places. P2 puts
 * them on screen: /orders/menu, from the management page's row "התפריט", and
 * the console's import and places. Off in every template and business, and on
 * for the local seed's demo restaurant. No tab: the shell's bar is full, and
 * the mode draws its own items later (P4); its own icon for its rows
 * meanwhile.
 */
export const manifest = defineManifest({
  key: "order_taking",
  requires: [],
  nav: null,
  icon: "pad",
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
