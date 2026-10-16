import { defineManifest } from "@domain/modules";
import { z } from "zod";

/** Reminders and alerts to staff. Works behind the other modules: no screen of its own. */
export const manifest = defineManifest({
  key: "notifications",
  requires: [],
  nav: null,
  homeWidget: null,
  permissions: [],
  settings: z.object({
    /** Remind a worker this many hours before a shift (0 = no reminder). */
    shiftReminderHours: z.int().min(0).max(24).default(2),
  }),
});
