import { defineManifest } from "@domain/modules";
import { z } from "zod";

/**
 * Lists (Orel, 8 and 9 November 2026, issue #1): checklists sent to a person,
 * a department, a shift or a role, once or by a template's times, checked off
 * and finished; and lists that pass between departments, such as an order
 * from the bar to the storeroom. Items are a check, a number, a note or a
 * photo (L6). Templates and departments come from the
 * business's template and are its own data; the database writes the lists and
 * tells people through notifications (supabase/migrations/
 * 20261109000600_lists.sql). Off in every template and business until its
 * screens arrive.
 */
export const manifest = defineManifest({
  key: "lists",
  requires: [],
  nav: { href: "/lists", icon: "list", minRole: "worker", order: 25 },
  homeWidget: { minRole: "worker" },
  permissions: [
    // Edit templates and their times, read every list, reopen and cancel any.
    // private.can_manage_lists holds the same default.
    { key: "lists.manage", defaultRole: "manager" },
    // Send any list to anyone. A department's own orders need neither.
    // private.can_send_lists holds the same default.
    { key: "lists.send", defaultRole: "manager" },
  ],
  settings: z.object({
    /** Remind the people a list is for this long before it is due (0: no reminder). */
    remindBeforeMinutes: z
      .union([z.literal(0), z.literal(15), z.literal(30), z.literal(60)])
      .default(30),
    /** A list counts as late this long after its due time. */
    lateAfterMinutes: z
      .union([z.literal(0), z.literal(15), z.literal(30), z.literal(60)])
      .default(15),
    /** Owners, managers and holders of lists.manage hear when a list is late. */
    tellManagersWhenLate: z.boolean().default(true),
    /** Whoever sent a list, and the department that asked for it, hear when it's finished. */
    tellWhenFinished: z.boolean().default(true),
    /**
     * How many days a list's photos are kept, from when each was taken (L6;
     * Orel's default on #1: 90). Then the app's daily clean-up removes the
     * file and the item says so; it stays done. For the ConceptApp team only,
     * since storage is what could cost: nothing may be spent without Orel.
     * The app holds it to that (`level: "team"`, checked by
     * checkSettingsChange, as weekStartsOn and roundToMinutes are);
     * set_module_settings has no lists branch and doesn't check it, and
     * public.expired_list_photos counts only 30, 90, 180 or 365, anything
     * else as 90. private.list_settings holds the same default.
     */
    photoDays: z
      .union([z.literal(30), z.literal(90), z.literal(180), z.literal(365)])
      .default(90)
      .meta({ level: "team" }),
  }),
});
