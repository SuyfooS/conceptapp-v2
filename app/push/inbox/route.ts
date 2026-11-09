import { getPushedLines, PUSHED_LINES_READ } from "@db/notifications";
import { notePushFetch, notePushSignedOut } from "@db/push/devices";
import { buildInbox } from "@domain/notifications";
import {
  type PushInboxAnswer,
  type PushNotice,
  pushBatch,
  pushInboxBody,
} from "@domain/push";
import { currentMember } from "@/app/(app)/member";
import { baseWording, wordingFrom } from "@/app/(app)/wording";
import { sameOriginRequest } from "@/app/origin";
import {
  plainNotice,
  pushNotice,
  signedOutNotice,
  summaryNotice,
} from "../words";

function answer(body: PushInboxAnswer, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * What a phone shows when a push arrives. Pushes carry nothing, so the
 * service worker asks here, under the session of whoever is signed in on the
 * phone, with the endpoint it was woken on. Only that person's own lines that
 * went to that device since it last asked, in the business the app opens for
 * them, which is never a demo: up to three one by one, more as one summary.
 * Signed in as someone else on the device, a line that says nothing; signed
 * out, a line saying to sign in again, and the third time in a row the device
 * is forgotten. Outside the sign-in guard: it never redirects a service
 * worker, and renews an expired session itself.
 */
export async function POST(request: Request): Promise<Response> {
  if (!(await sameOriginRequest(request))) {
    return answer(
      { notifications: [plainNotice(baseWording)], unread: null },
      403,
    );
  }
  let raw: unknown = null;
  try {
    raw = await request.json();
  } catch {
    raw = null;
  }
  const parsed = pushInboxBody.safeParse(raw);
  const endpoint = parsed.success ? parsed.data.endpoint : null;

  const member = await currentMember();
  if (!member) {
    if (endpoint) {
      await notePushSignedOut(endpoint).catch((error: Error) =>
        console.error("noting a signed-out phone failed", error.message),
      );
    }
    return answer({
      notifications: [signedOutNotice(baseWording)],
      unread: null,
    });
  }
  const membership = member.membership;
  const plain = (): Response =>
    answer({ notifications: [plainNotice(baseWording)], unread: null });
  if (!membership || member.viewing) return plain();

  const fetched = await notePushFetch(member.userId, endpoint);
  // Someone else's device, or lines that reach no phone; and never another
  // business than the one the app opens.
  if (!fetched || fetched.businessId !== membership.business.id) {
    return plain();
  }

  const wording = wordingFrom(membership.business.wording);
  const timeZone = membership.business.place.timeZone;
  // A browser that wouldn't say which device it is gets the newest line only.
  const { lines, again, lookups } = await getPushedLines(
    membership.business.id,
    member.userId,
    fetched.since,
    endpoint ? PUSHED_LINES_READ : 1,
  );
  const entries = buildInbox(lines, lookups, member.userId);
  const batch = pushBatch(entries);
  const notifications: PushNotice[] =
    batch.kind === "summary"
      ? [summaryNotice(batch.count, wording)]
      : batch.lines.map((entry) => pushNotice(entry, wording, timeZone, again));
  return answer({
    notifications:
      notifications.length > 0 ? notifications : [plainNotice(wording)],
    unread: member.unread.all,
  });
}
