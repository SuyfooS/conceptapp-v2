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
    { key: "schedule.edit", defaultRole: "manager" },
    { key: "schedule.publish", defaultRole: "manager" },
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
  }),
});
