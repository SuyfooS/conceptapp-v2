"use server";

import { openWeek, saveAvailability } from "@db/availability";
import {
  type AvailabilityFormErrors,
  parseAvailabilityForm,
} from "@domain/availability-form";
import { canWrite } from "@domain/view-as";
import { refresh } from "next/cache";
import { currentMember } from "../../member";
import { currentAvailabilityWeek } from "../week";

export type AvailabilityFailure =
  | "noAccess"
  | "viewOnly"
  | "weekChanged"
  | "failed";

export type AvailabilityState = {
  errors?: AvailabilityFormErrors;
  failure?: AvailabilityFailure;
  /** ISO timestamp of the last save from this form. */
  savedAt?: string;
};

/**
 * Save the signed-in person's availability for next week, replacing what
 * they sent before. The form posts the ranges as JSON (`ranges`) and the
 * week it was showing (`week`), so an answer meant for a week that has
 * since begun is not saved for the one after.
 */
export async function saveAvailabilityAction(
  _prev: AvailabilityState,
  form: FormData,
): Promise<AvailabilityState> {
  const [member, week] = await Promise.all([
    currentMember(),
    currentAvailabilityWeek(),
  ]);
  const businessId = member?.membership?.business.id;
  if (!member || !businessId || !week) return { failure: "noAccess" };
  if (!canWrite(member.viewing)) return { failure: "viewOnly" };
  if (form.get("week") !== week.start) return { failure: "weekChanged" };

  let ranges: unknown;
  try {
    ranges = JSON.parse(String(form.get("ranges") ?? "[]"));
  } catch {
    return { errors: { form: "invalid" } };
  }
  const parsed = parseAvailabilityForm(
    { ranges, note: form.get("note") },
    week.start,
    week.shabbat,
  );
  if (!parsed.ok) return { errors: parsed.errors };

  try {
    const weekId = await openWeek(businessId, week.start, new Date(week.dueAt));
    await saveAvailability(
      member.userId,
      { id: weekId, startsOn: week.start, dueAt: week.dueAt },
      parsed.value,
    );
  } catch (error) {
    console.error("saveAvailability failed", (error as Error).message);
    return { failure: "failed" };
  }
  // The screen re-reads what was saved and when.
  refresh();
  return { savedAt: new Date().toISOString() };
}
