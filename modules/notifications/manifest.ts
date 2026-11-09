import { defineManifest } from "@domain/modules";
import { z } from "zod";

/**
 * Notifications (Orel, 8 and 9 November 2026): what happened that a person
 * should know, in the app's inbox (/notifications, from the bell on Today).
 * On for every template and business; it has no tab, so it fits every tab
 * bar, and switching it off hides its lines. The database writes them from
 * the audit log; @domain/notifications says what each kind is. The phone,
 * each person's choices and the reminders come next.
 */
export const manifest = defineManifest({
  key: "notifications",
  requires: [],
  nav: null,
  homeWidget: null,
  permissions: [],
  // Nothing reads this yet: the reminders bring the first settings a screen
  // shows.
  settings: z.object({
    /** Remind a worker this many hours before a shift (0 = no reminder). */
    shiftReminderHours: z
      .int()
      .min(0)
      .max(24)
      .default(2)
      .meta({ hidden: true }),
  }),
});
