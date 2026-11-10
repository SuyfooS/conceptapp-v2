"use server";

import {
  type DetailsForm,
  type PeriodForm,
  parseDetailsForm,
  parsePeriodForm,
} from "@domain/payroll-details";
import { parseWageForm, type WageForm } from "@domain/wages";
import type {
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
