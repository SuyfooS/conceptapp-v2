import "server-only";
import type { DeviceLabel } from "@domain/push";
import { isMissingFunction } from "../missing";
import { createAdminClient } from "../supabase/admin";

/**
 * Each person's devices, written with the secret key for `actorId`, whom the
 * caller has checked is the signed-in person and not viewing as someone. The
 * endpoint has been checked against the push services we know first
 * (@domain/push-endpoint). Everything here waits quietly for its migration:
 * before it reaches a project, nobody is offered the switch.
 */

const DEMO = "55000";

/**
 * Whether the person can turn notifications on for a phone: false in a demo
 * business, null when it can't be told (before the migration, or an error),
 * and then nothing is offered.
 */
export async function pushAllowed(userId: string): Promise<boolean | null> {
  const { data, error } = await createAdminClient().rpc("push_allowed", {
    person: userId,
  });
  if (error) {
    // Never a broken page: the switch is just not offered.
    if (!isMissingFunction(error)) {
      console.error("asking whether push is allowed failed", error.message);
    }
    return null;
  }
  return data === true;
}

export type SaveDeviceResult =
  | { ok: true; device: string }
  | { ok: false; failure: "demo" | "failed" };

/**
 * Save this device for the person, or move it to them. `replaces` is the
 * endpoint a browser replaced on its own: forgotten first, when it is theirs.
 */
export async function savePushDevice(
  actorId: string,
  subscription: { endpoint: string; p256dh: string; auth: string },
  label: DeviceLabel,
  replaces?: string,
): Promise<SaveDeviceResult> {
  const admin = createAdminClient();
  if (replaces && replaces !== subscription.endpoint) {
    await removePushDevice(actorId, { endpoint: replaces });
  }
  const { data, error } = await admin.rpc("save_push_subscription", {
    actor: actorId,
    push_endpoint: subscription.endpoint,
    key_p256dh: subscription.p256dh,
    key_auth: subscription.auth,
    device_label: label,
  });
  if (error) {
    if (error.code === DEMO) return { ok: false, failure: "demo" };
    if (!isMissingFunction(error)) {
      console.error("saving a device failed", error.message);
    }
    return { ok: false, failure: "failed" };
  }
  return data ? { ok: true, device: data } : { ok: false, failure: "failed" };
}

/** Forget one of the person's devices, by its id or its endpoint. */
export async function removePushDevice(
  actorId: string,
  by: { device?: string; endpoint?: string },
): Promise<boolean> {
  if (!by.device && !by.endpoint) return false;
  const { data, error } = await createAdminClient().rpc(
    "remove_push_subscription",
    {
      actor: actorId,
      ...(by.device ? { device: by.device } : {}),
      ...(by.endpoint ? { push_endpoint: by.endpoint } : {}),
    },
  );
  if (error) {
    if (isMissingFunction(error)) return false;
    throw error;
  }
  return data === true;
}

/**
 * A phone signed in as `actorId` asks what to show: the business whose lines
 * it shows, and the moment after which they are new to it. Null when it may
 * show nothing of theirs (the device is someone else's, or their lines reach
 * no phone).
 */
export async function notePushFetch(
  actorId: string,
  endpoint: string | null,
): Promise<{ since: string; businessId: string } | null> {
  const { data, error } = await createAdminClient().rpc("note_push_fetch", {
    actor: actorId,
    ...(endpoint ? { push_endpoint: endpoint } : {}),
  });
  if (error) {
    if (isMissingFunction(error)) return null;
    throw error;
  }
  const row = data?.[0];
  return row ? { since: row.since, businessId: row.business } : null;
}

/** A phone asked what to show with nobody signed in. */
export async function notePushSignedOut(endpoint: string): Promise<void> {
  const { error } = await createAdminClient().rpc("note_push_signed_out", {
    push_endpoint: endpoint,
  });
  if (error && !isMissingFunction(error)) throw error;
}

export type TestPushResult = "sent" | "tooSoon" | "demo" | "failed";

/** "Send a test notification": a line for the person alone. */
export async function sendTestPush(actorId: string): Promise<TestPushResult> {
  const { data, error } = await createAdminClient().rpc("send_test_push", {
    actor: actorId,
  });
  if (error) {
    if (error.code === DEMO) return "demo";
    if (!isMissingFunction(error)) {
      console.error("a test notification failed", error.message);
    }
    return "failed";
  }
  return data ? "sent" : "tooSoon";
}
