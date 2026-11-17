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
    // Running the lists: templates and their times, every list, and filling,
    // reopening, cancelling and fixing any of them at any time; and, a
    // switch under it on by default, sending any list to anyone (Orel, 15
    // November 2026). Everyone on the staff fills the lists sent to them or
    // their department without either (view is the floor), and a
    // department's own orders need neither. The database asks both
    // (private.can_manage_lists and private.can_send_lists, the roles plan's
    // R5), and owners and the team switch them per role.
    {
      key: "lists.manage",
      area: "lists",
      defaultRole: "manager",
      settable: true,
    },
    {
      key: "lists.send",
      area: "lists",
      defaultRole: "manager",
      requires: "lists.manage",
      settable: true,
    },
    // Fixing a closed list (L6b-2; Orel, 16 November 2026), the first switch
    // that works at view: someone who doesn't edit the lists fixes one that
    // reaches them, until `fixHours` after it closed. It stays closed, and
    // every change keeps who made it and when. It requires nothing, since
    // edit holds it through the roles screen (granted with a raise to
    // edit), not through the chain. Managers by default; workers and a named role
    // on them start without it. The database asks it in private.can_fix_list
    // (supabase/migrations/20261116000400_lists_fix_switch.sql).
    {
      key: "lists.fix",
      area: "lists",
      defaultRole: "manager",
      settable: true,
    },
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
    /** Those who run the lists (lists.manage: owners, and managers by default) hear when a list is late. */
    tellManagersWhenLate: z.boolean().default(true),
    /**
     * A list of a template's times still open this long after it became late:
     * the owners are told, one line each, but an owner it is for (Orel, 15
     * November 2026, issue #1; 0: never). The minute job reads it
     * (private.lists_tick_business in supabase/migrations/
     * 20261115000500_lists_owners_late.sql), only as a value offered here and
     * anything else stored as 60; private.list_settings holds the same
     * default. Owners and managers choose it on /manage/lists.
     */
    tellOwnersAfterMinutes: z
      .union([z.literal(0), z.literal(30), z.literal(60), z.literal(120)])
      .default(60)
      .meta({ level: "business" }),
    /** Whoever sent a list, and the department that asked for it, hear when it's finished. */
    tellWhenFinished: z.boolean().default(true),
    /**
     * How many hours after a list closed someone given lists.fix ('תיקון
     * רשימות שנסגרו') may still fix it (L6b-2; Orel's default on Q2: a
     * day). Those who run the lists (lists.manage) fix at any time. Owners
     * and the team choose it, as the punch code (`level: "owner"`).
     * private.list_fix_hours (supabase/migrations/
     * 20261116000400_lists_fix_switch.sql) reads only a value offered here,
     * anything else stored as 24; private.list_settings holds the same
     * default.
     */
    fixHours: z
      .union([z.literal(2), z.literal(12), z.literal(24), z.literal(72)])
      .default(24)
      .meta({ level: "owner" }),
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
