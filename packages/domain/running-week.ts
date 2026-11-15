import { z } from "zod";
import { addDays, instantIn } from "./availability";
import { minutesOf } from "./hours";
import {
  draftWeek,
  type ScheduledShift,
  type ScreenShift,
  type ShiftAssignee,
  type ShiftBasis,
  sameShift,
  scheduleGaps,
  shiftAssignee,
  shiftSlot,
  shiftStarted,
} from "./schedule";
import { calendarDate } from "./shabbat";
import { MAX_SHIFTS_IN_A_WEEK, type ShiftPattern } from "./staffing";

/**
 * The week that is already running, as the builder opens it (the
 * running-week plan's R3a, Orel's answers of 15 November 2026). The database
 * holds the rule (20261115000300_running_week.sql): in a published week, a
 * shift whose start is at or before the write's moment has begun and is never
 * rewritten; people go on one under way only through `joins`; what a write
 * puts in place starts after the moment; and a week wholly over no longer
 * changes. A week never published is free. What is here only lets the screen
 * show the same before it sends anything: the SQL stays the authority.
 */

/** The builder's two weeks: the one running now and the next. */
export type BuildWeeks = { thisWeek: string; nextWeek: string };

/**
 * Which of the builder's weeks a start names (`?week=` or the form's `week`):
 * this week, next week, a week already over (any date before this week's
 * first day), or neither (missing, malformed or later than next week).
 *
 * The app is stricter here than the database, on purpose: a week is over for
 * the builder once its last day has passed, while the database still takes
 * people on a night shift of that last day until it ends
 * (20261115000300_running_week.sql, `over`). The builder opens only this week
 * and the next (the running-week plan), so that last night's no-show is
 * settled with the team directly, and its hours are in the time clock anyway.
 */
export function builderWeekOf(
  asked: string | null | undefined,
  weeks: BuildWeeks,
): "this" | "next" | "over" | null {
  if (!asked) return null;
  if (asked === weeks.thisWeek) return "this";
  if (asked === weeks.nextWeek) return "next";
  if (calendarDate.safeParse(asked).success && asked < weeks.thisWeek) {
    return "over";
  }
  return null;
}

/**
 * Whether a shift has ended at `now`: its end, on its day (the next day when
 * it ends at or before its start) in the business's time zone, is at or
 * before the moment, as `upper(private.shift_span(id)) <= at_time` decides.
 */
export function shiftEnded(
  shift: Pick<ScheduledShift, "day" | "start" | "end">,
  now: Date,
  timeZone: string,
): boolean {
  const day =
    minutesOf(shift.end) <= minutesOf(shift.start)
      ? addDays(shift.day, 1)
      : shift.day;
  return instantIn(day, shift.end, timeZone).getTime() <= now.getTime();
}

/** Where a shift stands at a moment: still to start, under way, or over. */
export type ShiftStage = "ahead" | "now" | "over";

export function shiftStage(
  shift: Pick<ScheduledShift, "day" | "start" | "end">,
  now: Date,
  timeZone: string,
): ShiftStage {
  if (!shiftStarted(shift, now, timeZone)) return "ahead";
  return shiftEnded(shift, now, timeZone) ? "over" : "now";
}

/**
 * The stored shifts of a published week that have begun at `now`, by their
 * id, read as they were read (the database reads them as stored): kept as
 * they are, beyond the people who join them. None in a week never published,
 * which is free.
 */
export function begunShifts(
  read: readonly ScheduledShift[],
  published: boolean,
  now: Date,
  timeZone: string,
): Set<string> {
  if (!published) return new Set();
  return new Set(
    read.flatMap((shift) =>
      shift.id !== undefined && shiftStarted(shift, now, timeZone)
        ? [shift.id]
        : [],
    ),
  );
}

/**
 * The people put on a shift that has begun, when that is all that changed on
 * the screen: the shift as it was read, everyone on it still there in their
 * positions, and more people. Null when anything else changed, which the
 * database refuses (`started`). Empty when nothing did.
 */
export function joinedOn(
  read: ScheduledShift,
  screen: ScheduledShift,
): ShiftAssignee[] | null {
  const was = new Set(read.assignees.map((a) => a.user));
  const kept = screen.assignees.filter((a) => was.has(a.user));
  if (!sameShift(read, { ...screen, assignees: kept })) return null;
  return screen.assignees.filter((a) => !was.has(a.user));
}

/** Someone put on a shift under way (`joins` of the save and the publish). */
export const shiftJoin = shiftAssignee.extend({ shift: z.uuid() });

export type ShiftJoin = z.infer<typeof shiftJoin>;

export const shiftJoins = z.array(shiftJoin).max(MAX_SHIFTS_IN_A_WEEK);

/**
 * The builder's week once the shifts that began or ended while it was open
 * lock: each begun shift the screen changed beyond adding people, or took
 * off, goes back to how it was read, in its place in the day (`started`), and
 * so does one that has ended with people still to be put on it (`ended`),
 * since a shift that is over takes nobody. Everything else stays as it is on
 * the screen, keeping the screen's ids. Null when nothing needs to go back.
 */
export function lockBegun(
  screen: { rows: readonly ScreenShift[]; removed: readonly ScreenShift[] },
  read: readonly ScheduledShift[],
  begun: ReadonlySet<string>,
  ended: ReadonlySet<string>,
): {
  rows: ScreenShift[];
  removed: ScreenShift[];
  started: ScheduledShift[];
  ended: ScheduledShift[];
} | null {
  const readById = new Map(
    read.flatMap((shift) => (shift.id ? [[shift.id, shift] as const] : [])),
  );
  const wasOf = (row: ScreenShift) =>
    row.shift.id !== undefined && begun.has(row.shift.id)
      ? readById.get(row.shift.id)
      : undefined;
  const started: ScheduledShift[] = [];
  const over: ScheduledShift[] = [];
  const back: ScreenShift[] = [];
  const rows: ScreenShift[] = [];
  for (const row of screen.rows) {
    const was = wasOf(row);
    const joined = was ? joinedOn(was, row.shift) : [];
    const changed = joined === null;
    const lateJoin =
      joined !== null && joined.length > 0 && ended.has(was?.id ?? "");
    if (!was || (!changed && !lateJoin)) {
      rows.push(row);
      continue;
    }
    (changed ? started : over).push(was);
    back.push({ id: row.id, shift: was });
  }
  const removed: ScreenShift[] = [];
  for (const row of screen.removed) {
    const was = wasOf(row);
    if (!was) {
      removed.push(row);
      continue;
    }
    started.push(was);
    back.push({ id: row.id, shift: was });
  }
  if (back.length === 0) return null;
  for (const row of back) {
    const at = shiftSlot(
      rows.map((r) => r.shift),
      row.shift,
    );
    rows.splice(at, 0, row);
  }
  return { rows, removed, started, ended: over };
}

/**
 * What a save or publish sends for the week on the screen. A shift that has
 * begun (`begun`) and is as it was read, beyond the people put on it, is left
 * out of the shifts and of what was read, as the database asks
 * (20261115000300_running_week.sql), and those people go as `joins`. Anything
 * else is sent as it is, a begun shift changed or taken off included, so the
 * database refuses it (`started`) rather than a change being lost without a
 * word. The builder sends none: it puts each back as it was read once its
 * clock reaches the shift's start (`lockBegun`).
 */
export function weekWrite(
  screen: readonly ScheduledShift[],
  read: readonly ScheduledShift[],
  basis: ShiftBasis | null,
  begun: ReadonlySet<string>,
): { shifts: ScheduledShift[]; basis: ShiftBasis | null; joins: ShiftJoin[] } {
  const readById = new Map(
    read.flatMap((shift) => (shift.id ? [[shift.id, shift] as const] : [])),
  );
  const left = new Set<string>();
  const joins: ShiftJoin[] = [];
  const shifts = screen.filter((shift) => {
    const was = shift.id === undefined ? undefined : readById.get(shift.id);
    if (!was || shift.id === undefined || !begun.has(shift.id)) return true;
    const joined = joinedOn(was, shift);
    if (joined === null) return true;
    left.add(shift.id);
    for (const person of joined) joins.push({ shift: shift.id, ...person });
    return false;
  });
  return {
    shifts,
    basis:
      basis === null
        ? null
        : Object.fromEntries(
            Object.entries(basis).filter(([id]) => !left.has(id)),
          ),
    joins,
  };
}

/**
 * A running week's draft from the business's shift pattern, for a week
 * nobody saved: only the shifts still to start at `now`.
 */
export function draftAhead(
  weekStart: string,
  patterns: readonly ShiftPattern[],
  now: Date,
  timeZone: string,
): ScheduledShift[] {
  return draftWeek(weekStart, patterns).filter(
    (shift) => !shiftStarted(shift, now, timeZone),
  );
}

/**
 * What is still open among the shifts still to start at `now`: every count
 * of a running week leaves out what has begun.
 */
export function gapsAhead<
  S extends Pick<ScheduledShift, "day" | "start" | "needed" | "assignees">,
>(
  shifts: readonly S[],
  now: Date,
  timeZone: string,
): { shifts: S[]; people: number } {
  return scheduleGaps(
    shifts.filter((shift) => !shiftStarted(shift, now, timeZone)),
  );
}

/** How far ahead a change is close enough to check directly (Orel, Q4). */
export const SOON_HOURS = 12;

/**
 * Whether the changes on the screen touch a shift with people on it that is
 * under way or starts within `hours` of `now`: a push held by someone's quiet
 * hours may reach them late, so the manager checks with them directly
 * (Orel's answer 4 of 15 November 2026). It never says whose quiet hours, nor
 * whether anyone has them. A change is a shift added, one not as it was read,
 * or one read and taken off; `read` is empty for a week never published, all
 * of which is new to the team.
 */
export function touchesSoon(
  read: readonly ScheduledShift[],
  screen: readonly ScheduledShift[],
  now: Date,
  timeZone: string,
  hours: number = SOON_HOURS,
): boolean {
  const until = now.getTime() + hours * 3_600_000;
  const soon = (shift: ScheduledShift) =>
    shift.assignees.length > 0 &&
    !shiftEnded(shift, now, timeZone) &&
    instantIn(shift.day, shift.start, timeZone).getTime() <= until;
  const readById = new Map(
    read.flatMap((shift) => (shift.id ? [[shift.id, shift] as const] : [])),
  );
  const kept = new Set<string>();
  for (const shift of screen) {
    const was = shift.id === undefined ? undefined : readById.get(shift.id);
    if (was && shift.id !== undefined) kept.add(shift.id);
    if (was && sameShift(was, shift)) continue;
    if (soon(shift) || (was && soon(was))) return true;
  }
  return [...readById].some(([id, shift]) => !kept.has(id) && soon(shift));
}
