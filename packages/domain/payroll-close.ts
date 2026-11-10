import type { Role } from "./modules";

/*
 * Who closes a month, and how its refusals read (payroll P9, plan §12;
 * 20261110001000_payroll_months.sql). The database decides; the screens ask
 * the same questions first, so they offer only what it will take.
 */

/**
 * Closes and reopens months: an owner or an accountant. Not every pay
 * holder: closing ends the month for everyone. `public.close_payroll_month`
 * says the same.
 */
export function closesMonths(role: Role): boolean {
  return role === "owner" || role === "accountant";
}

/**
 * Whether a month (`YYYY-MM`) has ended, by the business's own month it is
 * now: only one that has may be closed.
 */
export function monthEnded(month: string, currentMonth: string): boolean {
  return month < currentMonth;
}

/** Why closing or reopening a month was refused, in the screen's terms. */
export type CloseFailure =
  /** Not an owner or an accountant here. */
  | "noAccess"
  /** The month is still going on. */
  | "notEnded"
  /** Closed already, by someone else meanwhile. */
  | "closed"
  /** Not closed: reopened meanwhile. */
  | "notClosed"
  /** Reopening needs its reason. */
  | "reasonNeeded"
  /** Someone from ConceptApp is looking; nothing can be pressed. */
  | "viewOnly"
  /** The screen was drawn for another business, since switched from. */
  | "businessChanged"
  | "failed";

/** A refusal of `public.close_payroll_month` or `public.reopen_payroll_month`, by its code and message. */
export function closeFailureOf(
  code: string | undefined,
  message = "",
): CloseFailure {
  switch (code) {
    case "42501":
      return "noAccess";
    case "23505":
      return "closed";
    case "P0002":
      return "notClosed";
    case "22023":
      if (/not ended/i.test(message)) return "notEnded";
      if (/reason/i.test(message)) return "reasonNeeded";
      return "failed";
    default:
      return "failed";
  }
}
