import "server-only";
import { type ScheduledShift, weekSchedule } from "@domain/schedule";
import { z } from "zod";
import type { ScheduleWeek } from "./availability";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

export type WeekScheduleShift = ScheduledShift & { id: string };

/**
 * Replace a week's draft schedule (`public.save_week_schedule`); refused
 * once the week is published (use `publishWeekSchedule`). Validated here
 * first with the rules the database checks; `positionKeys` are the
 * business's positions from its scheduling settings. Runs with the secret
 * key: callers check the actor is the signed-in manager or owner and not
 * viewing as someone else. Returns the number of shifts saved.
 */
export async function saveWeekSchedule(
  actorId: string,
  week: ScheduleWeek,
  positionKeys: readonly string[],
  input: unknown,
): Promise<number> {
  const shifts = weekSchedule(week.startsOn, positionKeys).parse(input);
  const { data, error } = await createAdminClient().rpc("save_week_schedule", {
    actor: actorId,
    week: week.id,
    shifts,
  });
  if (error) throw new Error(`Could not save the schedule: ${error.message}`);
  return z.int().parse(data);
}

/**
 * Save a week's schedule and publish it to the whole team
 * (`public.publish_week_schedule`): the first time, or again with changes.
 * Same checks and callers as `saveWeekSchedule`. Returns the number of
 * shifts published.
 */
export async function publishWeekSchedule(
  actorId: string,
  week: ScheduleWeek,
  positionKeys: readonly string[],
  input: unknown,
): Promise<number> {
  const shifts = weekSchedule(week.startsOn, positionKeys).parse(input);
  const { data, error } = await createAdminClient().rpc(
    "publish_week_schedule",
    { actor: actorId, week: week.id, shifts },
  );
  if (error) {
    throw new Error(`Could not publish the schedule: ${error.message}`);
  }
  return z.int().parse(data);
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
 * A week's shifts with the people on each, as the signed-in person may
 * read them (RLS: managers and owners; everyone in the business once the
 * week is published). Day by day, earliest
 * first; the people on a shift by id.
 */
export async function getWeekSchedule(
  weekId: string,
): Promise<WeekScheduleShift[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schedule_shifts")
    .select(
      "id, day, name, starts_at, ends_at, needed, pattern_key, shift_assignments (user_id, position_key)",
    )
    .eq("week_id", weekId);
  if (error) throw error;
  return data
    .map((row) => ({
      id: row.id,
      day: row.day,
      name: row.name,
      start: toMinute(row.starts_at),
      end: toMinute(row.ends_at),
      needed: row.needed,
      pattern: row.pattern_key,
      assignees: row.shift_assignments
        .map((a) => ({ user: a.user_id, position: a.position_key }))
        .sort((a, b) => a.user.localeCompare(b.user)),
    }))
    .sort((a, b) =>
      `${a.day}${a.start}${a.name}`.localeCompare(
        `${b.day}${b.start}${b.name}`,
      ),
    );
}
