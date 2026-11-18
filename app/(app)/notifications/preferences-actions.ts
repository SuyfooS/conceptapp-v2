"use server";

import {
  seePushAsk,
  setNotificationPreferences,
} from "@db/notification-preferences";
import {
  notificationPreferenceChange,
  type PreferencesSaveResult,
} from "@domain/notifications";
import { canWrite } from "@domain/view-as";
import { refresh } from "next/cache";
import { currentMember } from "../member";

/**
 * The signed-in person changes one of their choices for the phone (a group,
 * quiet hours, the lock screen), saved at once. Never while the team views a
 * business as someone: their own choices included, nothing changes then.
 * Quiet hours are read on the clock of the business the person is in. The
 * change is checked here and again by the database, which writes only the
 * signed-in person's own row. Never logged.
 */
export async function setNotificationPreferencesAction(
  change: unknown,
): Promise<PreferencesSaveResult> {
  const member = await currentMember();
  if (!member) return { ok: false, failure: "failed" };
  if (!canWrite(member.viewing)) return { ok: false, failure: "viewOnly" };
  const parsed = notificationPreferenceChange.safeParse(change);
  if (!parsed.success) return { ok: false, failure: "invalid" };
  let result: PreferencesSaveResult;
  try {
    result = await setNotificationPreferences(
      parsed.data,
      member.membership?.business.place.timeZone,
    );
  } catch (error) {
    console.error(
      "notification choices failed",
      error instanceof Error ? error.message : "unknown",
    );
    return { ok: false, failure: "failed" };
  }
  if (result.ok) refresh();
  return result;
}

/**
 * The quiet card that offers notifications on the phone, after giving away a
 * shift or sending availability, was shown: it never comes again, on any of
 * the person's devices. Nothing while viewing as someone.
 */
export async function seePushAskAction(): Promise<void> {
  const member = await currentMember();
  if (!member || !canWrite(member.viewing)) return;
  if (await seePushAsk()) refresh();
}
