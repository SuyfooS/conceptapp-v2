import {
  getCorrections,
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
  canSeePay,
  defaultPayMonth,
  payMonthFrom,
} from "@domain/payroll-access";
import {
  currentPeriod,
  DEFAULT_DETAILS,
  type EmploymentPeriod,
  type PayrollDetails,
  wageFloorOf,
} from "@domain/payroll-details";
import { formArg } from "@domain/profile";
import { canSeeTeam } from "@domain/team";
import {
  addMonths,
  entryDate,
  monthOf,
  monthRange,
  type TimeEntry,
} from "@domain/time-clock";
import { clockAt } from "@domain/today";
import { canWrite } from "@domain/view-as";
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
import { cache } from "react";
import { z } from "zod";
import { currentMember } from "../../member";
import { currentModuleSettings, currentModules } from "../../modules";
import type {
  BeforePayroll,
  PayFilter,
  PayMonthData,
  PayPerson,
  PayPersonData,
  PersonDetails,
  PersonWage,
  WageCan,
} from "./pay-types";

/**
 * The signed-in person and their business, when the clock is on and they hold
 * pay access (`clock.payroll`, from `public.my_permissions`: owners and
 * accountants always, a view only as an accountant). Null otherwise: the pay
 * screens then don't exist for them.
 */
export const payAccess = cache(async () => {
  const [member, enabled] = await Promise.all([
    currentMember(),
    currentModules(),
  ]);
  const membership = member?.membership;
  if (
    !member ||
    !membership ||
    !enabled.includes("time_clock") ||
    !canSeePay(membership)
  ) {
    return null;
  }
  const timeZone = membership.business.place.timeZone;
  const today = clockAt(new Date(), timeZone).date;
  const staff = isStaff(membership.role);
  return {
    userId: member.userId,
    businessId: membership.business.id,
    role: membership.role,
    timeZone,
    today,
    /** Someone from ConceptApp viewing: they read pay, and change nothing. */
    viewOnly: !canWrite(member.viewing),
    currentMonth: monthOf(today),
    defaultMonth: defaultPayMonth(today),
    /** Managers and owners fix and confirm hours on the team's hours. */
    fixes: canSeeTeam(membership.role),
    /**
     * They type a birth date (payroll P5): an owner or the accountant, the
     * circle that will hold the hiring file. Never in a view.
     */
    birth:
      canWrite(member.viewing) &&
      (membership.role === "owner" || membership.role === "accountant"),
    back: !staff
      ? null
      : canSeeTeam(membership.role)
        ? ("team" as const)
        : ("clock" as const),
  };
});

type PayAccess = NonNullable<Awaited<ReturnType<typeof payAccess>>>;

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
  const { settings, people, entries, wages, details } = await monthOfHours(
    access,
    month,
  );
  const totals = payTotals(entries, month, access.timeZone, now);
  const nameOf = nameIn(people);
  const originals = await originalsOf(access.businessId, entries);

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
    };
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
  const { people, entries, wages, details, periods } = await monthOfHours(
    access,
    month,
    id.data,
  );
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
  const [settings, entries, people, wages, details] = await Promise.all([
    currentModuleSettings("time_clock"),
    getTimeEntries(
      access.businessId,
      monthRange(first, access.timeZone).from,
      monthRange(month, access.timeZone).to,
    ),
    getPayPeople(access.businessId),
    getWages(access.businessId).then(wagesByPerson),
    getPayrollDetails(access.businessId),
  ]);
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
  };
}
