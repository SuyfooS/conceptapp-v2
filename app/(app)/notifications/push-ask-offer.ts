import "server-only";
import { getNotificationPreferences } from "@db/notification-preferences";
import { ownDeviceKinds, pushAllowed } from "@db/push/devices";
import { pushConfig } from "@db/push/env";
import { isDemoBusiness } from "@domain/passive-sign-in";
import type { DeviceLabel } from "@domain/push";
import { currentMember } from "../member";
import { currentModules } from "../modules";
import { seePushAskAction } from "./preferences-actions";
import type { PushAskOffer } from "./push-ask";

/**
 * Whether the signed-in person may be offered notifications on the phone,
 * on Today's card (closing the pilot, PR 6) and after giving away a shift or
 * sending availability (plan §5.2), and how: only with push set up and the
 * module on, never while viewing as someone, never in a demo business, only
 * where the person's lines reach a phone (`pushAllowed`), and only until
 * they said "לא עכשיו" on Today or answered a moment's card (`askedAt`, on
 * every device of theirs). With it, the kinds of the devices they already
 * have it on, so an iPhone's Safari shows no steps once the app on its home
 * screen has them. Whether this browser can take them is the card's own
 * question. Null: nothing to offer; anything that can't be read offers
 * nothing too.
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
    isDemoBusiness(member.membership.business.slug) ||
    !enabled.includes("notifications")
  ) {
    return null;
  }
  // Both read together; the devices only once both allow an offer.
  const [allowed, preferences] = await Promise.all([
    pushAllowed(member.userId),
    getNotificationPreferences().catch(() => null),
  ]);
  if (allowed !== true || !preferences || preferences.askedAt !== null) {
    return null;
  }
  const devices = await ownDeviceKinds().catch((): DeviceLabel[] => []);
  return {
    publicKey: push.publicKey,
    devices,
    seen: seePushAskAction,
  };
}
