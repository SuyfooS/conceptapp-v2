import { defineManifest } from "@domain/modules";
import { z } from "zod";

/**
 * Notifications (Orel, 8 and 9 November 2026): what happened that a person
 * should know, in the app's inbox (/notifications, from the bell on Today)
 * and on the phone. On for every template and business; it has no tab, so it
 * fits every tab bar, and switching it off hides its lines. The database
 * writes them from the audit log, and the reminders once a minute
 * (`private.run_reminders`, supabase/migrations/20261112000200_reminders.sql);
 * @domain/notifications says what each kind is. Each person's own choices
 * (groups, quiet hours) are theirs, not the business's: they live in
 * `notification_preferences`, never here.
 */
export const manifest = defineManifest({
  key: "notifications",
  requires: [],
  nav: null,
  homeWidget: null,
  permissions: [],
  // The database reads the two reminder settings itself, each with this
  // default when nothing or a value not offered here is stored
  // (`private.reminder_settings`; ./reminders.db.test.ts keeps the two the
  // same). /manage/notifications draws them.
  settings: z.object({
    /** Remind a worker this many hours before a shift (0 = no reminder). */
    shiftReminderHours: z
      .int()
      .min(0)
      .max(24)
      .default(2)
      .meta({ hidden: true }),
    /**
     * Remind the workers and managers who haven't sent next week's
     * availability this many hours before it is due, and tell owners and
     * managers how many still haven't when it is due (0 = neither).
     */
    availabilityReminderHours: z
      .union([
        z.literal(0),
        z.literal(3),
        z.literal(12),
        z.literal(24),
        z.literal(48),
      ])
      .default(24),
    /**
     * Remind someone still clocked in this many minutes after their shift
     * ended, or 12 hours after clocking in with no shift (0 = no reminder).
     * An entry open longer than 24 hours is told to owners and managers
     * whatever this says.
     */
    clockOutReminderMinutes: z
      .union([z.literal(0), z.literal(30), z.literal(60), z.literal(120)])
      .default(60),
  }),
});
