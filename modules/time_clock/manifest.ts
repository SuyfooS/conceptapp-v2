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
     * Clocking in and out needs the code a manager shows on their phone
     * (/clock/code): its digits typed, and its QR scanned once that is built
     * (Orel, 8 November 2026; issue #78). Breaks never need it, owners never
     * do, and someone who can't clocks in "without a code" for a manager to
     * confirm. For owners only: the database refuses it from a manager
     * (set_module_settings). Stations at the business come later.
     */
    requirePunchCode: z.boolean().default(false).meta({ level: "owner" }),
    /**
     * Where the code is shown: a clock station left at the business, a
     * manager's phone, or both. The database refuses codes from the other.
     * Hidden until the station screens exist: with no station to pair,
     * "station only" would block everyone.
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
