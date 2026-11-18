import { z } from "zod";
import { type DateParts, parseTypedDate } from "./typed-date";
import { cleanTyped } from "./typed-text";
import { youthUntilOf } from "./youth";

/**
 * Details for payroll (payroll P5; `public.member_payroll_details` and
 * `public.employment_periods`, 20261110000600_payroll_details.sql): what pay
 * is worked out from beyond hours and wages. No ID number, address, bank
 * account or birth date: those wait for the hiring file (H4). A birth date is
 * typed once, by an owner or the accountant, and only the 18th birthday is
 * kept (`@domain/youth`).
 */

/**
 * The weekly rest, as a weekday (0 Sunday … 6 Saturday): Saturday unless the
 * worker asked for Friday or Sunday (Hours of Work and Rest Law s.7(ב)). In
 * the order the sheet offers them.
 */
export const REST_DAYS = [6, 5, 0] as const;
export type RestDay = (typeof REST_DAYS)[number];

/**
 * Whether the Hours law applies: as to anyone, or not at all, for management
 * and positions of personal trust (s.30(א)(5)) or hours that can't be
 * supervised (s.30(א)(6)).
 */
export const HOURS_LAW = ["applies", "trust", "unsupervised"] as const;
export type HoursLaw = (typeof HOURS_LAW)[number];

/** A payroll system's number for a person, as the database checks it. */
export const PAYROLL_NUMBER = /^[0-9A-Za-z-]{1,20}$/;

export type PayrollDetails = {
  payrollNumber: string | null;
  restDay: RestDay;
  hoursLaw: HoursLaw;
  /** A minor's 18th birthday, `YYYY-MM-DD`; null for an adult. */
  youthUntil: string | null;
  /** A minor at school: the 20:00 night limit (Youth Labor Law s.24(ב)(1)). */
  compulsoryEducation: boolean;
};

/** What someone with no row has: the table's defaults. */
export const DEFAULT_DETAILS: PayrollDetails = {
  payrollNumber: null,
  restDay: 6,
  hoursLaw: "applies",
  youthUntil: null,
  compulsoryEducation: true,
};

/** A row of `public.member_payroll_details`, as read; a missing one is the defaults. */
export const payrollDetails = z
  .object({
    payroll_number: z.string().nullable().catch(null),
    rest_day: z
      .union([z.literal(6), z.literal(5), z.literal(0)])
      .catch(DEFAULT_DETAILS.restDay),
    hours_law: z.enum(HOURS_LAW).catch(DEFAULT_DETAILS.hoursLaw),
    youth_until: z.iso.date().nullable().catch(null),
    compulsory_education: z
      .boolean()
      .catch(DEFAULT_DETAILS.compulsoryEducation),
  })
  .transform(
    (row): PayrollDetails => ({
      payrollNumber: row.payroll_number,
      restDay: row.rest_day,
      hoursLaw: row.hours_law,
      youthUntil: row.youth_until,
      compulsoryEducation: row.compulsory_education,
    }),
  );

/** A person's details from their row, or the defaults when they have none. */
export function detailsOf(row: unknown): PayrollDetails {
  if (row === null || row === undefined) return DEFAULT_DETAILS;
  const parsed = payrollDetails.safeParse(row);
  return parsed.success ? parsed.data : DEFAULT_DETAILS;
}

export type DetailsForm = {
  payrollNumber: string;
  /** "6", "5" or "0". */
  restDay: string;
  hoursLaw: string;
  compulsoryEducation: boolean;
  /** Typed only by an owner or the accountant; all empty leaves the age as it is. */
  birth: DateParts;
};

export type DetailsFormErrors = {
  payrollNumber?: "invalid";
  restDay?: "invalid";
  hoursLaw?: "invalid";
  birth?: "invalid" | "future" | "tooOld";
};

/** What `public.set_payroll_details` takes: only the keys to change. */
export type DetailsPatch = {
  payroll_number?: string | null;
  rest_day?: RestDay;
  hours_law?: HoursLaw;
  compulsory_education?: boolean;
  birth_date?: string;
};

export type ParsedDetails =
  | {
      ok: true;
      patch: DetailsPatch;
      /** What the birth date makes of the age, for the screen to say before saving. */
      youthUntil: string | null | undefined;
    }
  | { ok: false; errors: DetailsFormErrors };

/** How far back a birth date may go. */
export const BIRTH_YEARS_BACK = 100;

export type ParsedBirth =
  /** `date`: the day typed, or null when nothing was. */
  | { ok: true; date: string | null }
  | { ok: false; error: NonNullable<DetailsFormErrors["birth"]> };

/**
 * A birth date as typed in the details sheet, read against the business's
 * `today`: a real day, not after today and in the last 100 years, or nothing.
 * Read apart from the rest of the sheet, so a wrong payroll number never
 * hides what the date makes of the age.
 */
export function parseBirth(birth: DateParts, today: string): ParsedBirth {
  const typed = parseTypedDate(birth);
  if (!typed.ok) {
    return typed.error === "empty"
      ? { ok: true, date: null }
      : { ok: false, error: "invalid" };
  }
  const [year = 0] = today.split("-").map(Number);
  const earliest = `${year - BIRTH_YEARS_BACK}${today.slice(4)}`;
  if (typed.date > today) return { ok: false, error: "future" };
  if (typed.date < earliest) return { ok: false, error: "tooOld" };
  return { ok: true, date: typed.date };
}

/**
 * The details sheet, read against the business's `today`: a payroll number
 * of digits, Latin letters and dashes, from any keyboard (`cleanTyped`; empty
 * clears it), a rest day and the Hours law from their lists, and, when
 * `birth` is allowed and typed, a real day in the last 100 years
 * (`parseBirth`), sent as the birth date for the database to keep only the
 * 18th birthday. Everything wrong at once, by field.
 */
export function parseDetailsForm(
  input: DetailsForm,
  today: string,
  { birth: birthAllowed }: { birth: boolean },
): ParsedDetails {
  const errors: DetailsFormErrors = {};
  const number = cleanTyped(input.payrollNumber).trim();
  if (number !== "" && !PAYROLL_NUMBER.test(number)) {
    errors.payrollNumber = "invalid";
  }
  const restDay = REST_DAYS.find((day) => String(day) === input.restDay.trim());
  if (restDay === undefined) errors.restDay = "invalid";
  const hoursLaw = HOURS_LAW.find((law) => law === input.hoursLaw);
  if (hoursLaw === undefined) errors.hoursLaw = "invalid";

  let birthDate: string | undefined;
  if (birthAllowed) {
    const birth = parseBirth(input.birth, today);
    if (!birth.ok) errors.birth = birth.error;
    else if (birth.date !== null) birthDate = birth.date;
  }

  if (
    Object.keys(errors).length > 0 ||
    restDay === undefined ||
    hoursLaw === undefined
  ) {
    return { ok: false, errors };
  }
  const patch: DetailsPatch = {
    payroll_number: number === "" ? null : number,
    rest_day: restDay,
    hours_law: hoursLaw,
    compulsory_education: input.compulsoryEducation,
  };
  if (birthDate !== undefined) patch.birth_date = birthDate;
  return {
    ok: true,
    patch,
    youthUntil:
      birthDate === undefined ? undefined : youthUntilOf(birthDate, today),
  };
}

/** Why the database refused details, in the screen's terms. */
export type DetailsFailure =
  | "ownDetails"
  | "ownerOnly"
  | "birthNotAllowed"
  | "noAccess"
  | "notInTeam"
  | "notStaff"
  | "numberTaken"
  | "overlap"
  | "unknownPeriod"
  | "invalid"
  | "failed";

/**
 * The refusal of `public.set_payroll_details` or
 * `public.set_employment_period`, by its code and message.
 */
export function detailsFailureOf(
  code: string | undefined,
  message = "",
): DetailsFailure {
  switch (code) {
    case "42501":
      if (/your own/i.test(message)) return "ownDetails";
      if (/owner's/i.test(message)) return "ownerOnly";
      if (/birth date/i.test(message)) return "birthNotAllowed";
      return "noAccess";
    case "P0002":
      return /period/i.test(message) ? "unknownPeriod" : "notInTeam";
    case "22023":
      return /accountant/i.test(message) ? "notStaff" : "invalid";
    case "23505":
      return "numberTaken";
    case "23P01":
      return "overlap";
    case "23514":
      return "invalid";
    default:
      return "failed";
  }
}

/** One stretch of someone's work in the business. */
export type EmploymentPeriod = {
  id: string;
  /** `YYYY-MM-DD`. */
  startedOn: string;
  /** Null while it goes on. */
  endedOn: string | null;
  /** The day of their last payment, once it ended. */
  lastPaidOn: string | null;
  /** `joined`: copied from joining the app, for a holder to check; `set`: a holder said so. */
  source: "set" | "joined";
};

/** A row of `public.employment_periods`, as read. */
export const employmentPeriod = z
  .object({
    id: z.string(),
    started_on: z.iso.date(),
    ended_on: z.iso.date().nullable(),
    last_paid_on: z.iso.date().nullable(),
    source: z.enum(["set", "joined"]),
  })
  .transform(
    (row): EmploymentPeriod => ({
      id: row.id,
      startedOn: row.started_on,
      endedOn: row.ended_on,
      lastPaidOn: row.last_paid_on,
      source: row.source,
    }),
  );

/** Periods from their rows, oldest first; a row that doesn't read is left out. */
export function periodsOf(rows: readonly unknown[]): EmploymentPeriod[] {
  return rows
    .flatMap((row) => {
      const parsed = employmentPeriod.safeParse(row);
      return parsed.success ? [parsed.data] : [];
    })
    .sort((a, b) => (a.startedOn < b.startedOn ? -1 : 1));
}

type Span = { from: string; to: string | null };

/** Whether two stretches share a day: both ends count, and null runs on. */
export function spansOverlap(a: Span, b: Span): boolean {
  return (b.to === null || a.from <= b.to) && (a.to === null || b.from <= a.to);
}

/** Whether a stretch shares a day with any of the periods but `exceptId`. */
export function overlapsAny(
  periods: readonly EmploymentPeriod[],
  span: Span,
  exceptId: string | null = null,
): boolean {
  return periods.some(
    (period) =>
      period.id !== exceptId &&
      spansOverlap({ from: period.startedOn, to: period.endedOn }, span),
  );
}

/**
 * The period a screen shows first: the one `today` falls in, else the one
 * that ends last (someone who left, or who starts later). Null with none.
 */
export function currentPeriod(
  periods: readonly EmploymentPeriod[],
  today: string,
): EmploymentPeriod | null {
  const now = periods.find((period) =>
    spansOverlap(
      { from: period.startedOn, to: period.endedOn },
      {
        from: today,
        to: today,
      },
    ),
  );
  if (now) return now;
  return (
    [...periods].sort((a, b) =>
      (a.endedOn ?? "9999-12-31") < (b.endedOn ?? "9999-12-31") ? 1 : -1,
    )[0] ?? null
  );
}

/**
 * Before when no wage may start: the first period's start, once a holder has
 * set it. A start copied from joining the app limits nothing, as
 * `public.set_hourly_wage` says.
 */
export function wageFloorOf(
  periods: readonly EmploymentPeriod[],
): string | null {
  const first = periods.reduce<EmploymentPeriod | null>(
    (earliest, period) =>
      earliest === null || period.startedOn < earliest.startedOn
        ? period
        : earliest,
    null,
  );
  return first?.source === "set" ? first.startedOn : null;
}

export type PeriodForm = { from: DateParts; to: DateParts; paid: DateParts };

export type PeriodFormErrors = {
  from?: "invalid" | "empty" | "tooLate" | "tooOld";
  to?: "invalid" | "beforeStart" | "tooLate";
  paid?: "invalid" | "noEnd" | "beforeStart";
  /** It shares days with another period of theirs. */
  overlap?: true;
};

export type ParsedPeriod =
  | {
      ok: true;
      from: string;
      to: string | null;
      paid: string | null;
    }
  | { ok: false; errors: PeriodFormErrors };

/** The day a year from `today` (`YYYY-MM-DD`), as Postgres adds 12 months. */
function yearAhead(today: string): string {
  const [year = 0, month = 1, day = 1] = today.split("-").map(Number);
  const last = new Date(Date.UTC(year + 1, month, 0)).getUTCDate();
  return `${year + 1}-${String(month).padStart(2, "0")}-${String(
    Math.min(day, last),
  ).padStart(2, "0")}`;
}

/**
 * The period sheet, read against the business's `today` and the person's
 * other periods: a start (in the last 100 years, at most a year ahead), an
 * end on or after it or
 * none while it goes on, and the last payment only once it ended, never
 * sharing a day with another period. `public.set_employment_period` says the
 * same.
 */
export function parsePeriodForm(
  input: PeriodForm,
  today: string,
  periods: readonly EmploymentPeriod[],
  exceptId: string | null = null,
): ParsedPeriod {
  const errors: PeriodFormErrors = {};
  const latest = yearAhead(today);
  const [year = 0] = today.split("-").map(Number);
  const earliest = `${year - BIRTH_YEARS_BACK}${today.slice(4)}`;

  const from = parseTypedDate(input.from);
  if (!from.ok) errors.from = from.error;
  else if (from.date > latest) errors.from = "tooLate";
  else if (from.date < earliest) errors.from = "tooOld";

  const to = parseTypedDate(input.to);
  const toDay = to.ok ? to.date : null;
  if (!to.ok && to.error === "invalid") errors.to = "invalid";
  else if (toDay !== null && from.ok && toDay < from.date) {
    errors.to = "beforeStart";
  } else if (toDay !== null && toDay > latest) errors.to = "tooLate";

  const paid = parseTypedDate(input.paid);
  const paidDay = paid.ok ? paid.date : null;
  if (!paid.ok && paid.error === "invalid") errors.paid = "invalid";
  else if (paidDay !== null && toDay === null && !errors.to) {
    errors.paid = "noEnd";
  } else if (paidDay !== null && from.ok && paidDay < from.date) {
    errors.paid = "beforeStart";
  }

  if (
    from.ok &&
    Object.keys(errors).length === 0 &&
    overlapsAny(periods, { from: from.date, to: toDay }, exceptId)
  ) {
    errors.overlap = true;
  }

  if (!from.ok || Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, from: from.date, to: toDay, paid: paidDay };
}
