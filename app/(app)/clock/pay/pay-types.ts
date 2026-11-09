import type { PayDay, PayTotals } from "@domain/pay-month";
import type { AddressForm } from "@domain/profile";

/**
 * The pay screens' data (payroll P3): hours only, no wages or amounts (P4 and
 * P7 add them). The same shapes feed the app and the demo on /design/shell.
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
  /** The clock rounds each shift, and these hours don't. */
  rounding: boolean;
};

export type PayMonthData = {
  /** The month shown, `YYYY-MM`. */
  month: string;
  /** The month it is now: there is nothing after it. */
  currentMonth: string;
  /** Everyone's minutes in the month. */
  minutes: number;
  people: PayPerson[];
  before: BeforePayroll;
  /** The person shown beside the list on a tablet (`?person=`), or the first. */
  selected: string | null;
  /** Where the screen leads back to: the team's hours for those who see them. */
  back: "team" | "clock" | null;
  /** They fix and confirm hours on the team's hours: a manager or an owner. */
  fixes: boolean;
};

export type PayPersonData = {
  person: Omit<PayPerson, "days" | "totals">;
  month: string;
  currentMonth: string;
  totals: PayTotals;
  days: PayDay[];
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
