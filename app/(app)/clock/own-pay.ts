import { getEmploymentPeriods, getPayrollDetails } from "@db/payroll-details";
import { getTimeEntries } from "@db/time-clock";
import { getWages } from "@db/wages";
import { historyMonths, payrollHistory } from "@domain/holiday-pay";
import {
  ownEstimateShown,
  type PersonPayroll,
  payrollPersonOf,
  payrollRange,
  payrollReadRange,
  personPayroll,
} from "@domain/payroll";
import { payMonthFrom } from "@domain/payroll-access";
import { payrollCalendar } from "@domain/payroll-calendar";
import { shabbatPlaceOf } from "@domain/shabbat";
import { monthOf } from "@domain/time-clock";
import { clockAt } from "@domain/today";
import { cache } from "react";
import { currentMember } from "../member";
import { currentModuleSettings } from "../modules";
import { clockAccess } from "./clock";

/**
 * The signed-in person's own month by the hours engine (payroll P6, plan
 * §9.6; Orel, 9 November 2026), for the estimate P7 shows on `/clock` and
 * `/clock/history`: their minutes at each rate, their pay for days not
 * worked and the estimate. Only their own entries, wages, details and
 * periods, read under their own session. Null when they can't open the
 * clock, the business shows no estimate (`payEstimate`, the team's) or hides
 * the worker's (`workersSeeEstimate`, the owner's), or they have no wage.
 * `asked` is a month up to this one; anything else reads this month.
 */
export const currentOwnPay = cache(
  async (asked: string | undefined): Promise<PersonPayroll | null> => {
    const access = await clockAccess();
    const place = (await currentMember())?.membership?.business.place;
    if (!access || !place) return null;
    const { userId, businessId, timeZone } = access;
    const [settings, wages] = await Promise.all([
      currentModuleSettings("time_clock"),
      getWages(businessId, userId),
    ]);
    if (!ownEstimateShown(settings, wages)) return null;
    const currentMonth = monthOf(clockAt(new Date(), timeZone).date);
    const month = payMonthFrom(asked, currentMonth, currentMonth);
    const history = historyMonths(month);
    const read = payrollReadRange(month, timeZone, history.from);
    const [entries, details, periods] = await Promise.all([
      getTimeEntries(businessId, read.from, read.to, userId),
      getPayrollDetails(businessId, userId),
      getEmploymentPeriods(businessId, userId),
    ]);
    const now = new Date();
    const range = payrollRange(month);
    return personPayroll(
      {
        month,
        timeZone,
        now,
        entries,
        people: [
          payrollPersonOf(
            userId,
            details.get(userId),
            periods.get(userId) ?? [],
            wages,
          ),
        ],
        settings,
        calendar: payrollCalendar(
          shabbatPlaceOf(place),
          range.from,
          range.to,
          settings,
        ),
        history: payrollHistory(entries, month, timeZone, now),
      },
      userId,
    );
  },
);
