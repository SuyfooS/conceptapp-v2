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
     * Clocking in and out needs the code shown at the business: scanned, or
     * its digits typed (Orel, 8 November 2026; issue #78). Breaks never need
     * it, owners never do, and someone who can't scan clocks in "without a
     * code" for a manager to confirm. Hidden until the screens are built.
     */
    requirePunchCode: z.boolean().default(false).meta({ hidden: true }),
    /**
     * Where the code is shown: a clock station left at the business, a
     * manager's phone, or both. The database refuses codes from the other.
     */
    codeDisplay: z
      .enum(["station", "manager", "both"])
      .default("both")
      .meta({ hidden: true }),
    /**
     * A break comes off the hours: it is not counted as paid time. A break
     * keeps what this said when it began.
     */
    unpaidBreaks: z.boolean().default(false),
  }),
});
