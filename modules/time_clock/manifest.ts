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
    /** Punches are rounded to this many minutes in reports (0 = exact). */
    roundToMinutes: z
      .union([z.literal(0), z.literal(5), z.literal(15)])
      .default(0),
    /**
     * Clocking in and out needs the QR code shown on a manager's device at
     * the business, so nobody punches from home.
     */
    requirePunchCode: z.boolean().default(false),
    /**
     * A break comes off the hours: it is not counted as paid time. A break
     * keeps what this said when it began.
     */
    unpaidBreaks: z.boolean().default(false),
  }),
});
