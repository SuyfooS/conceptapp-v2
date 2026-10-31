"use server";

import { openWeek } from "@db/availability";
import { saveWeekSchedule } from "@db/schedule";
import { weekSchedule } from "@domain/schedule";
import { canWrite } from "@domain/view-as";
import { refresh } from "next/cache";
import { currentMember } from "../../member";
import { currentScheduleBuild } from "../week";

export type ScheduleFailure =
  | "noAccess"
  | "viewOnly"
  | "weekChanged"
  | "invalid"
  | "failed";

export type ScheduleState = {
  failure?: ScheduleFailure;
  /** ISO timestamp of the last save from this form. */
  savedAt?: string;
};

/**
 * Save next week's schedule as the signed-in manager or owner, replacing
 * what was saved before. The form posts the shifts as JSON (`shifts`) and
 * the week it was showing (`week`), so a schedule meant for a week that
 * has since begun is not saved for the one after. Workers see nothing of
 * it until publishing (chunk 2c-3).
 */
export async function saveScheduleAction(
  _prev: ScheduleState,
  form: FormData,
): Promise<ScheduleState> {
  const [member, build] = await Promise.all([
    currentMember(),
    currentScheduleBuild(),
  ]);
  const businessId = member?.membership?.business.id;
  if (!member || !businessId || !build) return { failure: "noAccess" };
  if (!canWrite(member.viewing)) return { failure: "viewOnly" };
  const { week, positions } = build;
  if (form.get("week") !== week.start) return { failure: "weekChanged" };

  const keys = positions.map((p) => p.key);
  let parsed: ReturnType<ReturnType<typeof weekSchedule>["safeParse"]>;
  try {
    parsed = weekSchedule(week.start, keys).safeParse(
      JSON.parse(String(form.get("shifts") ?? "[]")),
    );
  } catch {
    return { failure: "invalid" };
  }
  if (!parsed.success) return { failure: "invalid" };

  try {
    const weekId = await openWeek(businessId, week.start, new Date(week.dueAt));
    await saveWeekSchedule(
      member.userId,
      { id: weekId, startsOn: week.start, dueAt: week.dueAt },
      keys,
      parsed.data,
    );
  } catch (error) {
    console.error("saveWeekSchedule failed", (error as Error).message);
    return { failure: "failed" };
  }
  // The screen re-reads what was saved and when.
  refresh();
  return { savedAt: new Date().toISOString() };
}
