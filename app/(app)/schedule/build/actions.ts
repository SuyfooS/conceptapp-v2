"use server";

import { openWeek } from "@db/availability";
import { publishWeekSchedule, saveWeekSchedule } from "@db/schedule";
import {
  crowdedShifts,
  type EdgeClash,
  edgeClashes,
  endedShifts,
  movedShifts,
  type PastShift,
  pastShifts,
  scheduleClashedMeanwhile,
  scheduleTeamChanged,
  scheduleWeekOver,
  startedShifts,
} from "@db/schedule-errors";
import { copiedOver } from "@domain/copy-week";
import {
  builderWeekOf,
  crowdedByJoins,
  type ShiftJoin,
  shiftJoins,
} from "@domain/running-week";
import {
  crowdedShiftIn,
  type ShiftAsNow,
  type ShiftBasis,
  shiftBasis,
  shiftStarted,
  weekSchedule,
} from "@domain/schedule";
import type { ShiftSwap } from "@domain/swaps";
import { canWrite } from "@domain/view-as";
import { refresh } from "next/cache";
import { pushSoon } from "../../../push/server";
import { currentMember } from "../../member";
import { currentBuildWeeks, currentScheduleBuild, weekAsNow } from "../week";

export type ScheduleFailure =
  | "noAccess"
  | "viewOnly"
  // Someone who builds the schedule without publishing it (the roles plan's
  // R3) pressed publish: nothing was sent.
  | "noPublish"
  | "weekChanged"
  | "published"
  | "invalid"
  // Someone on the week left the team or the staff since it was opened.
  | "teamChanged"
  // A shift changed meanwhile (someone else, a swap approved, someone who
  // left) was changed on this screen too, or took people here as under way
  // while it no longer is: nothing was saved. The state says how those
  // shifts are now (`moved`), for the screen to put them back.
  | "weekMoved"
  // The screen was drawn before the week's first save, and someone has saved
  // it since: nothing was saved, rather than replacing what they saved.
  | "weekSaved"
  // The screen copied last week into a week someone saved since it was
  // read: nothing was saved, rather than two copies.
  | "copySaved"
  // What was sent would put someone on two shifts at once with a shift that
  // changed meanwhile, which the screen does not show: nothing was saved.
  | "clashMeanwhile"
  // What was sent would put someone on a shift at the same time as one of
  // theirs in the week before or after, which the screen does not show:
  // nothing was saved. The state names the first of them (`edgeClash`).
  | "edgeClash"
  // In a published week, a shift changed or left out has begun since the
  // screen read it, and stays as it was: nothing was saved. Next week's screen
  // meets it only when the week turned while it was open.
  | "shiftStarted"
  // In a published week, a new shift, or one moved, would start at or before
  // now: nothing was saved.
  | "past"
  // The week has wholly ended and no longer changes: nothing was saved.
  | "weekOver"
  // People were put on a shift under way that has ended since: nothing was
  // saved. The state says how it is now (`moved`), without them.
  | "shiftEnded"
  // A shift would hold more people than a shift holds
  // (MAX_PEOPLE_ON_A_SHIFT): one sent with too many on it, people joining a
  // shift under way past it, or either reaching it because people were put
  // on it meanwhile from another screen (the database's own count,
  // 20261128000500_shift_cap.sql). Nothing was saved.
  | "shiftFull"
  | "failed";

/**
 * After `weekMoved`: the shifts this screen changed that someone else changed
 * meanwhile, read again. The builder puts them back as they are now, marked,
 * keeps the rest of its work, and the next press sends them as they are.
 * After `shiftStarted` or `shiftEnded`, the same for the shifts that began or
 * ended meanwhile, which the builder then shows as begun or over.
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
   * With `weekMoved`, `shiftStarted` and `shiftEnded`, when the week could be
   * read again. Without it the screen asks to be refreshed.
   */
  moved?: MovedShifts;
  /** With `past`: the shifts that would start at or before now, as sent. */
  past?: PastShift[];
  /**
   * With `edgeClash`, when the database named it: who, and the shift of the
   * week before or after they already work at that time (the first of them).
   */
  edgeClash?: EdgeClash;
  /**
   * The moment the server answered (ISO): a screen whose clock is behind it
   * catches up, so what began meanwhile shows as begun.
   */
  now?: string;
  /** With `weekOver`: the first day of the week running now. */
  running?: string;
};

/** What the form's submit button asks for. */
const intentOf = (form: FormData) =>
  form.get("intent") === "publish" ? "publish" : "save";

/**
 * Save the week the form names as whoever builds the schedule, and publish it
 * to the team when the form's `intent` is "publish" and they publish it too
 * (`publishesSchedule`; otherwise `noPublish`, before anything is sent, as
 * the database refuses it first). The form posts the
 * shifts as JSON (`shifts`, each one it read with its id), what it read of
 * them (`basis`, null for a week drawn from the pattern, which replaces the
 * week while nobody has saved it, and is refused once someone has:
 * `weekSaved`), the people it put on shifts under way (`joins`, apart, as the
 * database takes them) and the week it was showing (`week`). That week is
 * resolved against the two the builder opens at this moment: next week's
 * screen saved after the week turned is now saving the week running, where
 * the database keeps what has begun (`shiftStarted`) and takes nothing new
 * that starts before now (`past`); a week already over changes no more
 * (`weekOver`). Only what changed is written, and a shift changed meanwhile
 * is never undone: a change to one is refused (`weekMoved`, with those shifts
 * as they are now: `moved`), and so is a clash with one (`clashMeanwhile`),
 * or with someone's shift in the week before or after, which the screen
 * doesn't show (`edgeClash`, naming it). A screen that copied last week into
 * the week sends the save moment it read (`copied`), and the week saved
 * since is refused (`copySaved`), as two copies of empty shifts would both
 * go in. A shift never holds more than MAX_PEOPLE_ON_A_SHIFT people: one
 * sent with more, people joining a shift under way past it (counted with
 * those on it as stored now), and the database's own refusal when people
 * were put on it meanwhile all say so (`shiftFull`). Workers see nothing of a
 * draft. A published week is only published again, never saved back into a
 * draft.
 */
export async function saveScheduleAction(
  _prev: ScheduleState,
  form: FormData,
): Promise<ScheduleState> {
  const [member, weeks] = await Promise.all([
    currentMember(),
    currentBuildWeeks(),
  ]);
  const businessId = member?.membership?.business.id;
  if (!member || !businessId || !weeks) return { failure: "noAccess" };
  if (!canWrite(member.viewing)) return { failure: "viewOnly" };
  const now = weeks.now;
  const which = builderWeekOf(String(form.get("week") ?? ""), weeks);
  if (which === "over") {
    return { failure: "weekOver", now, running: weeks.thisWeek };
  }
  if (which === null) return { failure: "weekChanged", now };
  const start = which === "this" ? weeks.thisWeek : weeks.nextWeek;
  const build = await currentScheduleBuild(start);
  if (!build) return { failure: "noAccess" };
  const { week, positions } = build;
  const intent = intentOf(form);
  if (intent === "publish" && !weeks.publishes) {
    return { failure: "noPublish", now };
  }
  // Someone published the week since this screen was opened.
  if (intent === "save" && build.publishedAt) return { failure: "published" };
  // Copied from last week onto a week saved since it was read: the copy
  // would go in beside, or over, what was saved meanwhile.
  const copied = form.get("copied");
  if (typeof copied === "string" && copiedOver(copied, build.savedAt)) {
    return { failure: "copySaved", now };
  }

  const keys = positions.map((p) => p.key);
  let parsed: ReturnType<ReturnType<typeof weekSchedule>["safeParse"]>;
  let read: ShiftBasis | null;
  let joins: ShiftJoin[];
  try {
    parsed = weekSchedule(week.start, keys).safeParse(
      JSON.parse(String(form.get("shifts") ?? "[]")),
    );
    const basis = shiftBasis.safeParse(
      JSON.parse(String(form.get("basis") ?? "null")),
    );
    const joined = shiftJoins.safeParse(
      JSON.parse(String(form.get("joins") ?? "[]")),
    );
    if (!basis.success || !joined.success) return { failure: "invalid" };
    read = basis.data;
    joins = joined.data;
  } catch {
    return { failure: "invalid" };
  }
  if (!parsed.success) {
    // A shift sent with more people than a shift holds says so, as people
    // joining one under way past it do below.
    return {
      failure: crowdedShiftIn(parsed.error) ? "shiftFull" : "invalid",
    };
  }
  // Drawn before the week's first save (or before the week was read with what
  // was seen), while the week is saved and read now: sending it would replace
  // whatever was saved meanwhile, or name ids with nothing read.
  if (read === null && build.basis !== null) return { failure: "weekSaved" };
  // People joining a shift under way, counted with everyone on it as the
  // week is stored now: past the people a shift holds, nothing is sent. Two
  // screens joining it at once are the database's to refuse (`crowdedShifts`
  // below), in the same words.
  if (crowdedByJoins(build.shifts, joins).length > 0) {
    return { failure: "shiftFull", now };
  }

  let weekId: string | null = null;
  try {
    weekId = await openWeek(businessId, week.start, new Date(week.dueAt));
    await (intent === "publish" ? publishWeekSchedule : saveWeekSchedule)(
      member.userId,
      { id: weekId, startsOn: week.start, dueAt: week.dueAt },
      keys,
      parsed.data,
      read,
      joins,
    );
  } catch (error) {
    const answered = new Date().toISOString();
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
    // Past the people a shift holds with people put on it meanwhile, which
    // the count above didn't see (20261128000500_shift_cap.sql).
    if (crowdedShifts(error)) return { failure: "shiftFull", now: answered };
    // Across the week's edge (20261115000600_running_week_edge.sql): the
    // other week's shift, which this screen doesn't show, named for it.
    const across = edgeClashes(error);
    if (across) {
      const [first] = across;
      return first
        ? { failure: "edgeClash", edgeClash: first }
        : { failure: "edgeClash" };
    }
    // The week under way (20261115000300_running_week.sql): what began or
    // ended meanwhile comes back as it is now, for the screen to lock it.
    for (const [failure, ids] of [
      ["shiftStarted", startedShifts(error)],
      ["shiftEnded", endedShifts(error)],
    ] as const) {
      if (!ids) continue;
      const moved =
        weekId && ids.length > 0
          ? await namedNow(businessId, weekId, keys, ids)
          : undefined;
      return { failure, now: answered, ...(moved ? { moved } : {}) };
    }
    const past = pastShifts(error);
    if (past) return { failure: "past", past, now: answered };
    if (scheduleWeekOver(error)) {
      // The week turned while it was being written: the next one is running.
      return { failure: "weekOver", now: answered, running: weeks.nextWeek };
    }
    // People put on a shift the screen read as under way, which as it is
    // stored now is not (moved to later, or deleted, meanwhile): the database
    // takes no join for it, and says no more. It comes back as it is now, as
    // any shift changed meanwhile does, and unlocks.
    if (weekId && joins.length > 0) {
      const moved = await joinedMovedNow(
        businessId,
        weekId,
        keys,
        joins,
        new Date(answered),
        week.timeZone,
      );
      if (moved) return { failure: "weekMoved", moved };
    }
    console.error(`${intent} schedule failed`, (error as Error).message);
    return { failure: "failed" };
  }
  // The team hears about a published week, on their phones too.
  if (intent === "publish") pushSoon();
  // The screen re-reads what was saved and when: its address names the week
  // (the builder sees to that), so after the week turned it reads the same
  // week, now running.
  refresh();
  const savedAt = new Date().toISOString();
  return { savedAt, published: intent === "publish", now: savedAt };
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

/**
 * After a refusal that names no reason, from a write with `joins`: the
 * shifts they were for that, as stored now, have not begun at `at` (moved to
 * later meanwhile), as they are now, and the ids of those deleted meanwhile.
 * The screen read them as under way, so it sent their people as joins, which
 * the database takes only for a shift under way. Undefined when every one of
 * them is under way, or the week can't be read again.
 */
async function joinedMovedNow(
  businessId: string,
  weekId: string,
  positionKeys: readonly string[],
  joins: readonly ShiftJoin[],
  at: Date,
  timeZone: string,
): Promise<MovedShifts | undefined> {
  try {
    const now = await weekAsNow(businessId, weekId, positionKeys);
    const ids = new Set(joins.map((join) => join.shift));
    const stored = new Set(now.shifts.map((shift) => shift.id));
    const shifts = now.shifts.filter(
      (shift) => ids.has(shift.id) && !shiftStarted(shift, at, timeZone),
    );
    const gone = [...ids].filter((id) => !stored.has(id));
    if (shifts.length === 0 && gone.length === 0) return undefined;
    return { shifts, gone, swaps: now.swaps };
  } catch (error) {
    console.error("reading the week again failed", (error as Error).message);
    return undefined;
  }
}

/**
 * After `shiftStarted` or `shiftEnded`: the shifts the database named, as
 * they are now, and the week's waiting requests now. Undefined when none of
 * them is there any more or the week can't be read again: the screen then
 * asks to be refreshed.
 */
async function namedNow(
  businessId: string,
  weekId: string,
  positionKeys: readonly string[],
  named: readonly string[],
): Promise<MovedShifts | undefined> {
  try {
    const now = await weekAsNow(businessId, weekId, positionKeys);
    const shifts = now.shifts.filter((shift) => named.includes(shift.id));
    if (shifts.length === 0) return undefined;
    return { shifts, gone: [], swaps: now.swaps };
  } catch (error) {
    console.error("reading the week again failed", (error as Error).message);
    return undefined;
  }
}
