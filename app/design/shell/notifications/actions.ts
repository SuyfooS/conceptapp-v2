"use server";

import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  notificationPreferenceChange,
  type PreferencesSaveResult,
} from "@domain/notifications";

// Stand-in for saving a choice on the design demo: the change must be one the
// screen can send, and nothing is stored. The screen keeps what it shows.
export async function demoSaveNotificationPreferences(
  change: unknown,
): Promise<PreferencesSaveResult> {
  if (!notificationPreferenceChange.safeParse(change).success) {
    return { ok: false, failure: "invalid" };
  }
  return {
    ok: true,
    preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, pushOff: [] },
  };
}
