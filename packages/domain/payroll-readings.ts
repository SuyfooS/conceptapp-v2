/**
 * The readings of the law the payroll engine takes that an accountant or a
 * lawyer must confirm before a business pays from it (payroll plan §14). The
 * statute names some of these and leaves the rest to case law or practice;
 * where the app has to choose, it chooses here, once. The engine
 * (`payroll.ts`), the calendar (`payroll-calendar.ts`) and holiday pay
 * (`holiday-pay.ts`) read each one from this object, so a correction is one
 * change, and the test vectors of §13 say what it changes.
 *
 * Nothing else in the engine is a reading: the rates, the 42-hour week, the
 * norms and the limits are the statute's (payroll plan §2).
 */
export type PayrollReadings = {
  /**
   * §14, accountant 1 (C25): minutes in a rest window count toward the weekly
   * 42 hours, and those past it are paid 175% (the first two hours of the
   * week's overtime) and 200%. The statute names neither rate; they come from
   * the case law (ע"ע 38313-03-18). The other reading leaves rest minutes out
   * of the 42, at 150%. Either way every such minute is flagged
   * `restWeekOvertime` until an accountant confirms (Orel, 9 November 2026).
   */
  readonly restCountsTowardWeek: boolean;
  /**
   * §14, accountant 1 (C28): a paid holiday or one-off rest day the person
   * didn't work counts toward the weekly 42 at its average daily minutes, at
   * the start of its day (paid absence days count as days worked, ע"ע 188/06),
   * when it has an average. The other reading, `"norm"`, counts the day's
   * norm instead, by the way its week is worked out, average or not.
   */
  readonly paidAbsenceCountsAt: "average" | "norm";
  /**
   * §14, accountant 3 (C19s): the week of the 42 hours runs Sunday to Saturday
   * for everyone (ע"ע 188/06), also for someone who rests on Friday or Sunday,
   * whose rest crosses the week's edge. Each minute stays in its workday's week.
   */
  readonly weekStartsOn: 0;
  /**
   * §14, accountant 4: in a five-day week, the eve of a holiday the person
   * doesn't work and the day before their rest day are 7-hour days too, as in
   * a six-day week.
   */
  readonly fiveDayEve: boolean;
  /**
   * §14, accountant 4 and lawyer 2 (C17b): a shift that clocked in before a
   * holiday began (before candle lighting on its eve; for Rosh Hashana's
   * second day, before the first began) works the holiday only by its paid
   * minutes on the holiday's own date. So the eve's shift that runs 40 minutes
   * past candle lighting keeps the 7-hour eve and the holiday-pay line, while a
   * shift that starts in the holiday's evening, or a night shift from the eve
   * into the day, works the holiday. Either way the minutes in the window are
   * paid at the rest rates. The other reading, `false`, counts every paid
   * minute in the window (plan §9.4 step 3 as written), so those 40 minutes
   * forfeit both.
   */
  readonly eveShiftFromHolidayDate: boolean;
  /**
   * §14, accountant 5 (C26b): two entries on one date this far apart or more
   * (a morning and a night shift) are still one workday, flagged
   * `doubleShift` for the accountant to decide.
   */
  readonly doubleShiftGapMinutes: number;
  /**
   * §14, accountant 6 (C10s): a night shift has at least this many paid
   * minutes between 22:00 and 06:00 local time, counted on instants, so a
   * night the clocks go forward has an hour less (s.1).
   */
  readonly nightShiftMinutes: number;
  /**
   * §14, accountant 7: holiday pay and one-off rest-day pay average the paid
   * minutes of this many calendar months before the month (3 or 12; no
   * binding ruling).
   */
  readonly averageMonths: number;
  /**
   * §14, accountant 7: someone "would have worked" a weekday when they worked
   * it in at least this share of the weeks they worked in the history.
   */
  readonly wouldHaveWorkedShare: number;
  /** Holiday pay is owed from this many months with the employer (Kol Zchut, דמי חגים). */
  readonly holidayPayAfterMonths: number;
  /**
   * §14, lawyer 1: the weekly rest is this many hours from its start (candle
   * lighting on Friday, or the business's fixed Friday time), and at least
   * until havdalah (ע"ע 9623-02-18 fixes no start; the cap is this reading).
   */
  readonly weeklyRestHours: number;
  /**
   * §14, lawyer 1: the rest of someone who rests on Friday runs Thursday 18:00
   * to Saturday 06:00, and of someone who rests on Sunday, Saturday 18:00 to
   * Monday 06:00, local time.
   */
  readonly otherRestDay: { readonly from: string; readonly to: string };
  /**
   * §14, lawyer 1, its third point: the Jewish holidays' windows, the eves
   * before them and holiday pay apply to everyone, also to someone resting on
   * Friday or Sunday, who may keep holidays of their own (Law and
   * Administration Ordinance s.18א(ב)); their minutes are flagged
   * `restDayHolidays` and their lines `ownHolidays`. The other reading,
   * `false`, gives those people no Jewish holiday at all.
   */
  readonly holidaysForOtherRestDays: boolean;
  /**
   * §14, lawyer 2 (C17c): a shift that starts less than this many hours after
   * the end of the person's last work before a holiday began is holiday work
   * as a whole (Kol Zchut, תשלום על עבודה בימי חג, 20.7.2026), when it starts
   * after the holiday ends, and also when it starts in the holiday and runs
   * past its end (so its minutes after havdalah are holiday work too, and
   * coming in before havdalah never pays less than after). That last work is
   * looked for this many days back; with none, the holiday's start stands in
   * for it.
   */
  readonly afterHolidayHours: number;
  readonly afterHolidayLookbackDays: number;
  /**
   * §14, lawyer 2: Independence Day runs from 20:00 on its eve to 20:00 on the
   * day, and its eve (Yom HaZikaron) is a 7-hour eve like any other.
   */
  readonly independenceDay: {
    readonly from: string;
    readonly to: string;
    readonly eveIsShort: boolean;
  };
  /**
   * §14, lawyer 3 (C16r): for someone the Hours law doesn't apply to (s.30(א)(5)
   * and (6): "חוק זה לא יחול"), minutes in a rest window are regular too, the
   * rest-day premium of s.17 included, flagged `hoursLawRestDay`. The other
   * reading, `false`, pays those minutes 150%, still without overtime.
   */
  readonly hoursLawRestRegular: boolean;
  /**
   * §14, lawyer 5: a minor at school (or under 16) is kept from work 20:00 to
   * 08:00; any other minor 22:00 to 06:00 (Youth Labor Law s.24). The
   * school-holiday allowance until 01:00 isn't modelled; the words mention it.
   * After `takeHomeAfter` the employer takes the minor home.
   */
  readonly minorNight: {
    readonly school: { readonly from: string; readonly to: string };
    readonly other: { readonly from: string; readonly to: string };
    readonly takeHomeAfter: string;
  };
};

export const PAYROLL_READINGS: PayrollReadings = {
  restCountsTowardWeek: true,
  paidAbsenceCountsAt: "average",
  weekStartsOn: 0,
  fiveDayEve: true,
  eveShiftFromHolidayDate: true,
  doubleShiftGapMinutes: 8 * 60,
  nightShiftMinutes: 120,
  averageMonths: 3,
  wouldHaveWorkedShare: 0.5,
  holidayPayAfterMonths: 3,
  weeklyRestHours: 36,
  otherRestDay: { from: "18:00", to: "06:00" },
  holidaysForOtherRestDays: true,
  afterHolidayHours: 36,
  afterHolidayLookbackDays: 7,
  independenceDay: { from: "20:00", to: "20:00", eveIsShort: true },
  hoursLawRestRegular: true,
  minorNight: {
    school: { from: "20:00", to: "08:00" },
    other: { from: "22:00", to: "06:00" },
    takeHomeAfter: "23:00",
  },
};
