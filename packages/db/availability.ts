import "server-only";
import {
  type AvailabilityRange,
  availabilitySubmission,
} from "@domain/availability";
import { z } from "zod";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

export type ScheduleWeek = { id: string; startsOn: string; dueAt: string };

export type Availability = {
  userId: string;
  note: string | null;
  submittedAt: string;
  updatedAt: string;
  ranges: AvailabilityRange[];
};

/**
 * Open the week starting on `weekStart` for availability, or return the
 * one already open (`public.open_schedule_week`). Runs with the secret
 * key; the database refuses a start on the wrong weekday or a business
 * with scheduling off. `dueAt` comes from `availabilityDueAt`.
 */
export async function openWeek(
  businessId: string,
  weekStart: string,
  dueAt: Date,
): Promise<string> {
  const { data, error } = await createAdminClient().rpc("open_schedule_week", {
    business: businessId,
    week_start: weekStart,
    due_at: dueAt.toISOString(),
  });
  if (error) throw new Error(`Could not open the week: ${error.message}`);
  return z.uuid().parse(data);
}

/**
 * Save the actor's availability for a week, replacing what they sent
 * before (`public.submit_availability`). Validated here first with the
 * same rules the database checks. Runs with the secret key: callers check
 * the actor is the signed-in person and not viewing as someone else.
 */
export async function saveAvailability(
  actorId: string,
  week: ScheduleWeek,
  input: unknown,
): Promise<string> {
  const { ranges, note } = availabilitySubmission(week.startsOn).parse(input);
  const { data, error } = await createAdminClient().rpc("submit_availability", {
    actor: actorId,
    week: week.id,
    ranges,
    note,
  });
  if (error) throw new Error(`Could not save availability: ${error.message}`);
  return z.uuid().parse(data);
}

/** The business's week starting on `startsOn`, if it is open (RLS). */
export async function getWeek(
  businessId: string,
  startsOn: string,
): Promise<ScheduleWeek | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schedule_weeks")
    .select("id, starts_on, availability_due_at")
    .eq("business_id", businessId)
    .eq("starts_on", startsOn)
    .maybeSingle();
  if (error) throw error;
  return data
    ? { id: data.id, startsOn: data.starts_on, dueAt: data.availability_due_at }
    : null;
}

/** "HH:MM:SS" from Postgres to "HH:MM". */
const toMinute = (time: string) => time.slice(0, 5);

/**
 * Availability for a week as the signed-in person may read it (RLS): a
 * worker gets their own, a manager or owner everyone's. Ranges come
 * earliest first.
 */
export async function getWeekAvailability(
  weekId: string,
): Promise<Availability[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("availability_submissions")
    .select(
      "user_id, note, submitted_at, updated_at, availability_ranges (day, starts_at, ends_at)",
    )
    .eq("week_id", weekId);
  if (error) throw error;
  return data.map((row) => ({
    userId: row.user_id,
    note: row.note,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
    ranges: row.availability_ranges
      .map((range) => ({
        day: range.day,
        start: toMinute(range.starts_at),
        end: toMinute(range.ends_at),
      }))
      .sort((a, b) => `${a.day}${a.start}`.localeCompare(`${b.day}${b.start}`)),
  }));
}

export type BusinessPlace = {
  latitude: number | null;
  longitude: number | null;
  timeZone: string;
};

/** Where the business is, for its Shabbat times and its calendar (RLS). */
export async function getBusinessPlace(
  businessId: string,
): Promise<BusinessPlace> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("businesses")
    .select("latitude, longitude, timezone")
    .eq("id", businessId)
    .single();
  if (error) throw error;
  return {
    latitude: data.latitude,
    longitude: data.longitude,
    timeZone: data.timezone,
  };
}
