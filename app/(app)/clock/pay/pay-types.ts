import type { PayDay, PayTotals } from "@domain/pay-month";
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
 * The pay screens' data (payroll P3 to P5): hours, each person's hourly wage
 * and their details for payroll; no amounts worked out from them (P7 adds
 * those, behind the business's estimate setting). The same shapes feed the app and the demo on
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
};

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
    "days" | "totals" | "wage" | "payrollNumber" | "noNumber" | "minor"
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
};

/** Where the pay screens' links go; the demo keeps them inside the demo. */
export type PayPaths = {
  pay: string;
  team: string;
  clock: string;
};

export const payPaths: PayPaths = {
  pay: "/clock/pay",
  team: "/clock/team",
  clock: "/clock",
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
