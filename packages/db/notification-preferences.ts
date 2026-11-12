import "server-only";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferenceChange,
  type NotificationPreferences,
  type PreferencesSaveResult,
  readNotificationPreferences,
} from "@domain/notifications";
import { isMissingFunction } from "./missing";
import { isMissingTable } from "./notifications";
import { createClient } from "./supabase/server";

/**
 * Each person's own choices for their phone (notifications part 3): the
 * groups that don't reach it, quiet hours, and what the lock screen shows.
 * Read and written under the signed-in person's own session, never with the
 * secret key, which the table refuses: nothing here takes a person's id, so
 * it can only ever be the caller's own. Callers make sure the person isn't
 * viewing a business as someone (the database refuses that too). Everything
 * here waits quietly for its migration: until it reaches a project, everyone
 * has the defaults and nothing is saved.
 */

const COLUMNS =
  "push_off, quiet_from, quiet_to, time_zone, previews, push_asked_at";

/** A fresh copy of the defaults, so no caller changes them for another. */
const defaults = (): NotificationPreferences => ({
  ...DEFAULT_NOTIFICATION_PREFERENCES,
  pushOff: [],
});

/**
 * The signed-in person's choices, or the defaults when they made none (and
 * before the migration). Throws on anything else.
 */
export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification_preferences")
    .select(COLUMNS)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return defaults();
    throw error;
  }
  if (!data) return defaults();
  return readNotificationPreferences({
    pushOff: data.push_off,
    quietFrom: data.quiet_from,
    quietTo: data.quiet_to,
    timeZone: data.time_zone,
    previews: data.previews,
    askedAt: data.push_asked_at,
  });
}

/** The database's arguments for one change. */
function argumentsFor(change: NotificationPreferenceChange, timeZone?: string) {
  switch (change.kind) {
    case "group":
      return { phone_group: change.group, phone_on: change.on };
    case "previews":
      return { lock_previews: change.on };
    case "quiet":
      return change.hours
        ? {
            quiet_on: true,
            quiet_start: change.hours.from,
            quiet_stop: change.hours.to,
            // Quiet hours are read on the clock of the business the person
            // set them in.
            ...(timeZone ? { tz_name: timeZone } : {}),
          }
        : { quiet_on: false };
  }
}

/**
 * Save one change for the signed-in person, at once
 * (public.set_notification_preferences). What waits for their phone follows
 * it there. Answers the choices as they now stand, or why nothing was saved:
 * `viewOnly` while viewing as someone (42501), `invalid` for a change that
 * can't be (22023), `failed` for anything else, before the migration too.
 */
export async function setNotificationPreferences(
  change: NotificationPreferenceChange,
  timeZone?: string,
): Promise<PreferencesSaveResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "set_notification_preferences",
    argumentsFor(change, timeZone),
  );
  if (error) {
    if (error.code === "42501") return { ok: false, failure: "viewOnly" };
    if (error.code === "22023") return { ok: false, failure: "invalid" };
    if (!isMissingFunction(error)) {
      console.error("saving notification choices failed", error.message);
    }
    return { ok: false, failure: "failed" };
  }
  const row = data?.[0];
  if (!row) return { ok: false, failure: "failed" };
  return {
    ok: true,
    preferences: readNotificationPreferences({
      pushOff: row.off_groups,
      quietFrom: row.quiet_starts,
      quietTo: row.quiet_stops,
      timeZone: row.zone_name,
      previews: row.shows_previews,
      askedAt: row.asked_at,
    }),
  };
}

/**
 * The signed-in person was offered notifications on the phone, after giving
 * away a shift or sending availability (public.see_push_ask): kept from the
 * first time, so they are never asked again. Returns whether it was kept;
 * before the migration, never.
 */
export async function seePushAsk(): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("see_push_ask");
  if (error) {
    if (!isMissingFunction(error) && error.code !== "42501") {
      console.error("noting the ask failed", error.message);
    }
    return false;
  }
  return true;
}
