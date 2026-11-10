import type { PayDay, PayTotals } from "@domain/pay-month";
import type { PersonRates, RemarkLine, RestName } from "@domain/pay-rates";
import type {
  DetailsFailure,
  DetailsForm,
  DetailsFormErrors,
  EmploymentPeriod,
  PayrollDetails,
  PeriodForm,
  PeriodFormErrors,
} from "@domain/payroll-details";
import type { AddressForm } from "@domain/profile";
import type {
  MonthWage,
  WageFailure,
  WageForm,
  WageFormErrors,
  WageHistoryRow,
  WageNow,
} from "@domain/wages";

/**
 * The pay screens' data (payroll P3 to P7): hours, each person's hourly wage
 * and their details for payroll, and the hours engine's month by rate with
 * what to check (P7), whose amounts show only while the business's estimate
 * setting (`payEstimate`) is on. The same shapes feed the app and the demo on
 * /design/shell.
 */

/** Someone with hours in the month, or on the staff now. */
export type PayPerson = {
  userId: string;
  name: string | null;
  photo: string | null;
  /** How the app writes about them, for an ICU `select`. */
  form: AddressForm;
  /** No longer in the business: their hours are still paid. */
  former: boolean;
  totals: PayTotals;
  /** Their shifts of the month, oldest first. */
  days: PayDay[];
  /** Their wages in the month; null for someone off the staff, who has none. */
  wage: MonthWage | null;
  /** Their number in the payroll system; null when none is set. */
  payrollNumber: string | null;
  /**
   * Their shifts of the month have no payroll number to file them under: on
   * the staff, not an owner, the same people `BeforePayroll.noNumber` counts.
   */
  noNumber: boolean;
  /** A minor today (payroll P5): the list says so. */
  minor: boolean;
  /**
   * Their month by rate, from the hours engine (payroll P7), with the
   * estimate while the business shows amounts; null when it couldn't run.
   */
  rates: PersonRates | null;
};

/** The month's estimate before tax, across everyone: the known ones added, and how many are left out for want of a wage. */
export type MonthEstimate = { agorot: number; missing: number };

/** One line of the month's accent card: someone's remark of one kind, or their pay for days not worked, in words. */
export type PayRemarkLine = RemarkLine & { name: string | null };

/** What waits before paying the month, for the screen's one accent card. */
export type BeforePayroll = {
  /** Waiting for an owner's confirmation: hours someone set for themselves. */
  ownerOnly: number;
  /** Waiting for any manager's confirmation. */
  waiting: number;
  /** Still open. */
  open: number;
  corrected: number;
  /** People whose shifts of the month have no hourly wage to pay them by. */
  noWage: number;
  /** People on the staff, not owners, with shifts in the month and no payroll number. */
  noNumber: number;
  /** The clock rounds each shift, and these hours don't. */
  rounding: boolean;
};

/**
 * Who a month's list shows: everyone, or only those whose shifts have no wage
 * or no payroll number.
 */
export type PayFilter = "noWage" | "noNumber" | null;

export type PayMonthData = {
  /** The month shown, `YYYY-MM`. */
  month: string;
  /** The month it is now: there is nothing after it. */
  currentMonth: string;
  /** Everyone's minutes in the month. */
  minutes: number;
  /** The people listed, after the filter. */
  people: PayPerson[];
  /** The whole month, whatever the filter, for the hero: who has hours, and how many shifts to check. */
  counts: { withHours: number; toCheck: number };
  before: BeforePayroll;
  filter: PayFilter;
  /** The person shown beside the list on a tablet (`?person=`), or the first. */
  selected: string | null;
  /** Where the screen leads back to: the team's hours for those who see them. */
  back: "team" | "clock" | null;
  /** They fix and confirm hours on the team's hours: a manager or an owner. */
  fixes: boolean;
  /**
   * The business shows amounts (`payEstimate`, the team's; Orel, 10 November
   * 2026). While it is off, hours and rates show and no shekel worked out.
   */
  amounts: boolean;
  /** The month's estimate, whatever the filter; null while amounts are off. */
  estimate: MonthEstimate | null;
  /** What to check in the month's hours, for the accent card (payroll P7). */
  remarks: {
    /**
     * The first lines, minors first, each a person's remark of one kind, of
     * the people listed (a filtered list names only its own).
     */
    lines: PayRemarkLine[];
    /** How many things to check the lines left out. */
    rest: number;
    /** Everyone's things to check: remarks, and lines of pay for days not worked. */
    total: number;
  };
  /** How the table names the rest rates: by the rest day everyone listed shares. */
  restName: RestName;
  /**
   * When the month's newest file for payroll went out (payroll P8), on the
   * business's clock, and whether its hours or wages changed since; null when
   * none did.
   */
  lastFile: { date: string; time: string; changed: boolean } | null;
};

/** What the reader may do with this person's wage. */
export type WageCan =
  /** Set it: a pay holder, for someone else. */
  | "set"
  /** It is their own: someone else sets it. */
  | "own"
  /** It is an owner's own: only the business's other owners set it. */
  | "ownOwner"
  /** It is the only owner's own: nobody sets it here. */
  | "soleOwner"
  /** It is an owner's, and they are no owner. */
  | "ownerOnly"
  /** Someone from ConceptApp is looking; nothing can be pressed. */
  | "viewOnly";

/** A wage set before, as the history shows it. */
export type WageHistoryEntry = WageHistoryRow & {
  /** Who set it, as the reader may know them; null when nobody is named. */
  setByName: string | null;
  /** The business's day it was set, `YYYY-MM-DD`. */
  setOn: string;
};

/** The person page's wage: today's, the next one, the history and the form's days. */
export type PersonWage = WageNow & {
  history: WageHistoryEntry[];
  can: WageCan;
  /** The business's today, `YYYY-MM-DD`. */
  today: string;
  /** The form's day: where it starts unless changed, and how far it may go. */
  from: { initial: string; earliest: string; latest: string };
  /** A minor's 18th birthday, for the minimum of their age; null for an adult. */
  youthUntil: string | null;
  /** No wage may start before this: the start a holder set (payroll P5). */
  startsOn: string | null;
};

/** The person page's details for payroll and their periods of work (payroll P5). */
export type PersonDetails = {
  details: PayrollDetails;
  /** Their periods, oldest first. */
  periods: EmploymentPeriod[];
  /** The period shown first: today's, else the one that ends last. */
  current: EmploymentPeriod | null;
  /** What the reader may do with them, by the wage's rules. */
  can: WageCan;
  /** The reader may type a birth date: an owner or the accountant. */
  birth: boolean;
  /** The business's today, `YYYY-MM-DD`. */
  today: string;
};

export type PayPersonData = {
  person: Omit<
    PayPerson,
    | "days"
    | "totals"
    | "wage"
    | "payrollNumber"
    | "noNumber"
    | "minor"
    | "rates"
  >;
  month: string;
  currentMonth: string;
  totals: PayTotals;
  days: PayDay[];
  /** The month's wages; null for someone off the staff. */
  monthWage: MonthWage | null;
  /** Their wage now and its history; null for someone off the staff. */
  wage: PersonWage | null;
  /** Their details and periods; null for someone off the staff. */
  details: PersonDetails | null;
  fixes: boolean;
  /** Their month by rate (payroll P7); null when the engine couldn't run. */
  rates: PersonRates | null;
  /** The business shows amounts (`payEstimate`). */
  amounts: boolean;
  /** How each of their weeks was worked out, while the business's week isn't set. */
  weeks: { weekOf: string; used: "five" | "six" | "smaller" }[];
  /** The minimum wage table is behind for the month. */
  stale: boolean;
  /** The reader sets the business's work week (an owner): the note leads there. */
  setsWeek: boolean;
};

/** Where the pay screens' links go; the demo keeps them inside the demo. */
export type PayPaths = {
  pay: string;
  team: string;
  clock: string;
  /** The clock's settings, where an owner sets the work week. */
  settings: string;
  /** The month's file for payroll, downloaded with `?month=` (payroll P8). */
  file: string;
};

export const payPaths: PayPaths = {
  pay: "/clock/pay",
  team: "/clock/team",
  clock: "/clock",
  settings: "/manage/time_clock",
  file: "/clock/pay/export",
};

/** What a pay screen notes when it is on screen. The demo notes nothing. */
export type NotePayView = (
  month: string,
  kind: "month" | "person" | "access",
) => Promise<void>;

export type WageActionResult =
  | { ok: true }
  | {
      ok: false;
      failure: WageFailure | "viewOnly";
      /** What is wrong with the form's fields, when that is the reason. */
      errors?: WageFormErrors;
    };

export type DetailsActionResult =
  | { ok: true }
  | {
      ok: false;
      failure: DetailsFailure | "viewOnly";
      /** What is wrong with the form's fields, when that is the reason. */
      errors?: DetailsFormErrors;
    };

export type PeriodActionResult =
  | { ok: true }
  | {
      ok: false;
      failure: DetailsFailure | "viewOnly";
      errors?: PeriodFormErrors;
    };

/** Sets a person's payroll details. The demo's stands in and stores nothing. */
export type SetDetails = (
  personId: string,
  values: DetailsForm,
) => Promise<DetailsActionResult>;

/** Adds a period of a person's work, or changes one (`periodId`). The demo's stores nothing. */
export type SetPeriod = (
  personId: string,
  values: PeriodForm,
  periodId: string | null,
) => Promise<PeriodActionResult>;

/** Sets a person's hourly wage. The demo's stands in and stores nothing. */
export type SetWage = (
  personId: string,
  values: WageForm,
) => Promise<WageActionResult>;
