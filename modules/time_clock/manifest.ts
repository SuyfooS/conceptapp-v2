import { timeOfDay } from "@domain/hours";
import { defineManifest } from "@domain/modules";
import { z } from "zod";

/** Clocking in and out, and the hours report (later phase). */
export const manifest = defineManifest({
  key: "time_clock",
  requires: [],
  nav: {
    href: "/clock",
    icon: "clock",
    minRole: "worker",
    order: 20,
    // An accountant's tab: everyone's hours for payroll (payroll P3).
    outsideStaff: { perm: "clock.payroll", href: "/clock/pay" },
  },
  homeWidget: { minRole: "worker" },
  permissions: [
    { key: "clock.edit", defaultRole: "manager" },
    /**
     * Everyone's hours, wages, payroll details and estimates (payroll P2). Owners
     * and accountants always hold it; an owner gives it to managers, workers or
     * one person, and managers start without it (Orel, 9 November 2026). Without
     * it a manager still sees and corrects hours, with no amounts.
     */
    { key: "clock.payroll", defaultRole: "owner", byOwner: true },
  ],
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
    /**
     * The business's work week, as its notice of terms says (payroll P6):
     * five or six days. Until it is set, each person's week is worked out as
     * five, as six and by each day's smaller norm, and the way that pays most
     * is used (`@domain/payroll`; payroll plan §9.4, §14). These pay rules are
     * for owners only: the database refuses them from a manager
     * (set_module_settings, 20261110000700_pay_rules.sql).
     */
    workWeek: z
      .enum(["unset", "five", "six"])
      .default("unset")
      .meta({ level: "owner" }),
    /**
     * The fixed short day of a five-day week (the 2018 extension order),
     * Sunday to Thursday. Ignored in a six-day week. A choice of five days,
     * not the weekday editor, which offers all seven.
     */
    shortDay: z
      .union([
        z.literal(0),
        z.literal(1),
        z.literal(2),
        z.literal(3),
        z.literal(4),
      ])
      .default(4)
      .meta({ level: "owner" }),
    /**
     * Where the weekly 36 hours of rest start: candle lighting on Friday, or
     * a fixed Friday time when the notice of terms names one (ע"ע 9623-02-18).
     */
    restStart: z
      .enum(["candleLighting", "fixed"])
      .default("candleLighting")
      .meta({ level: "owner" }),
    /** That fixed Friday time, when `restStart` is fixed. */
    restStartTime: timeOfDay
      .default("14:00")
      .meta({ editor: "time", level: "owner" }),
    /**
     * Workers see an estimate of their own month's pay on the clock (Orel, 9
     * November 2026). Only while `payEstimate` is on.
     */
    workersSeeEstimate: z.boolean().default(true).meta({ level: "owner" }),
    /**
     * Amounts in shekels worked out from the hours, for pay holders and
     * workers alike: off until an accountant confirms the engine's readings
     * for the business (Orel, 10 November 2026), on in the demo businesses.
     * Hours, rates, wages and the file work without it. For the ConceptApp
     * team only, here and in the database.
     */
    payEstimate: z.boolean().default(false).meta({ level: "team" }),
  }),
});
