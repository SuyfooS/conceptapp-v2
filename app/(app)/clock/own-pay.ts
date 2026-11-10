import { getEmploymentPeriods, getPayrollDetails } from "@db/payroll-details";
import { getTimeEntries } from "@db/time-clock";
import { getWages } from "@db/wages";
import { ownMonthOf } from "@domain/pay-rates";
import {
  ownEstimateShown,
  payrollPersonOf,
  personPayroll,
} from "@domain/payroll";
import { payMonthFrom } from "@domain/payroll-access";
import { DEFAULT_DETAILS } from "@domain/payroll-details";
import { formArg } from "@domain/profile";
import { monthOf } from "@domain/time-clock";
import { clockAt } from "@domain/today";
import { cache } from "react";
import { currentMember } from "../member";
import { currentModuleSettings } from "../modules";
import { clockAccess } from "./clock";
import type { OwnPay } from "./clock-types";
import { payrollInputOf, payrollReadOf } from "./pay/pay-month";

/**
 * The signed-in person's own month by the hours engine (payroll P6, plan
 * §9.6; Orel, 9 November 2026), for the estimate on `/clock` and
 * `/clock/history` (P7): their minutes at each rate, their pay for days not
 * worked and the estimate, with the adults' limits they see about themselves
 * and whether a rule for minors was crossed, and none of the flags a pay
 * holder reads. Only their own entries, wages, details and periods, read
 * under their own session. Null when they can't open the clock, the business
 * shows no estimate (`payEstimate`, the team's) or hides the worker's
 * (`workersSeeEstimate`, the owner's), or they have no wage. `asked` is a
 * month up to this one; anything else reads this month.
 */
export const currentOwnPay = cache(
  async (asked: string | undefined): Promise<OwnPay | null> => {
    const [access, member] = await Promise.all([
      clockAccess(),
      currentMember(),
    ]);
    const place = member?.membership?.business.place;
    if (!access || !member || !place) return null;
    const { userId, businessId, timeZone } = access;
    const [settings, wages] = await Promise.all([
      currentModuleSettings("time_clock"),
      getWages(businessId, userId),
    ]);
    if (!ownEstimateShown(settings, wages)) return null;
    const currentMonth = monthOf(clockAt(new Date(), timeZone).date);
    const month = payMonthFrom(asked, currentMonth, currentMonth);
    const read = payrollReadOf(month, timeZone);
    const [entries, details, periods] = await Promise.all([
      getTimeEntries(businessId, read.from, read.to, userId),
      getPayrollDetails(businessId, userId),
      getEmploymentPeriods(businessId, userId),
    ]);
    const own = details.get(userId);
    const person = personPayroll(
      payrollInputOf({
        month,
        place,
        settings,
        entries,
        people: [
          payrollPersonOf(userId, own, periods.get(userId) ?? [], wages),
        ],
        now: new Date(),
      }),
      userId,
    );
    if (!person) return null;
    return {
      month,
      restDay: (own ?? DEFAULT_DETAILS).restDay,
      business: access.businessName,
      form: formArg(member.profile.addressForm),
      ...ownMonthOf(person),
    };
  },
);
