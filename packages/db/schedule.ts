import "server-only";
import { type ShiftJoin, shiftJoins } from "@domain/running-week";
import {
  type ScheduledShift,
  type ShiftBasis,
  shiftBasis,
  weekSchedule,
} from "@domain/schedule";
import { z } from "zod";
import type { ScheduleWeek } from "./availability";
import { isMissingFunction } from "./missing";
import { ScheduleWriteError } from "./schedule-errors";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

export type WeekScheduleShift = ScheduledShift & { id: string };

/**
 * A stored shift as the builder reads it: with what was seen of it
 * (`private.shift_digest`), to send back as the basis of the next save or
 * publish. Null until 20261115000100_week_in_place.sql reaches the project.
 */
export type StoredShift = WeekScheduleShift & { seen: string | null };

type DatabaseError = {
  code?: string;
  hint?: string | null;
  details?: string | null;
  message: string;
};

type WeekWrite = "save_week_schedule" | "publish_week_schedule";

/**
 * Write a week through `fn`, with what the screen read (`basis`) when it
 * read a saved week. Without one the week is replaced, as before the week was
 * written in place, so a project without that migration takes the call too;
 * a replace has no use for ids, so none is sent with it. The people put on a
 * shift under way go apart, as `joins` (20261115000300_running_week.sql),
 * and only when there are any, so a project without that migration takes
 * every other call.
 */
async function writeWeek(
  fn: WeekWrite,
  actorId: string,
  week: ScheduleWeek,
  positionKeys: readonly string[],
  input: unknown,
  basis: ShiftBasis | null,
  joining: readonly ShiftJoin[],
): Promise<number> {
  const parsed = weekSchedule(week.startsOn, positionKeys).parse(input);
  const read = shiftBasis.parse(basis);
  const joins = shiftJoins.parse(joining);
  const shifts = read ? parsed : parsed.map(({ id: _, ...shift }) => shift);
  const { data, error } = await createAdminClient().rpc(fn, {
    actor: actorId,
    week: week.id,
    shifts,
    ...(read ? { basis: read } : {}),
    ...(joins.length > 0 ? { joins } : {}),
  });
  if (error) throw writeError(fn, error);
  return z.int().parse(data);
}

function writeError(fn: WeekWrite, error: DatabaseError): ScheduleWriteError {
  const what = fn === "save_week_schedule" ? "save" : "publish";
  return new ScheduleWriteError(
    `Could not ${what} the schedule: ${error.message}`,
    error,
  );
}

/**
 * Save a week's draft schedule (`public.save_week_schedule`); refused once
 * the week is published (use `publishWeekSchedule`). Validated here first
 * with the rules the database checks; `positionKeys` are the business's
 * positions from its scheduling settings. Each shift the screen read carries
 * its id, and `basis` is what was seen of each (`basisOf`): the database
 * writes only what changed, and refuses (`movedShifts`) a change to a shift
 * that changed meanwhile. A null `basis` replaces the week: callers send it
 * only while nobody has saved the week yet. In a published week under way a
 * shift that has begun is left out of both, and the people put on it are
 * `joins` (`weekWrite` in @domain/running-week). Runs with the
 * secret key: callers check the actor is the signed-in manager or owner and
 * not viewing as someone else. Returns the number of shifts in the week.
 * Throws a `ScheduleWriteError` with the database's code, hint and detail.
 */
export async function saveWeekSchedule(
  actorId: string,
  week: ScheduleWeek,
  positionKeys: readonly string[],
  input: unknown,
  basis: ShiftBasis | null,
  joins: readonly ShiftJoin[] = [],
): Promise<number> {
  return await writeWeek(
    "save_week_schedule",
    actorId,
    week,
    positionKeys,
    input,
    basis,
    joins,
  );
}

/**
 * Save a week's schedule and publish it to the whole team
 * (`public.publish_week_schedule`): the first time, or again with changes.
 * Same checks, basis and callers as `saveWeekSchedule`; a swap request waits
 * on unless its shift was deleted, moved in day or hours, or lost whoever
 * asked. Returns the number of shifts published.
 */
export async function publishWeekSchedule(
  actorId: string,
  week: ScheduleWeek,
  positionKeys: readonly string[],
  input: unknown,
  basis: ShiftBasis | null,
  joins: readonly ShiftJoin[] = [],
): Promise<number> {
  return await writeWeek(
    "publish_week_schedule",
    actorId,
    week,
    positionKeys,
    input,
    basis,
    joins,
  );
}

/** "HH:MM:SS" from Postgres to "HH:MM". */
const toMinute = (time: string) => time.slice(0, 5);

/**
 * One person's published shifts between two dates, for the clock: it only needs
 * to know the shift they are on, not the rest of the team's week.
 */
export async function getOwnPublishedShifts(
  businessId: string,
  userId: string,
  from: string,
  to: string,
): Promise<Pick<WeekScheduleShift, "day" | "start" | "end" | "assignees">[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    // bounded: one person's shifts over a few days, of at most 200 a
    // week (raising that cap must page this).
    .from("schedule_shifts")
    .select(
      "day, starts_at, ends_at, shift_assignments!inner (user_id, position_key), schedule_weeks!inner (schedule_published_at)",
    )
    .eq("business_id", businessId)
    .eq("shift_assignments.user_id", userId)
    .gte("day", from)
    .lte("day", to)
    .not("schedule_weeks.schedule_published_at", "is", null);
  if (error) throw error;
  return data.map((row) => ({
    day: row.day,
    start: toMinute(row.starts_at),
    end: toMinute(row.ends_at),
    assignees: row.shift_assignments.map((a) => ({
      user: a.user_id,
      position: a.position_key,
    })),
  }));
}

/**
 * The business's published shifts from `from` to `to` (calendar days, both
 * included), with the people on each by id: the shifts a list can be sent to
 * (`public.send_list` takes a published shift from today to a week ahead).
 * Under RLS: a draft week is left out by its own publish date, so a manager,
 * who also reads drafts, gets the same shifts as anyone.
 */
export async function getPublishedShifts(
  businessId: string,
  from: string,
  to: string,
): Promise<
  {
    id: string;
    day: string;
    name: string;
    start: string;
    end: string;
    pattern: string | null;
    people: string[];
  }[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    // bounded: eight days of published shifts, at most 200 a week
    // (raising that cap must page this).
    .from("schedule_shifts")
    .select(
      "id, day, name, starts_at, ends_at, pattern_key, shift_assignments (user_id), schedule_weeks!inner (schedule_published_at)",
    )
    .eq("business_id", businessId)
    .gte("day", from)
    .lte("day", to)
    .not("schedule_weeks.schedule_published_at", "is", null);
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    day: row.day,
    name: row.name,
    start: toMinute(row.starts_at),
    end: toMinute(row.ends_at),
    pattern: row.pattern_key,
    people: row.shift_assignments.map((a) => a.user_id).sort(),
  }));
}

/**
 * Whether the business ever published a week (`schedule_published_at`),
 * read under RLS: its staff, and the team viewing it in a staff role, while
 * scheduling is on (20261110000300_payroll_access.sql). A publish is never
 * taken back, so once true it stays true.
 */
export async function hasPublishedWeek(businessId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schedule_weeks")
    .select("id")
    .eq("business_id", businessId)
    .not("schedule_published_at", "is", null)
    .limit(1);
  if (error) throw error;
  return data.length > 0;
}

const StoredRows = z.array(
  z.object({
    id: z.string(),
    day: z.string(),
    name: z.string(),
    starts_at: z.string(),
    ends_at: z.string(),
    needed: z.int(),
    pattern_key: z.string().nullable(),
    assignees: z.array(
      z.object({ user: z.string(), position: z.string().nullable() }),
    ),
    seen: z.string(),
  }),
);

/**
 * A week's shifts with the people on each, as the signed-in person may
 * read them (RLS: managers and owners; everyone in the business once the
 * week is published), each with what was seen of it, in one read
 * (`public.week_shifts`). Day by day, earliest first; the people on a shift
 * by id. Until 20261115000100_week_in_place.sql reaches the project, the
 * table as before, with nothing seen.
 */
export async function getWeekSchedule(weekId: string): Promise<StoredShift[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("week_shifts", { week: weekId });
  if (error && !isMissingFunction(error)) throw error;
  const rows = error
    ? await weekScheduleBefore(weekId)
    : StoredRows.parse(data).map((row) => ({
        id: row.id,
        day: row.day,
        name: row.name,
        start: toMinute(row.starts_at),
        end: toMinute(row.ends_at),
        needed: row.needed,
        pattern: row.pattern_key,
        assignees: row.assignees,
        seen: row.seen,
      }));
  return rows
    .map((row) => ({
      ...row,
      assignees: [...row.assignees].sort((a, b) =>
        a.user.localeCompare(b.user),
      ),
    }))
    .sort((a, b) =>
      `${a.day}${a.start}${a.name}`.localeCompare(
        `${b.day}${b.start}${b.name}`,
      ),
    );
}

/** The week's shifts from the table, before `public.week_shifts`. */
async function weekScheduleBefore(weekId: string): Promise<StoredShift[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    // bounded: one week, at most 200 shifts (raising that cap must
    // page this).
    .from("schedule_shifts")
    .select(
      "id, day, name, starts_at, ends_at, needed, pattern_key, shift_assignments (user_id, position_key)",
    )
    .eq("week_id", weekId);
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    day: row.day,
    name: row.name,
    start: toMinute(row.starts_at),
    end: toMinute(row.ends_at),
    needed: row.needed,
    pattern: row.pattern_key,
    assignees: row.shift_assignments.map((a) => ({
      user: a.user_id,
      position: a.position_key,
    })),
    seen: null,
  }));
}

/**
 * What the builder read of a saved week, to send back with it: each shift's
 * id and what was seen of it. Null when any shift was read without it (a
 * project without 20261115000100_week_in_place.sql), so the week is replaced
 * as it was before.
 */
export function basisOf(shifts: readonly StoredShift[]): ShiftBasis | null {
  const basis: ShiftBasis = {};
  for (const shift of shifts) {
    if (shift.seen === null) return null;
    basis[shift.id] = shift.seen;
  }
  return basis;
}
