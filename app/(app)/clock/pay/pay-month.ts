import { getPayPeople } from "@db/payroll";
import { getEmploymentPeriods, getPayrollDetails } from "@db/payroll-details";
import { getTimeEntries } from "@db/time-clock";
import { getWages, wagesByPerson } from "@db/wages";
import { historyMonths, payrollHistory } from "@domain/holiday-pay";
import {
  type PayrollMonth,
  payrollMonth,
  payrollPeopleOf,
  payrollPersonOf,
  payrollRange,
  payrollReadRange,
  withoutAmounts,
} from "@domain/payroll";
import { payMonthFrom } from "@domain/payroll-access";
import { payrollCalendar } from "@domain/payroll-calendar";
import { shabbatPlaceOf } from "@domain/shabbat";
import { entryDate, monthOf } from "@domain/time-clock";
import { cache } from "react";
import { currentMember } from "../../member";
import { currentModuleSettings } from "../../modules";
import { payAccess } from "./pay";

/**
 * Everyone's month by the hours engine (payroll P6, plan §9.6), for the pay
 * screens P7 draws: each person's minutes at each rate, day by day, the pay
 * for days not worked, the estimate and what to check. Null when the person
 * may not open the pay screens. Reads under their own session, so RLS decides
 * whose hours, wages and details come back (pay holders: the business's).
 *
 * The entries reach from the first of the history months (holiday pay's
 * average) to the end of the month's last week (the weekly 42), and the
 * calendar is worked out for the business's city. While the business's
 * `payEstimate` is off (the team's switch; Orel, 10 November 2026), the month
 * comes back without any amount.
 */
export const currentPayrollMonth = cache(
  async (asked: string | undefined): Promise<PayrollMonth | null> => {
    const access = await payAccess();
    const place = (await currentMember())?.membership?.business.place;
    if (!access || !place) return null;
    const month = payMonthFrom(asked, access.currentMonth, access.defaultMonth);
    const history = historyMonths(month);
    const read = payrollReadRange(month, access.timeZone, history.from);
    const [settings, people, entries, wages, details, periods] =
      await Promise.all([
        currentModuleSettings("time_clock"),
        getPayPeople(access.businessId),
        getTimeEntries(access.businessId, read.from, read.to),
        getWages(access.businessId).then(wagesByPerson),
        getPayrollDetails(access.businessId),
        getEmploymentPeriods(access.businessId),
      ]);
    const now = new Date();
    const range = payrollRange(month);
    const inMonth = entries.filter(
      (entry) => monthOf(entryDate(entry, access.timeZone)) === month,
    );
    const result = payrollMonth({
      month,
      timeZone: access.timeZone,
      now,
      entries,
      people: payrollPeopleOf(people, inMonth).map((userId) =>
        payrollPersonOf(
          userId,
          details.get(userId),
          periods.get(userId) ?? [],
          wages.get(userId) ?? [],
        ),
      ),
      settings,
      calendar: payrollCalendar(
        shabbatPlaceOf(place),
        range.from,
        range.to,
        settings,
      ),
      history: payrollHistory(entries, month, access.timeZone, now),
    });
    return settings.payEstimate ? result : withoutAmounts(result);
  },
);
