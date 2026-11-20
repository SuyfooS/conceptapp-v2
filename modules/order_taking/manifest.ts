import { departmentKey, MAX_DEPARTMENTS } from "@domain/departments";
import { timeOfDay } from "@domain/hours";
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
 * the console's import and places. P3 is the orders, in the database alone
 * (20261120000200_order_taking_takers.sql to
 * 20261120000400_order_taking_orders_demo.sql, @domain/orders): who takes
 * orders and when (Orel's decisions 3 and 4 of 20 November 2026), the send
 * split by department with its prices frozen, taking back and cancelling
 * (decision 5), and no total anywhere (decision 7). Off in every template and
 * business, and on for the local seed's demo restaurant, which has a sample
 * menu and three orders waiting. No tab: the shell's bar is full, and the mode
 * draws its own items later (P4); its own icon for its rows meanwhile.
 */
export const manifest = defineManifest({
  key: "order_taking",
  requires: [],
  nav: null,
  icon: "pad",
  homeWidget: null,
  // Running the menu: its categories, items, prices and choices, the places,
  // the import, and "sold out" for any item (private.runs_orders). With P3 it
  // also takes orders from any department, cancels a line that is ready,
  // gives one on the house and cancels a whole order. View is the floor:
  // every staff member reads the menu, takes orders from a department that
  // takes them, and marks sold out and ready what their own department
  // prepares. Owners and the team switch it per role.
  permissions: [
    {
      key: "order_taking.edit",
      area: "order_taking",
      defaultRole: "manager",
      settable: true,
    },
  ],
  // The SQL readers (private.order_taking_settings and those after it, in
  // supabase/migrations/20261120000200_order_taking_takers.sql) hold the same
  // defaults, and read a value not offered here as its default, field by
  // field (modules/order_taking/settings.db.test.ts).
  settings: z.object({
    /**
     * Who takes orders (decision 3): those on the staff in these departments,
     * besides those who hold order_taking.edit and owners. The templates name
     * them (the restaurant's floor and bar, the café's coffee bar and bar).
     * An owner's and the team's (`level: "owner"`, which set_module_settings
     * enforces), and on no screen until P4 draws an editor of departments.
     */
    takerDepartments: z
      .array(departmentKey)
      .max(MAX_DEPARTMENTS)
      .refine((keys) => new Set(keys).size === keys.length, "Each once")
      .default([])
      .meta({ level: "owner", hidden: true }),
    /**
     * Orders are taken only during a shift (decision 4), while the time clock
     * is on: from clocking in until 30 minutes after clocking out, and never
     * on a shift left open more than 16 hours. Owners always.
     */
    onlyOnTheClock: z.boolean().default(true).meta({ level: "owner" }),
    /**
     * How long the sender takes a line back after sending it (decision 5),
     * before anyone prepared it; after that it is cancelled with a reason.
     */
    takeBackMinutes: z
      .union([z.literal(0), z.literal(2), z.literal(5)])
      .default(2)
      .meta({ level: "owner" }),
    /** A ticket not ready this long after it was sent reads as waiting. */
    lateAfterMinutes: z
      .union([z.literal(10), z.literal(15), z.literal(20), z.literal(30)])
      .default(15),
    /**
     * When the business's day ends, after midnight: takeaway numbers start
     * again, and "today" turns, at this time.
     */
    dayEndsAt: timeOfDay.default("05:00").meta({ editor: "time" }),
  }),
});
