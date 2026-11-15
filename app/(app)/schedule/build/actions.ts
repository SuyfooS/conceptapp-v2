"use server";

import { openWeek } from "@db/availability";
import { publishWeekSchedule, saveWeekSchedule } from "@db/schedule";
import {
  movedShifts,
  pastShifts,
  scheduleClashedMeanwhile,
  scheduleTeamChanged,
  scheduleWeekOver,
  startedShifts,
} from "@db/schedule-errors";
import {
  type ShiftAsNow,
  type ShiftBasis,
  shiftBasis,
  weekSchedule,
} from "@domain/schedule";
import type { ShiftSwap } from "@domain/swaps";
import { canWrite } from "@domain/view-as";
import { refresh } from "next/cache";
import { pushSoon } from "../../../push/server";
import { currentMember } from "../../member";
import { currentScheduleBuild, weekAsNow } from "../week";

export type ScheduleFailure =
  | "noAccess"
  | "viewOnly"
  | "weekChanged"
  | "published"
  | "invalid"
  // Someone on the week left the team or the staff since it was opened.
  | "teamChanged"
  // A shift changed meanwhile (someone else, a swap approved, someone who
  // left) was changed on this screen too: nothing was saved. The state says
  // how those shifts are now (`moved`), for the screen to put them back.
  | "weekMoved"
  // The screen was drawn before the week's first save, and someone has saved
  // it since: nothing was saved, rather than replacing what they saved.
  | "weekSaved"
  // What was sent would put someone on two shifts at once with a shift that
  // changed meanwhile, which the screen does not show: nothing was saved.
  | "clashMeanwhile"
  // The next three are the running week's (its builder comes with R3a): next
  // week has nothing begun, and when the week turns while its screen is open
  // the action stops at `weekChanged` before it writes.
  // In a published week, a shift changed or left out has begun since the
  // screen read it, and stays as it was: nothing was saved.
  | "shiftStarted"
  // In a published week, a new shift, or one moved, would start at or before
  // now: nothing was saved.
  | "past"
  // The week has wholly ended and no longer changes: nothing was saved.
  | "weekOver"
  | "failed";

/**
 * After `weekMoved`: the shifts this screen changed that someone else changed
 * meanwhile, read again. The builder puts them back as they are now, marked,
 * keeps the rest of its work, and the next press sends them as they are.
 */
export type MovedShifts = {
  /** Each as it is now, with what is seen of it now. */
  shifts: ShiftAsNow[];
  /** The ids of those deleted meanwhile. */
  gone: string[];
  /** The week's waiting swap requests now, for the warning before publishing. */
  swaps: ShiftSwap[];
};

export type ScheduleState = {
  failure?: ScheduleFailure;
  /** ISO timestamp of the last save from this form. */
  savedAt?: string;
  /** Set when that save also published the schedule. */
  published?: boolean;
  /**
   * With `weekMoved`, when the week could be read again. Without it the
   * screen asks to be refreshed.
   */
  moved?: MovedShifts;
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
 * is refused (`weekMoved`, with those shifts as they are now: `moved`), and
 * so is a clash with one (`clashMeanwhile`).
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

  let weekId: string | null = null;
  try {
    weekId = await openWeek(businessId, week.start, new Date(week.dueAt));
    await (intent === "publish" ? publishWeekSchedule : saveWeekSchedule)(
      member.userId,
      { id: weekId, startsOn: week.start, dueAt: week.dueAt },
      keys,
      parsed.data,
      read,
    );
  } catch (error) {
    if (scheduleTeamChanged(error)) return { failure: "teamChanged" };
    const named = movedShifts(error);
    if (named) {
      const moved =
        weekId && read
          ? await movedNow(businessId, weekId, keys, read, named)
          : undefined;
      return moved ? { failure: "weekMoved", moved } : { failure: "weekMoved" };
    }
    if (scheduleClashedMeanwhile(error)) return { failure: "clashMeanwhile" };
    if (startedShifts(error)) return { failure: "shiftStarted" };
    if (pastShifts(error)) return { failure: "past" };
    if (scheduleWeekOver(error)) return { failure: "weekOver" };
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

/**
 * After `weekMoved`: the shifts the database named (or, should it not name
 * them, every shift read that changed since) as they are now, with what is
 * seen of each, the ids of those deleted meanwhile, and the week's waiting
 * requests now. Undefined when there is nothing to put back or the week can't
 * be read again: the screen then asks to be refreshed.
 */
async function movedNow(
  businessId: string,
  weekId: string,
  positionKeys: readonly string[],
  read: ShiftBasis,
  named: readonly string[],
): Promise<MovedShifts | undefined> {
  try {
    const now = await weekAsNow(businessId, weekId, positionKeys);
    const byId = new Map(now.shifts.map((shift) => [shift.id, shift]));
    const ids =
      named.length > 0
        ? named
        : Object.keys(read).filter((id) => byId.get(id)?.seen !== read[id]);
    if (ids.length === 0) return undefined;
    return {
      shifts: now.shifts.filter((shift) => ids.includes(shift.id)),
      gone: ids.filter((id) => !byId.has(id)),
      swaps: now.swaps,
    };
  } catch (error) {
    console.error("reading the week again failed", (error as Error).message);
    return undefined;
  }
}
