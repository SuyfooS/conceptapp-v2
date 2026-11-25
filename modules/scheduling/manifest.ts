import { FILL_WEEK_HOURS, FILL_WEEK_HOURS_MAX } from "@domain/fill-week";
import { defineManifest } from "@domain/modules";
import { positions, shiftPatterns } from "@domain/staffing";
import { z } from "zod";

/** Weekly schedule: availability, shifts, publishing (phase 2). */
export const manifest = defineManifest({
  key: "scheduling",
  requires: [],
  nav: { href: "/schedule", icon: "calendar", minRole: "worker", order: 10 },
  homeWidget: { minRole: "worker" },
  permissions: [
    // Building the week (its drafts, everyone's availability, saving, and
    // deciding swaps: Orel's answer 6), and publishing it, which needs
    // building it (a switch under edit, on by default: Orel, 15 November
    // 2026). The database asks both (private.builds_schedule and
    // private.publishes_schedule, the roles plan's R3), and owners and the
    // team switch them per role.
    {
      key: "schedule.edit",
      area: "scheduling",
      defaultRole: "manager",
      settable: true,
    },
    {
      key: "schedule.publish",
      area: "scheduling",
      defaultRole: "manager",
      requires: "schedule.edit",
      settable: true,
    },
  ],
  settings: z.object({
    /** Day the week starts on (0 = Sunday). */
    weekStartsOn: z
      .union([z.literal(0), z.literal(1)])
      .default(0)
      // Changing it moves every week, so published ones stop being found.
      .meta({ level: "team" }),
    /** Day and time workers submit availability for the next week by. */
    availabilityDueDay: z
      .int()
      .min(0)
      .max(6)
      .default(3)
      .meta({ editor: "weekday" }),
    availabilityDueTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .default("18:00")
      .meta({ editor: "time" }),
    /**
     * Closed from candle lighting on Friday until havdalah: availability
     * on Friday ends by candle lighting and on Saturday starts from
     * havdalah. Both templates close on Shabbat.
     */
    closedOnShabbat: z.boolean().default(true),
    /** The business's positions (waiter, cook…); the template fills them. */
    positions: positions.default([]).meta({ editor: "positions" }),
    /** Which shifts run on which days and how many people each needs. */
    shifts: shiftPatterns.default([]).meta({ editor: "shifts" }),
    /**
     * Most hours a week the fill from availability ("מילוי מהזמינות") gives
     * anyone, what is already on the screen counted: 42 is the regular week
     * (`WEEK_MINUTES`), up to 58 with the general permit's overtime
     * (`LIMITS.weekOvertime`). Placing people by hand has no cap. Owners
     * and managers set it on /manage/scheduling, the team in the console;
     * nothing in the database reads it, so `set_module_settings` needs no
     * branch for it.
     */
    fillWeekHours: z
      .int()
      .min(4)
      .max(FILL_WEEK_HOURS_MAX)
      .default(FILL_WEEK_HOURS)
      .meta({ level: "business" }),
  }),
});
