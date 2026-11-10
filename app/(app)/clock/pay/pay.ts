import {
  getCorrections,
  getLastPayrollExport,
  getPayPeople,
  type PayPerson as PayPersonRow,
} from "@db/payroll";
import { getEmploymentPeriods, getPayrollDetails } from "@db/payroll-details";
import { getTimeEntries } from "@db/time-clock";
import { getWages, wagesByPerson } from "@db/wages";
import { dateIn } from "@domain/availability";
import { isStaff } from "@domain/modules";
import {
  addTotals,
  NO_PAY_TOTALS,
  originalTimes,
  type PayTotals,
  payDays,
  payTotals,
  toCheck,
} from "@domain/pay-month";
import {
  monthEstimate,
  personRates,
  remarkLines,
  restNameOfAll,
  toCheckOf,
  weeksWorkedOut,
} from "@domain/pay-rates";
import type { PersonPayroll } from "@domain/payroll";
import { payMonthFrom } from "@domain/payroll-access";
import {
  currentPeriod,
  DEFAULT_DETAILS,
  type EmploymentPeriod,
  type PayrollDetails,
  wageFloorOf,
} from "@domain/payroll-details";
import { changedSinceExport, entriesOfMonth } from "@domain/payroll-export";
import { formArg } from "@domain/profile";
import { timeIn } from "@domain/shabbat";
import {
  addMonths,
  entryDate,
  monthOf,
  monthRange,
  type TimeEntry,
} from "@domain/time-clock";
import {
  firstOfMonth,
  type MonthWage,
  monthWage,
  type WageRow,
  wageFromBounds,
  wageHistory,
  wageNow,
} from "@domain/wages";
import { youthLabel } from "@domain/youth";
import { z } from "zod";
import { currentModuleSettings } from "../../modules";
import { type PayAccess, payAccess } from "./pay-access";
import { currentPayrollMonth, currentPayrollPerson } from "./pay-month";
import type {
  BeforePayroll,
  MonthEstimate,
  PayFilter,
  PayMonthData,
  PayPerson,
  PayPersonData,
  PersonDetails,
  PersonWage,
  WageCan,
} from "./pay-types";

/** How many of the month's remarks its accent card names in words. */
const REMARK_LINES = 5;

/**
 * The engine's people of a month with whether each is left out of its
 * estimate for want of a wage: someone on the staff, not an owner (whose wage
 * only another owner sets, and who is often paid otherwise: payroll P4), with
 * worked days and no wage for some of them.
 */
function estimateRows(
  people: readonly PersonPayroll[],
  roleOf: (userId: string) => PayPersonRow["role"] | null,
): { estimateAgorot: number | null; missing: boolean }[] {
  return people.map((person) => {
    const role = roleOf(person.userId);
    return {
      estimateAgorot: person.estimateAgorot,
      missing:
        person.estimateAgorot === null &&
        role !== null &&
        isStaff(role) &&
        role !== "owner" &&
        person.flags.some((flag) => flag.code === "noWage"),
    };
  });
}

/** Who to list for a month: the staff now, and anyone with hours in it. */
function listed(
  people: readonly PayPersonRow[],
  totals: ReadonlyMap<string, PayTotals>,
): PayPersonRow[] {
  return people
    .filter(
      (person) =>
        (person.active && isStaff(person.role)) || totals.has(person.userId),
    )
    .sort(
      (a, b) =>
        // Unnamed people go last, as on the team screen.
        (a.name === null ? 1 : 0) - (b.name === null ? 1 : 0) ||
        (a.name ?? "").localeCompare(b.name ?? "", "he"),
    );
}

const nameIn =
  (people: readonly PayPersonRow[]) =>
  (userId: string): string | null =>
    people.find((person) => person.userId === userId)?.name ?? null;

/** Each corrected entry's times before its first correction, from the log. */
async function originalsOf(businessId: string, entries: readonly TimeEntry[]) {
  const corrected = entries
    .filter((entry) => entry.editedBy !== null)
    .map((entry) => entry.id);
  return originalTimes(await getCorrections(businessId, corrected));
}

/**
 * A month's entries, with the clock's settings, everyone who was here, their
 * wages, details and periods (one person's, when `userId` is given).
 */
async function monthOfHours(access: PayAccess, month: string, userId?: string) {
  const { from, to } = monthRange(month, access.timeZone);
  const [settings, people, entries, wages, details, periods] =
    await Promise.all([
      currentModuleSettings("time_clock"),
      getPayPeople(access.businessId),
      getTimeEntries(access.businessId, from, to, userId),
      getWages(access.businessId, userId),
      getPayrollDetails(access.businessId, userId),
      getEmploymentPeriods(access.businessId, userId),
    ]);
  return {
    settings,
    people,
    entries,
    wages: wagesByPerson(wages),
    details,
    periods,
  };
}

/** Someone's details, the defaults when they have none. */
const detailsFor = (
  details: ReadonlyMap<string, PayrollDetails>,
  userId: string,
): PayrollDetails => details.get(userId) ?? DEFAULT_DETAILS;

/**
 * Whether someone's shifts of the month are paid with no payroll number to
 * file them under: on the staff, not an owner (often paid otherwise, as with
 * wages), with shifts, and no number.
 */
function lacksNumber(
  person: PayPersonRow,
  details: ReadonlyMap<string, PayrollDetails>,
  shifts: number,
): boolean {
  return (
    isStaff(person.role) &&
    person.role !== "owner" &&
    shifts > 0 &&
    detailsFor(details, person.userId).payrollNumber === null
  );
}

/**
 * Someone's wages in a month, from the days of their shifts; null off the
 * staff. An owner's shifts are never missing a wage: only another owner sets
 * one, the only owner's nobody does, and an owner is often paid otherwise. So
 * no owner is counted, listed by `?show=noWage` or warned about.
 */
function wageOfMonth(
  person: PayPersonRow,
  wages: ReadonlyMap<string, WageRow[]>,
  month: string,
  days: readonly string[],
): MonthWage | null {
  if (!isStaff(person.role)) return null;
  const wage = monthWage(wages.get(person.userId) ?? [], month, days);
  return person.role === "owner" ? { ...wage, missing: null } : wage;
}

function beforePayroll(
  totals: PayTotals,
  noWage: number,
  noNumber: number,
  rounding: boolean,
): BeforePayroll {
  return {
    ownerOnly: totals.ownerOnly,
    waiting: totals.waiting - totals.ownerOnly,
    open: totals.open,
    corrected: totals.corrected,
    noWage,
    noNumber,
    rounding,
  };
}

const personId = z.uuid();

/**
 * `?show=` of the month's list: only those whose shifts have no wage, or no
 * payroll number.
 */
export function payFilterFrom(asked: unknown): PayFilter {
  return asked === "noWage" || asked === "noNumber" ? asked : null;
}

/**
 * Everyone's hours in a month, for payroll. Null when the person may not open
 * the pay screens. `?month=` is clamped to a real month up to now, and opens
 * on last month until the 10th; `?person=` chooses whose month a tablet shows
 * beside the list, and `?show=noWage` lists only those whose shifts have no
 * hourly wage, `?show=noNumber` those with no payroll number.
 */
export async function currentPayMonth(
  askedMonth: string | undefined,
  askedPerson: string | undefined,
  askedShow?: string,
): Promise<PayMonthData | null> {
  const access = await payAccess();
  if (!access) return null;
  const month = payMonthFrom(
    askedMonth,
    access.currentMonth,
    access.defaultMonth,
  );
  const now = new Date();
  const [{ settings, people, entries, wages, details }, payroll, lastExport] =
    await Promise.all([
      monthOfHours(access, month),
      // The same month by the hours engine (payroll P7).
      currentPayrollMonth(month),
      // When its last file for payroll went out (P8).
      getLastPayrollExport(access.businessId, month),
    ]);
  const totals = payTotals(entries, month, access.timeZone, now);
  const nameOf = nameIn(people);
  const originals = await originalsOf(access.businessId, entries);
  const engineOf = (userId: string) =>
    payroll?.people.find((one) => one.userId === userId) ?? null;

  const listedPeople = listed(people, totals);
  const everyone: PayPerson[] = listedPeople.map((person) => {
    const days = payDays(
      entries.filter((entry) => entry.userId === person.userId),
      month,
      access.timeZone,
      now,
      nameOf,
      originals,
    );
    const own = detailsFor(details, person.userId);
    const engine = engineOf(person.userId);
    return {
      userId: person.userId,
      name: person.name,
      photo: person.photo,
      form: formArg(person.addressForm),
      former: !person.active,
      totals: totals.get(person.userId) ?? NO_PAY_TOTALS,
      days,
      wage: wageOfMonth(
        person,
        wages,
        month,
        days.map((day) => day.date),
      ),
      payrollNumber: own.payrollNumber,
      noNumber: lacksNumber(
        person,
        details,
        totals.get(person.userId)?.shifts ?? 0,
      ),
      minor:
        isStaff(person.role) &&
        youthLabel(own.youthUntil, access.today) !== null,
      rates: engine ? personRates(engine, own.restDay) : null,
    };
  });
  const roleOf = (userId: string) =>
    people.find((person) => person.userId === userId)?.role ?? null;
  const counted = everyone.flatMap((row) => {
    const engine = engineOf(row.userId);
    return engine ? [engine] : [];
  });
  const noWage = everyone.filter((row) => row.wage?.missing).length;
  const noNumber = everyone.filter((row) => row.noNumber).length;
  // With nobody left to show, the filter goes: an old link shows everyone.
  const askedFilter = payFilterFrom(askedShow);
  const filter =
    (askedFilter === "noWage" && noWage > 0) ||
    (askedFilter === "noNumber" && noNumber > 0)
      ? askedFilter
      : null;
  const rows =
    filter === "noWage"
      ? everyone.filter((row) => row.wage?.missing)
      : filter === "noNumber"
        ? everyone.filter((row) => row.noNumber)
        : everyone;
  const all = addTotals(totals.values());
  const asked = personId.safeParse(askedPerson);
  return {
    month,
    currentMonth: access.currentMonth,
    minutes: all.minutes,
    people: rows,
    counts: {
      withHours: everyone.filter((row) => row.totals.shifts > 0).length,
      toCheck: toCheck(all),
    },
    before: beforePayroll(all, noWage, noNumber, settings.roundToMinutes !== 0),
    filter,
    selected:
      (asked.success &&
        rows.find((row) => row.userId === asked.data)?.userId) ||
      (rows[0]?.userId ?? null),
    back: access.back,
    fixes: access.fixes,
    amounts: settings.payEstimate,
    // Nothing to estimate in a month with no hours.
    estimate:
      settings.payEstimate && payroll && all.minutes > 0
        ? monthEstimate(estimateRows(counted, roleOf))
        : null,
    remarks: {
      // The lines follow the list: a filtered list names only its people.
      ...namedRemarks(rows),
      total: counted.reduce((sum, one) => sum + toCheckOf(one), 0),
    },
    restName: restNameOfAll(
      everyone.flatMap((row) => (row.rates ? [row.rates.restDay] : [])),
    ),
    lastFile: lastExport
      ? {
          date: dateIn(new Date(lastExport.at), access.timeZone),
          time: timeIn(new Date(lastExport.at), access.timeZone),
          changed: changedSinceExport(
            entriesOfMonth(entries, month, access.timeZone),
            [...wages.values()].flat(),
            month,
            lastExport.at,
          ),
        }
      : null,
  };
}

/**
 * The month's accent card: the first remarks and lines of pay for days not
 * worked in words, each with whose it is.
 */
function namedRemarks(
  people: readonly PayPerson[],
): Omit<PayMonthData["remarks"], "total"> {
  const { lines, rest } = remarkLines(
    people.map((row) => ({
      userId: row.userId,
      remarks: row.rates?.remarks ?? [],
      holidayPay: row.rates?.holidayPay ?? [],
    })),
    REMARK_LINES,
  );
  return {
    lines: lines.map((line) => ({
      ...line,
      name: people.find((row) => row.userId === line.userId)?.name ?? null,
    })),
    rest,
  };
}

/**
 * One person's month, for payroll. Null when the person asking may not open
 * the pay screens, or the one asked about was never in the business, or is
 * off the staff (an accountant) with no hours that month.
 */
export async function currentPayPerson(
  asked: string,
  askedMonth: string | undefined,
): Promise<PayPersonData | null> {
  const access = await payAccess();
  const id = personId.safeParse(asked);
  if (!access || !id.success) return null;
  const month = payMonthFrom(
    askedMonth,
    access.currentMonth,
    access.defaultMonth,
  );
  const now = new Date();
  const [{ settings, people, entries, wages, details, periods }, payroll] =
    await Promise.all([
      monthOfHours(access, month, id.data),
      // Their month by the hours engine (payroll P7).
      currentPayrollPerson(month, id.data),
    ]);
  const person = people.find((row) => row.userId === id.data);
  if (!person || (!isStaff(person.role) && entries.length === 0)) return null;
  const totals =
    payTotals(entries, month, access.timeZone, now).get(person.userId) ??
    NO_PAY_TOTALS;
  const originals = await originalsOf(access.businessId, entries);
  const nameOf = nameIn(people);
  const days = payDays(entries, month, access.timeZone, now, nameOf, originals);
  const own = detailsFor(details, person.userId);
  const ownPeriods = periods.get(person.userId) ?? [];
  const can = wageCan(access, person, people);
  return {
    person: {
      userId: person.userId,
      name: person.name,
      photo: person.photo,
      form: formArg(person.addressForm),
      former: !person.active,
    },
    month,
    currentMonth: access.currentMonth,
    totals,
    days,
    monthWage: wageOfMonth(
      person,
      wages,
      month,
      days.map((day) => day.date),
    ),
    wage: isStaff(person.role)
      ? personWage(wages.get(person.userId) ?? [], can, access, nameOf, {
          youthUntil: own.youthUntil,
          startsOn: wageFloorOf(ownPeriods),
        })
      : null,
    details: isStaff(person.role)
      ? personDetails(own, ownPeriods, can, access)
      : null,
    fixes: access.fixes,
    rates: payroll ? personRates(payroll.person, own.restDay) : null,
    amounts: settings.payEstimate,
    weeks: payroll ? weeksWorkedOut(payroll.notes, person.userId) : [],
    stale:
      payroll?.notes.some((note) => note.code === "minimumWageTableStale") ??
      false,
    setsWeek: access.role === "owner" && !access.viewOnly,
  };
}

/** The person page's details and periods, by the business's today. */
function personDetails(
  details: PayrollDetails,
  periods: EmploymentPeriod[],
  can: WageCan,
  access: PayAccess,
): PersonDetails {
  return {
    details,
    periods,
    current: currentPeriod(periods, access.today),
    can,
    birth: can === "set" && access.birth,
    today: access.today,
  };
}

/**
 * What the reader may do with the person's wage: nothing in a view, and never
 * their own or, but for an owner, an owner's. The database says the same
 * (`public.set_hourly_wage`). An owner's own is set only by another owner, so
 * the only owner's is set by nobody here.
 */
function wageCan(
  access: PayAccess,
  person: PayPersonRow,
  people: readonly PayPersonRow[],
): WageCan {
  if (access.viewOnly) return "viewOnly";
  if (person.userId === access.userId) {
    if (person.role !== "owner") return "own";
    return people.some(
      (other) =>
        other.role === "owner" &&
        other.active &&
        other.userId !== person.userId,
    )
      ? "ownOwner"
      : "soleOwner";
  }
  if (person.role === "owner" && access.role !== "owner") return "ownerOnly";
  return "set";
}

/**
 * The person page's wage, from their rows, by the business's today, with
 * their age for the minimum and the start no wage may come before.
 */
function personWage(
  rows: readonly WageRow[],
  can: WageCan,
  { today, timeZone }: { today: string; timeZone: string },
  nameOf: (userId: string) => string | null,
  person: { youthUntil: string | null; startsOn: string | null },
): PersonWage {
  const { earliest, latest } = wageFromBounds(today);
  const initial = firstOfMonth(today);
  return {
    ...wageNow(rows, today),
    history: wageHistory(rows).map((row) => ({
      ...row,
      setByName: row.setBy ? nameOf(row.setBy) : null,
      setOn: dateIn(new Date(row.setAt), timeZone),
    })),
    can,
    today,
    from: {
      // Someone who starts later this month gets their wage from that day.
      initial:
        person.startsOn &&
        person.startsOn > initial &&
        person.startsOn <= latest
          ? person.startsOn
          : initial,
      earliest,
      latest,
    },
    youthUntil: person.youthUntil,
    startsOn: person.startsOn,
  };
}

/** What an accountant's Home shows: the month to pay, and the months before. */
export type PayHomeData = {
  /** The month payroll is done for now, `YYYY-MM`. */
  month: string;
  minutes: number;
  /** People with hours in it. */
  people: number;
  /** Shifts to look at before paying: waiting and open. */
  toCheck: number;
  before: BeforePayroll;
  /** The three months before it, newest first, each with its hours. */
  earlier: { month: string; minutes: number }[];
  /**
   * The month's estimate before tax (payroll P7), from the same loader as the
   * pay screens; null while the business shows no amounts (`payEstimate`).
   */
  estimate: MonthEstimate | null;
  /** The hours engine's things to check in the month: remarks, and lines of pay for days not worked. */
  remarks: number;
};

/** How many months before the one to pay a desktop Home lists. */
const EARLIER_MONTHS = 3;

/**
 * The accountant's Home: the month payroll is done for now and what to look
 * at before paying it, and the months before. Null when they may not open the
 * pay screens.
 */
export async function currentPayHome(): Promise<PayHomeData | null> {
  const access = await payAccess();
  if (!access) return null;
  const month = access.defaultMonth;
  const first = addMonths(month, -EARLIER_MONTHS);
  const now = new Date();
  const [settings, entries, people, wages, details, payroll] =
    await Promise.all([
      currentModuleSettings("time_clock"),
      getTimeEntries(
        access.businessId,
        monthRange(first, access.timeZone).from,
        monthRange(month, access.timeZone).to,
      ),
      getPayPeople(access.businessId),
      getWages(access.businessId).then(wagesByPerson),
      getPayrollDetails(access.businessId),
      // The month by the hours engine, as /clock/pay reads it (payroll P7).
      currentPayrollMonth(month),
    ]);
  const roleOf = (userId: string) =>
    people.find((person) => person.userId === userId)?.role ?? null;
  const totalsOf = (which: string) =>
    payTotals(entries, which, access.timeZone, now);
  const current = totalsOf(month);
  const all = addTotals(current.values());
  // Those on the staff whose shifts of the month have no wage to pay them by.
  const noWage = people.filter((person) => {
    const days = entries
      .filter((entry) => entry.userId === person.userId)
      .map((entry) => entryDate(entry, access.timeZone))
      .filter((date) => monthOf(date) === month);
    return wageOfMonth(person, wages, month, days)?.missing;
  }).length;
  const noNumber = people.filter((person) =>
    lacksNumber(person, details, current.get(person.userId)?.shifts ?? 0),
  ).length;
  return {
    month,
    minutes: all.minutes,
    people: current.size,
    toCheck: toCheck(all),
    before: beforePayroll(all, noWage, noNumber, settings.roundToMinutes !== 0),
    earlier: Array.from({ length: EARLIER_MONTHS }, (_, index) => {
      const earlier = addMonths(month, -(index + 1));
      return {
        month: earlier,
        minutes: addTotals(totalsOf(earlier).values()).minutes,
      };
    }),
    estimate:
      settings.payEstimate && payroll && all.minutes > 0
        ? monthEstimate(estimateRows(payroll.people, roleOf))
        : null,
    remarks: payroll?.people.reduce((sum, one) => sum + toCheckOf(one), 0) ?? 0,
  };
}
