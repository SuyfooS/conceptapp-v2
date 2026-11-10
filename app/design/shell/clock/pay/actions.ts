"use server";

import { parseWageForm, type WageForm } from "@domain/wages";
import type { WageActionResult } from "../../../../(app)/clock/pay/pay-types";

// Stand-ins for the demo: a pay screen on the demo notes nothing, and a wage
// set there is read by the app's own rules, on the demo's today, and stored
// nowhere.
export async function demoNotePayView(
  _month: string,
  _kind: "month" | "person" | "access",
): Promise<void> {}

export async function demoSetWage(
  _personId: string,
  values: WageForm,
): Promise<WageActionResult> {
  const parsed = parseWageForm(values, "2026-11-10");
  return parsed.ok
    ? { ok: true }
    : { ok: false, failure: "invalid", errors: parsed.errors };
}
