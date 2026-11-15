"use server";

import { openWeek } from "@db/availability";
import { publishWeekSchedule, saveWeekSchedule } from "@db/schedule";
import {
  movedShifts,
  scheduleClashedMeanwhile,
  scheduleTeamChanged,
} from "@db/schedule-errors";
import { type ShiftBasis, shiftBasis, weekSchedule } from "@domain/schedule";
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
  // Someone on the week left the team or the staff since it was opened.
  | "teamChanged"
  // A shift changed meanwhile (someone else, a swap approved, someone who
  // left) was changed on this screen too: nothing was saved.
  | "weekMoved"
  // The screen was drawn before the week's first save, and someone has saved
  // it since: nothing was saved, rather than replacing what they saved.
  | "weekSaved"
  // What was sent would put someone on two shifts at once with a shift that
  // changed meanwhile, which the screen does not show: nothing was saved.
  | "clashMeanwhile"
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
 * Save next week's schedule as the signed-in manager or owner, and publish
 * it to the team when the form's `intent` is "publish". The form posts the
 * shifts as JSON (`shifts`, each one it read with its id), what it read of
 * them (`basis`, null for a week drawn from the pattern, which replaces the
 * week while nobody has saved it, and is refused once someone has:
 * `weekSaved`) and the week it was showing (`week`), so a schedule meant for a
 * week that has since begun is not saved for the one after. Only what changed
 * is written, and a shift changed meanwhile is never undone: a change to one
 * is refused (`weekMoved`), and so is a clash with one (`clashMeanwhile`).
 * Workers see nothing of a draft. A published week is only published again,
 * never saved back into a draft.
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
  let read: ShiftBasis | null;
  try {
    parsed = weekSchedule(week.start, keys).safeParse(
      JSON.parse(String(form.get("shifts") ?? "[]")),
    );
    const basis = shiftBasis.safeParse(
      JSON.parse(String(form.get("basis") ?? "null")),
    );
    if (!basis.success) return { failure: "invalid" };
    read = basis.data;
  } catch {
    return { failure: "invalid" };
  }
  if (!parsed.success) return { failure: "invalid" };
  // Drawn before the week's first save (or before the week was read with what
  // was seen), while the week is saved and read now: sending it would replace
  // whatever was saved meanwhile, or name ids with nothing read.
  if (read === null && build.basis !== null) return { failure: "weekSaved" };

  try {
    const weekId = await openWeek(businessId, week.start, new Date(week.dueAt));
    await (intent === "publish" ? publishWeekSchedule : saveWeekSchedule)(
      member.userId,
      { id: weekId, startsOn: week.start, dueAt: week.dueAt },
      keys,
      parsed.data,
      read,
    );
  } catch (error) {
    if (scheduleTeamChanged(error)) return { failure: "teamChanged" };
    if (movedShifts(error)) return { failure: "weekMoved" };
    if (scheduleClashedMeanwhile(error)) return { failure: "clashMeanwhile" };
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
