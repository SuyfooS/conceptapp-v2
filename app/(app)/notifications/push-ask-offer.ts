import "server-only";
import { getNotificationPreferences } from "@db/notification-preferences";
import { pushAllowed } from "@db/push/devices";
import { pushConfig } from "@db/push/env";
import { currentMember } from "../member";
import { currentModules } from "../modules";
import { seePushAskAction } from "./preferences-actions";
import type { PushAskOffer } from "./push-ask";

/**
 * Whether the signed-in person may be offered notifications on the phone
 * after giving away a shift or sending availability (plan §5.2), and how:
 * only with push set up and the module on, never while viewing as someone,
 * only in a business whose lines reach a phone (never a demo), and only until
 * they were offered once (`askedAt`). Whether this browser can take them is
 * the card's own question. Null: nothing to offer; anything that can't be
 * read offers nothing too.
 */
export async function currentPushAsk(): Promise<PushAskOffer | null> {
  const push = pushConfig();
  if (!push) return null;
  const [member, enabled] = await Promise.all([
    currentMember(),
    currentModules(),
  ]);
  if (
    !member?.membership ||
    member.viewing ||
    !enabled.includes("notifications")
  ) {
    return null;
  }
  if ((await pushAllowed(member.userId)) !== true) return null;
  const preferences = await getNotificationPreferences().catch(() => null);
  if (!preferences || preferences.askedAt !== null) return null;
  return { publicKey: push.publicKey, seen: seePushAskAction };
}
