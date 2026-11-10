import { getPayPeople } from "@db/payroll";
import { getEmploymentPeriods, getPayrollDetails } from "@db/payroll-details";
import { getTimeEntries } from "@db/time-clock";
import { getWages, wagesByPerson } from "@db/wages";
import { historyMonths, payrollHistory } from "@domain/holiday-pay";
import {
  type PayrollInput,
  type PayrollMonth,
  type PayrollPerson,
  type PayrollSettings,
  type PersonPayroll,
  payrollMonth,
  payrollPeopleOf,
  payrollPersonOf,
  payrollRange,
  payrollReadRange,
  withoutAmounts,
} from "@domain/payroll";
import { payMonthFrom } from "@domain/payroll-access";
import { payrollCalendar } from "@domain/payroll-calendar";
import { type BusinessPlace, shabbatPlaceOf } from "@domain/shabbat";
import { entryDate, monthOf, type TimeEntry } from "@domain/time-clock";
import { cache } from "react";
import { currentMember } from "../../member";
import { currentModuleSettings } from "../../modules";
import { payAccess } from "./pay-access";

/**
 * What the hours engine reads for a month, from what payroll keeps: the
 * business's settings and city (its calendar of rest windows and holidays),
 * the people, their entries over the month's weeks and the history months
 * before (`payrollReadRange`), and the history itself (holiday pay's average).
 * Shared by the pay holders' screens and the worker's own clock.
 */
export function payrollInputOf(args: {
  month: string;
  place: BusinessPlace;
  settings: PayrollSettings;
  entries: readonly TimeEntry[];
  people: readonly PayrollPerson[];
  now: Date;
}): PayrollInput {
  const { month, place, settings, entries, people, now } = args;
  const range = payrollRange(month);
  return {
    month,
    timeZone: place.timeZone,
    now,
    entries,
    people,
    settings,
    calendar: payrollCalendar(
      shabbatPlaceOf(place),
      range.from,
      range.to,
      settings,
    ),
    history: payrollHistory(entries, month, place.timeZone, now),
  };
}

/** The instants the engine reads a month's entries over, with its history. */
export function payrollReadOf(month: string, timeZone: string) {
  return payrollReadRange(month, timeZone, historyMonths(month).from);
}

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
    const read = payrollReadOf(month, access.timeZone);
    const [settings, people, entries, wages, details, periods] =
      await Promise.all([
        currentModuleSettings("time_clock"),
        getPayPeople(access.businessId),
        getTimeEntries(access.businessId, read.from, read.to),
        getWages(access.businessId).then(wagesByPerson),
        getPayrollDetails(access.businessId),
        getEmploymentPeriods(access.businessId),
      ]);
    const inMonth = entries.filter(
      (entry) => monthOf(entryDate(entry, access.timeZone)) === month,
    );
    const result = payrollMonth(
      payrollInputOf({
        month,
        place,
        settings,
        entries,
        people: payrollPeopleOf(people, inMonth).map((userId) =>
          payrollPersonOf(
            userId,
            details.get(userId),
            periods.get(userId) ?? [],
            wages.get(userId) ?? [],
          ),
        ),
        now: new Date(),
      }),
    );
    return settings.payEstimate ? result : withoutAmounts(result);
  },
);

/**
 * One person's month by the hours engine, for their pay page: their entries,
 * wages, details and periods only, with the month's notes (how each week of a
 * business whose week isn't set was worked out, whether the minimum wage
 * table is behind). Null when the reader may not open the pay screens. No
 * amount while `payEstimate` is off.
 */
export const currentPayrollPerson = cache(
  async (
    month: string,
    userId: string,
  ): Promise<{
    person: PersonPayroll;
    notes: PayrollMonth["notes"];
  } | null> => {
    const access = await payAccess();
    const place = (await currentMember())?.membership?.business.place;
    if (!access || !place) return null;
    const read = payrollReadOf(month, access.timeZone);
    const [settings, entries, wages, details, periods] = await Promise.all([
      currentModuleSettings("time_clock"),
      getTimeEntries(access.businessId, read.from, read.to, userId),
      getWages(access.businessId, userId),
      getPayrollDetails(access.businessId, userId),
      getEmploymentPeriods(access.businessId, userId),
    ]);
    const input = payrollInputOf({
      month,
      place,
      settings,
      entries,
      people: [
        payrollPersonOf(
          userId,
          details.get(userId),
          periods.get(userId) ?? [],
          wages,
        ),
      ],
      now: new Date(),
    });
    const result = payrollMonth(input);
    const shown = settings.payEstimate ? result : withoutAmounts(result);
    const person = shown.people[0];
    return person ? { person, notes: shown.notes } : null;
  },
);
