import "server-only";
import { getCorrections } from "@db/payroll";
import { minimumWageTableFrom } from "@domain/minimum-wage";
import { originalTimes } from "@domain/pay-month";
import { withoutAmounts } from "@domain/payroll";
import { DEFAULT_DETAILS } from "@domain/payroll-details";
import {
  type ExportPerson,
  exportShiftsOf,
  localDateTime,
} from "@domain/payroll-export";
import { formArg } from "@domain/profile";
import { DEFAULT_SHABBAT_CITY, shabbatCityOf } from "@domain/shabbat";
import { currentWording } from "../../../current-wording";
import { currentMember } from "../../../member";
import { payAccess } from "../pay-access";
import { currentPayrollReads } from "../pay-month";
import { type PayrollFile, payrollFileOf } from "./file";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * A month's file for payroll (payroll P8), for the signed-in person: only
 * someone who may open the pay screens (`clock.payroll`, or the team viewing
 * as an accountant), and only for a real month up to this one, else null. It
 * reads what the pay screens read, under the person's own session, and
 * builds the file in memory; the caller logs it before sending it.
 */
export async function currentPayrollFile(
  asked: string | null,
): Promise<(PayrollFile & { businessId: string; month: string }) | null> {
  const [member, may] = await Promise.all([currentMember(), payAccess()]);
  const business = member?.membership?.business;
  if (
    !member ||
    !business ||
    !may ||
    asked === null ||
    !MONTH.test(asked) ||
    asked > may.currentMonth
  ) {
    return null;
  }
  const reads = await currentPayrollReads(asked);
  if (!reads) return null;
  const { access, settings, people, inMonth, details, wages, now, result } =
    reads;

  const nameOf = (userId: string) =>
    people.find((person) => person.userId === userId)?.name ?? null;
  const corrected = inMonth
    .filter((entry) => entry.editedBy !== null)
    .map((entry) => entry.id);
  const originals = originalTimes(
    await getCorrections(access.businessId, corrected),
  );
  const shifts = exportShiftsOf(
    inMonth,
    asked,
    access.timeZone,
    now,
    nameOf,
    originals,
  );
  const listed: ExportPerson[] = result.people.map(({ userId }) => {
    const person = people.find((one) => one.userId === userId);
    const own = details.get(userId) ?? DEFAULT_DETAILS;
    return {
      userId,
      name: person?.name ?? null,
      form: formArg(person?.addressForm),
      payrollNumber: own.payrollNumber,
      hoursLaw: own.hoursLaw,
      restDay: own.restDay,
      wages: wages.get(userId) ?? [],
      shifts: shifts.filter((shift) => shift.userId === userId),
    };
  });

  const file = payrollFileOf({
    // Never an amount in the file: the estimate's switch changes nothing here.
    month: withoutAmounts(result),
    people: listed,
    meta: {
      business: business.name,
      month: asked,
      madeAt: localDateTime(now.toISOString(), access.timeZone),
      madeBy: member.name,
      viewing: member.viewing !== null,
      settings: {
        workWeek: settings.workWeek,
        shortDay: settings.shortDay,
        restStart: settings.restStart,
        restStartTime: settings.restStartTime,
        roundToMinutes: settings.roundToMinutes,
        unpaidBreaks: settings.unpaidBreaks,
        city: shabbatCityOf(business.place.shabbatCity) ?? DEFAULT_SHABBAT_CITY,
      },
      minimumWageFrom: minimumWageTableFrom(),
    },
    slug: business.slug,
    wording: await currentWording(),
    now,
  });
  return { ...file, businessId: access.businessId, month: asked };
}
