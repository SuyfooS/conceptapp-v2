import { defineManifest } from "@domain/modules";
import { z } from "zod";

/** Clocking in and out, and the hours report (later phase). */
export const manifest = defineManifest({
  key: "time_clock",
  requires: [],
  nav: { href: "/clock", icon: "clock", minRole: "worker", order: 20 },
  homeWidget: { minRole: "worker" },
  permissions: [{ key: "clock.edit", defaultRole: "manager" }],
  settings: z.object({
    /**
     * Each shift's hours are rounded to this many minutes (0 = exact), in every
     * month shown, past ones too. The times of day stay as they were punched.
     */
    roundToMinutes: z
      .union([z.literal(0), z.literal(5), z.literal(15)])
      .default(0)
      .meta({ level: "team" }),
    /**
     * Clocking in and out needs the QR code shown on a manager's device at
     * the business, so nobody punches from home. No screen offers it: Orel
     * decided on 6 November 2026 that the phone is enough.
     */
    requirePunchCode: z.boolean().default(false).meta({ hidden: true }),
    /**
     * A break comes off the hours: it is not counted as paid time. A break
     * keeps what this said when it began.
     */
    unpaidBreaks: z.boolean().default(false),
  }),
});
