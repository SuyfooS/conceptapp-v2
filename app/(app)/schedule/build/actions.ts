"use server";

import { openWeek } from "@db/availability";
import { publishWeekSchedule, saveWeekSchedule } from "@db/schedule";
import { weekSchedule } from "@domain/schedule";
import { canWrite } from "@domain/view-as";
import { refresh } from "next/cache";
import { pushSoon } from "../../../push/server";
import { currentMember } from "../../member";
import { currentScheduleBuild } from "../week";

export type ScheduleFailure =
  | "noAccess"
  | "viewOnly"
  | "weekChanged"
  | "published"
  | "invalid"
  | "failed";

export type ScheduleState = {
  failure?: ScheduleFailure;
  /** ISO timestamp of the last save from this form. */
  savedAt?: string;
  /** Set when that save also published the schedule. */
  published?: boolean;
};

/** What the form's submit button asks for. */
const intentOf = (form: FormData) =>
  form.get("intent") === "publish" ? "publish" : "save";

/**
 * Save next week's schedule as the signed-in manager or owner, replacing
 * what was saved before, and publish it to the team when the form's
 * `intent` is "publish". The form posts the shifts as JSON (`shifts`) and
 * the week it was showing (`week`), so a schedule meant for a week that
 * has since begun is not saved for the one after. Workers see nothing of
 * a draft. A published week is only published again, never saved back
 * into a draft.
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
  const intent = intentOf(form);
  // Someone published the week since this screen was opened.
  if (intent === "save" && build.publishedAt) return { failure: "published" };

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
    await (intent === "publish" ? publishWeekSchedule : saveWeekSchedule)(
      member.userId,
      { id: weekId, startsOn: week.start, dueAt: week.dueAt },
      keys,
      parsed.data,
    );
  } catch (error) {
    console.error(`${intent} schedule failed`, (error as Error).message);
    return { failure: "failed" };
  }
  // The team hears about a published week, on their phones too.
  if (intent === "publish") pushSoon();
  // The screen re-reads what was saved and when.
  refresh();
  return {
    savedAt: new Date().toISOString(),
    published: intent === "publish",
  };
}
