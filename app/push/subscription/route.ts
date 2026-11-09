import { removePushDevice, savePushDevice } from "@db/push/devices";
import { pushConfig, pushTestOrigin } from "@db/push/env";
import {
  deviceLabel,
  pushRemovalBody,
  pushSubscriptionBody,
} from "@domain/push";
import { pushEndpointOf } from "@domain/push-endpoint";
import { canWrite } from "@domain/view-as";
import { currentMember } from "@/app/(app)/member";
import { sameOriginRequest } from "@/app/origin";
import { forgetDeviceCookie, rememberDevice } from "../server";

type SubscriptionAnswer =
  | { ok: true }
  | {
      ok: false;
      failure: "noAccess" | "viewOnly" | "off" | "invalid" | "demo" | "failed";
    };

function answer(body: SubscriptionAnswer, status: number): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/** Who may change this browser's device: the signed-in person, as themselves. */
async function asPerson(
  request: Request,
): Promise<{ userId: string } | Response> {
  if (!(await sameOriginRequest(request))) {
    return answer({ ok: false, failure: "noAccess" }, 403);
  }
  if (!pushConfig()) return answer({ ok: false, failure: "off" }, 404);
  const member = await currentMember();
  if (!member?.membership) {
    return answer({ ok: false, failure: "noAccess" }, 401);
  }
  if (!canWrite(member.viewing)) {
    return answer({ ok: false, failure: "viewOnly" }, 403);
  }
  return { userId: member.userId };
}

async function bodyOf(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/**
 * Turn notifications on for this browser, or say it is still here: what
 * `PushSubscription.toJSON()` gives, from the push switch, from the app on
 * each visit (moving the device to whoever is signed in) and from the
 * service worker when the browser replaced its subscription on its own
 * (`replaces`). Only to a push service we know. Refused for someone only in
 * demo businesses (409). Remembers the device in a cookie, for sign-out.
 */
export async function POST(request: Request): Promise<Response> {
  const person = await asPerson(request);
  if (person instanceof Response) return person;
  const parsed = pushSubscriptionBody.safeParse(await bodyOf(request));
  if (!parsed.success) return answer({ ok: false, failure: "invalid" }, 400);
  const { endpoint, keys, replaces } = parsed.data;
  if (!pushEndpointOf(endpoint, { testOrigin: pushTestOrigin() })) {
    return answer({ ok: false, failure: "invalid" }, 400);
  }

  const saved = await savePushDevice(
    person.userId,
    { endpoint, p256dh: keys.p256dh, auth: keys.auth },
    // A coarse word only: the user agent itself is not kept.
    deviceLabel(request.headers.get("user-agent")),
    replaces,
  );
  if (!saved.ok) {
    return saved.failure === "demo"
      ? answer({ ok: false, failure: "demo" }, 409)
      : answer({ ok: false, failure: "failed" }, 500);
  }
  await rememberDevice(saved.device);
  return answer({ ok: true }, 200);
}

/** Turn notifications off for this browser: forget its device. */
export async function DELETE(request: Request): Promise<Response> {
  const person = await asPerson(request);
  if (person instanceof Response) return person;
  const parsed = pushRemovalBody.safeParse(await bodyOf(request));
  if (!parsed.success) return answer({ ok: false, failure: "invalid" }, 400);
  try {
    await removePushDevice(person.userId, { endpoint: parsed.data.endpoint });
  } catch (error) {
    console.error("forgetting a device failed", (error as Error).message);
    return answer({ ok: false, failure: "failed" }, 500);
  }
  await forgetDeviceCookie();
  return answer({ ok: true }, 200);
}
