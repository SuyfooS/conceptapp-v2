"use server";

import {
  type DetailsForm,
  type PeriodForm,
  parseDetailsForm,
  parsePeriodForm,
} from "@domain/payroll-details";
import { parseReason } from "@domain/time-clock";
import { parseWageForm, type WageForm } from "@domain/wages";
import type {
  CloseActionResult,
  DetailsActionResult,
  PeriodActionResult,
  WageActionResult,
} from "../../../../(app)/clock/pay/pay-types";

// Stand-ins for the demo: a pay screen on the demo notes nothing, and a wage,
// details or a period set there are read by the app's own rules, on the
// demo's today, and stored nowhere.
const DEMO_TODAY = "2026-11-10";

export async function demoNotePayView(
  _month: string,
  _kind: "month" | "person" | "access",
): Promise<void> {}

export async function demoSetWage(
  _personId: string,
  values: WageForm,
): Promise<WageActionResult> {
  const parsed = parseWageForm(values, DEMO_TODAY);
  return parsed.ok
    ? { ok: true }
    : { ok: false, failure: "invalid", errors: parsed.errors };
}

/** The same, with October closed for payroll (payroll P9): no wage starts in it. */
export async function demoSetWageClosed(
  _personId: string,
  values: WageForm,
): Promise<WageActionResult> {
  const parsed = parseWageForm(values, DEMO_TODAY, null, ["2026-10"]);
  return parsed.ok
    ? { ok: true }
    : { ok: false, failure: "invalid", errors: parsed.errors };
}

/** Closing a month on the demo (payroll P9): the month as the demo shows it, stored nowhere. */
export async function demoCloseMonth(
  _month: string,
): Promise<CloseActionResult> {
  return { ok: true };
}

/** Reopening one: refused without a reason, as the app's, and stored nowhere. */
export async function demoReopenMonth(
  _month: string,
  reason: string,
): Promise<CloseActionResult> {
  return parseReason(reason) === null
    ? { ok: false, failure: "reasonNeeded" }
    : { ok: true };
}

export async function demoSetDetails(
  _personId: string,
  values: DetailsForm,
): Promise<DetailsActionResult> {
  // The demo is read as its owner: a birth date may be typed.
  const parsed = parseDetailsForm(values, DEMO_TODAY, { birth: true });
  return parsed.ok
    ? { ok: true }
    : { ok: false, failure: "invalid", errors: parsed.errors };
}

export async function demoSetPeriod(
  _personId: string,
  values: PeriodForm,
  _periodId: string | null,
): Promise<PeriodActionResult> {
  const parsed = parsePeriodForm(values, DEMO_TODAY, []);
  return parsed.ok
    ? { ok: true }
    : { ok: false, failure: "invalid", errors: parsed.errors };
}
