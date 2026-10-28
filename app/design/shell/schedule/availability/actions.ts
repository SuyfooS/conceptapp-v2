"use server";

import { parseAvailabilityForm } from "@domain/availability-form";
import type { AvailabilityState } from "../../../../(app)/schedule/availability/actions";
import { demoWeek } from "./week";

// Stand-in for saving availability on the design demo: the same checks,
// and nothing is stored.
export async function demoSaveAvailability(
  _prev: AvailabilityState,
  form: FormData,
): Promise<AvailabilityState> {
  let ranges: unknown;
  try {
    ranges = JSON.parse(String(form.get("ranges") ?? "[]"));
  } catch {
    return { errors: { form: "invalid" } };
  }
  const parsed = parseAvailabilityForm(
    { ranges, note: form.get("note") },
    demoWeek.start,
    demoWeek.shabbat,
  );
  if (!parsed.ok) return { errors: parsed.errors };
  return { savedAt: new Date().toISOString() };
}
