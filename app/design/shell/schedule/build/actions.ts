"use server";

import type { ScheduleState } from "../../../../(app)/schedule/build/actions";

// Stand-in for saving or publishing the schedule on the design demo: the form must
// hold a list of shifts, and nothing is stored. (The demo's people are
// not real accounts, so the full check with ids runs only in the app.)
export async function demoSaveSchedule(
  _prev: ScheduleState,
  form: FormData,
): Promise<ScheduleState> {
  try {
    const shifts: unknown = JSON.parse(String(form.get("shifts") ?? ""));
    if (!Array.isArray(shifts)) return { failure: "invalid" };
  } catch {
    return { failure: "invalid" };
  }
  return {
    savedAt: new Date().toISOString(),
    published: form.get("intent") === "publish",
  };
}
