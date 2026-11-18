import { addDays, dateIn, instantIn, weekdayOf } from "./availability";
import type { ScheduleAnchor } from "./lists";

/**
 * When a template's times open its lists (lists L4): the same rules as
 * `private.list_occurrences` in supabase/migrations/
 * 20261110001300_list_schedules.sql, which the database's minute job opens
 * lists by. The editor shows a time it hasn't saved yet with these; once
 * saved, its next openings come from the database itself
 * (`public.next_list_openings`), so the screen never disagrees with the job.
 * Pure: the moment, the business's zone, its Shabbat and its published
 * shifts all come in as arguments.
 *
 * A time follows the day (minutes after the business's local midnight, by
 * its own clock, so a time the spring change skips lands an hour later and
 * one the autumn change repeats is the later one, as Postgres reads them),
 * or the start or the end of a published shift of its pattern (minutes
 * around it). Nothing opens before the time counts from (`opensFrom`). A
 * business that closes on Shabbat gets no list from a time, of the day or
 * around a shift, that opens on Friday after candle lighting; one that opens
 * on Saturday before havdalah opens at havdalah, as long as it would have
 * had; and one that opens on Friday before candle lighting but is due after
 * it is due at candle lighting.
 */

/** A schedule as the rules read it. */
export type OpeningSchedule = {
  /** 0 = Sunday. */
  days: readonly number[];
  anchor: ScheduleAnchor;
  /** The pattern key of the shift it follows; null for the day. */
  shift: string | null;
  /** Minutes: after local midnight for the day, around the shift otherwise. */
  opensOffset: number;
  dueOffset: number;
  active: boolean;
  /** The first local day it runs, "YYYY-MM-DD". */
  startsOn: string;
  /**
   * From when its openings count, as an ISO instant: when it was saved, or
   * last given other days or hours, or switched back on. Nothing opens
   * before then.
   */
  opensFrom: string;
};

/** A published shift a time may follow. */
export type OpeningShift = {
  id: string;
  /** "YYYY-MM-DD", the business's day. */
  day: string;
  /** "HH:MM"; an end at or before the start is the next day. */
  start: string;
  end: string;
  /** The scheduling settings' shift it was made from, if any. */
  pattern: string | null;
};

/** One Shabbat of the business's city: candle lighting to havdalah. */
export type ShabbatSpan = {
  /** Its Friday, "YYYY-MM-DD". */
  friday: string;
  /** ISO instants. */
  candleLighting: string;
  havdalah: string;
};

export type OpeningContext = {
  timeZone: string;
  /**
   * The business's Shabbat spans around the days asked about; empty when it
   * is open on Shabbat (its schedule off, or open by its settings).
   */
  shabbat: readonly ShabbatSpan[];
  /** Published shifts around the days asked about. */
  shifts: readonly OpeningShift[];
  /** The scheduling settings' shift keys: a time that follows another opens nothing. */
  patterns: readonly string[];
};

/** A list a time opens: its day, when it opens and when it is due. */
export type ListOpening = {
  /** The day it belongs to, "YYYY-MM-DD" (the shift's day for a shift). */
  occursOn: string;
  opensAt: string;
  dueAt: string;
  /** The shift it followed, if it followed one. */
  shiftId: string | null;
};

/** Each saved time's next openings, by the schedule's id. */
export type ScheduleOpenings = Record<string, ListOpening[]>;

const MINUTE = 60_000;
const DAY_MINUTES = 24 * 60;

/** "HH:MM" of minutes after midnight, within a day. */
const clockOf = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/**
 * The instant `minutes` after the local midnight of `date`, read on the wall
 * clock (a minute count past a day runs into the next one), as Postgres
 * reads `(date + minutes) at time zone`.
 */
export function wallInstant(
  date: string,
  minutes: number,
  timeZone: string,
): Date {
  const days = Math.floor(minutes / DAY_MINUTES);
  const rest = minutes - days * DAY_MINUTES;
  return instantIn(addDays(date, days), clockOf(rest), timeZone);
}

/** The instant a shift starts, or ends (the next day when it ends at or before its start). */
function shiftAnchor(
  shift: OpeningShift,
  anchor: "shift_start" | "shift_end",
  timeZone: string,
): Date {
  if (anchor === "shift_start") {
    return instantIn(shift.day, shift.start, timeZone);
  }
  const nextDay = shift.end <= shift.start;
  return instantIn(
    nextDay ? addDays(shift.day, 1) : shift.day,
    shift.end,
    timeZone,
  );
}

type Candidate = {
  occursOn: string;
  opens: number;
  due: number;
  shiftId: string | null;
};

/** The day's openings. */
function byDay(
  schedule: OpeningSchedule,
  firstDay: string,
  lastDay: string,
  context: OpeningContext,
): Candidate[] {
  const out: Candidate[] = [];
  for (let day = firstDay; day <= lastDay; day = addDays(day, 1)) {
    const weekday = weekdayOf(day);
    if (!schedule.days.includes(weekday) || day < schedule.startsOn) continue;
    const opens = wallInstant(
      day,
      schedule.opensOffset,
      context.timeZone,
    ).getTime();
    let due = wallInstant(day, schedule.dueOffset, context.timeZone).getTime();
    // A time the spring change skips opens an hour later, which can pass a
    // due time just after the change: then it has as long as it would have.
    if (due <= opens) {
      due = opens + (schedule.dueOffset - schedule.opensOffset) * MINUTE;
    }
    out.push({ occursOn: day, opens, due, shiftId: null });
  }
  return out;
}

/**
 * Shabbat's rule, for a business closed on it, by the day an opening falls
 * on: nothing on Friday after candle lighting; on Saturday before havdalah,
 * at havdalah with as long as it had; due at candle lighting when it opens
 * before it on Friday and is due after. Null when nothing opens.
 */
function keptOnShabbat(
  candidate: Candidate,
  context: OpeningContext,
): Candidate | null {
  const day = dateIn(new Date(candidate.opens), context.timeZone);
  const weekday = weekdayOf(day);
  const friday =
    weekday === 5 ? day : weekday === 6 ? addDays(day, -1) : undefined;
  const span = friday
    ? context.shabbat.find((s) => s.friday === friday)
    : undefined;
  if (!span) return candidate;
  const candles = Date.parse(span.candleLighting);
  const havdalah = Date.parse(span.havdalah);
  const { opens, due } = candidate;
  const inside = opens >= candles && opens < havdalah;
  if (inside && weekday === 5) return null;
  if (inside) {
    return { ...candidate, opens: havdalah, due: havdalah + (due - opens) };
  }
  if (weekday === 5 && opens < candles && due > candles) {
    return { ...candidate, due: candles };
  }
  return candidate;
}

/** The openings of a time that follows a shift: one a day, the earliest shift. */
function byShift(
  schedule: OpeningSchedule & { anchor: "shift_start" | "shift_end" },
  firstDay: string,
  lastDay: string,
  context: OpeningContext,
): Candidate[] {
  const from = addDays(firstDay, -1);
  const to = addDays(lastDay, 1);
  const shifts = context.shifts
    .filter(
      (shift) =>
        shift.pattern === schedule.shift &&
        shift.day >= from &&
        shift.day <= to &&
        shift.day >= schedule.startsOn &&
        schedule.days.includes(weekdayOf(shift.day)),
    )
    .map((shift) => ({
      shift,
      at: shiftAnchor(shift, schedule.anchor, context.timeZone).getTime(),
    }))
    .sort(
      (a, b) =>
        a.shift.day.localeCompare(b.shift.day) ||
        a.at - b.at ||
        a.shift.id.localeCompare(b.shift.id),
    );
  const out: Candidate[] = [];
  for (const { shift, at } of shifts) {
    if (out.at(-1)?.occursOn === shift.day) continue;
    out.push({
      occursOn: shift.day,
      opens: at + schedule.opensOffset * MINUTE,
      due: at + schedule.dueOffset * MINUTE,
      shiftId: shift.id,
    });
  }
  return out;
}

/**
 * The lists a time opens from just after `from` up to and including `to`,
 * earliest first. A paused time opens none, and neither does one that follows
 * a shift the scheduling settings no longer have.
 */
export function listOpenings(
  schedule: OpeningSchedule,
  from: Date,
  to: Date,
  context: OpeningContext,
): ListOpening[] {
  if (!schedule.active || from.getTime() >= to.getTime()) return [];
  const anchor = schedule.anchor;
  if (
    anchor !== "day" &&
    (schedule.shift === null || !context.patterns.includes(schedule.shift))
  ) {
    return [];
  }
  const firstDay = addDays(dateIn(from, context.timeZone), -1);
  const lastDay = addDays(dateIn(to, context.timeZone), 1);
  const candidates = (
    anchor === "day"
      ? byDay(schedule, firstDay, lastDay, context)
      : byShift({ ...schedule, anchor }, firstDay, lastDay, context)
  ).flatMap((c) => keptOnShabbat(c, context) ?? []);
  const counts = Date.parse(schedule.opensFrom);
  return candidates
    .filter(
      (c) =>
        c.opens > from.getTime() &&
        c.opens <= to.getTime() &&
        !(c.opens < counts),
    )
    .sort((a, b) => a.opens - b.opens)
    .map((c) => ({
      occursOn: c.occursOn,
      opensAt: new Date(c.opens).toISOString(),
      dueAt: new Date(c.due).toISOString(),
      shiftId: c.shiftId,
    }));
}

/** How far ahead the next openings are looked for: three weeks and a day. */
export const OPENINGS_AHEAD_DAYS = 22;

/** The next `count` lists a time opens after `at`. */
export function nextOpenings(
  schedule: OpeningSchedule,
  at: Date,
  context: OpeningContext,
  count = 3,
): ListOpening[] {
  const to = new Date(
    at.getTime() + OPENINGS_AHEAD_DAYS * DAY_MINUTES * MINUTE,
  );
  return listOpenings(schedule, at, to, context).slice(0, count);
}

/**
 * What the minute job opens at `at`: lists that have opened by then, back to
 * a day and a half, and are not more than 12 hours past their due time (a
 * short outage still opens today's lists; a long one doesn't flood).
 */
export function dueOpenings(
  schedule: OpeningSchedule,
  at: Date,
  context: OpeningContext,
): ListOpening[] {
  const from = new Date(at.getTime() - 36 * 60 * MINUTE);
  const oldest = at.getTime() - 12 * 60 * MINUTE;
  return listOpenings(schedule, from, at, context).filter(
    (opening) => Date.parse(opening.dueAt) > oldest,
  );
}

/**
 * Whether Shabbat's rule may touch this time: the business closes on
 * Shabbat, and the time runs on Friday or Saturday (of the day, or the
 * shift's day for one that follows a shift).
 */
export function shabbatTouches(
  schedule: Pick<OpeningSchedule, "days">,
  closesOnShabbat: boolean,
): boolean {
  return (
    closesOnShabbat && (schedule.days.includes(5) || schedule.days.includes(6))
  );
}

/**
 * Whether a saved time's change makes it count from now, as
 * `public.save_list_template` has it: other days or hours, or switched back
 * on. Who it goes to, or its place, leaves it as it was.
 */
export function restartsOpenings(
  before: Pick<
    OpeningSchedule,
    "days" | "anchor" | "shift" | "opensOffset" | "dueOffset" | "active"
  >,
  after: Pick<
    OpeningSchedule,
    "days" | "anchor" | "shift" | "opensOffset" | "dueOffset" | "active"
  >,
): boolean {
  const days = (list: readonly number[]) =>
    [...new Set(list)].sort((a, b) => a - b).join(",");
  return (
    days(before.days) !== days(after.days) ||
    before.anchor !== after.anchor ||
    before.shift !== after.shift ||
    before.opensOffset !== after.opensOffset ||
    before.dueOffset !== after.dueOffset ||
    (!before.active && after.active)
  );
}
