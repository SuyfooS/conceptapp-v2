import type { AgeBand } from "./minimum-wage";

/**
 * Minors (payroll P5): payroll keeps a minor's 18th birthday, `youth_until`,
 * and never their birth date (profile design §2.10). A birth date is typed
 * once, by an owner or the accountant, and only the day they turn 18 is kept;
 * `public.set_payroll_details` works it out the same way. Every band and limit
 * that depends on age is read from that one day.
 *
 * Years are added as Postgres adds an interval of years: 29 February plus a
 * year without one is 28 February. So someone born on 29 February is a minor
 * until 28 February of the year they turn 18 (to confirm with an accountant,
 * payroll plan §14). Read back from `youth_until` alone, their earlier
 * birthdays in a leap year fall on the 28th: one day early at 16, 15 and 14,
 * which only ever moves them to the higher youth minimum a day sooner.
 */

function parts(date: string): [number, number, number] {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  return [year, month, day];
}

function iso(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * A day (`YYYY-MM-DD`) plus whole years, back with a negative number: the
 * same day and month, or the month's last day when that year has no such day.
 */
export function addYears(date: string, years: number): string {
  const [year, month, day] = parts(date);
  const target = year + years;
  const last = new Date(Date.UTC(target, month, 0)).getUTCDate();
  return iso(target, month, Math.min(day, last));
}

/** The age at which someone is no longer a minor. */
export const ADULT_AGE = 18;

/**
 * The 18th birthday of someone born on `birthDate`, or null when it has come
 * by `today`: they are an adult, and payroll keeps nothing.
 */
export function youthUntilOf(birthDate: string, today: string): string | null {
  const until = addYears(birthDate, ADULT_AGE);
  return until > today ? until : null;
}

/** Whether someone a minor until `youthUntil` is still one on `date`. */
export function isMinorOn(date: string, youthUntil: string | null): boolean {
  return youthUntil !== null && date < youthUntil;
}

/**
 * The minimum wage's band on `date` for someone a minor until `youthUntil`
 * (null for an adult): under 16 before their 16th birthday (two years before
 * `youthUntil`), 16 from it, 17 from their 17th, an adult from their 18th.
 * The band changes on the birthday itself, mid-month too.
 */
export function ageBandOn(date: string, youthUntil: string | null): AgeBand {
  if (!isMinorOn(date, youthUntil) || youthUntil === null) return "adult";
  if (date >= addYears(youthUntil, -1)) return "17";
  if (date >= addYears(youthUntil, -2)) return "16";
  return "under16";
}

/**
 * Nobody under 15 may be employed (Youth Labor Law s.2; from 14, only light
 * work in the official school holidays): whether, on `date`, someone a minor
 * until `youthUntil` is still under 15.
 */
export function minorUnderAge(
  date: string,
  youthUntil: string | null,
): boolean {
  return youthUntil !== null && date < addYears(youthUntil, -(ADULT_AGE - 15));
}

/**
 * What a screen says of someone's age on `today`: "a minor until 4.2027", the
 * day itself for the screen to write, or null for an adult.
 */
export function youthLabel(
  youthUntil: string | null,
  today: string,
): { until: string } | null {
  return youthUntil !== null && isMinorOn(today, youthUntil)
    ? { until: youthUntil }
    : null;
}
