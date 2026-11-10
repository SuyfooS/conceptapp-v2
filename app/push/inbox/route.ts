import { getPushedLines, PUSHED_LINES_READ } from "@db/notifications";
import { notePushFetch, notePushSignedOut } from "@db/push/devices";
import type { OwnBusiness } from "@db/session";
import { buildInbox, type NotificationEntry } from "@domain/notifications";
import {
  type PushInboxAnswer,
  type PushNotice,
  pushBatch,
  pushInboxBody,
  summaryPlace,
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

/** One business's lines for the phone, with what they need to be said. */
type Read = {
  own: OwnBusiness;
  entries: NotificationEntry[];
  /** The latest line shown again, not something new. */
  again: boolean;
};

/**
 * What a phone shows when a push arrives. Pushes carry nothing, so the
 * service worker asks here, under the session of whoever is signed in on the
 * phone, with the endpoint it was woken on. Only that person's own lines that
 * went to that device since it last asked, from every business of theirs
 * whose lines reach a phone (payroll P3b), which is never a demo, each in its
 * own business's words and clock: up to three one by one, more as one
 * summary. Each line opens through /notifications/open, which switches to
 * the line's business first; a summary opens the inbox when every line is
 * from the business the person is in, else Home, which lists each business
 * with what is unread there. Signed in as someone else on the device, a line
 * that says nothing; signed out, a line saying to sign in again, and the
 * third time in a row the device is forgotten. Outside the sign-in guard: it
 * never redirects a service worker, and renews an expired session itself.
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
  // Someone else's device, or lines that reach no phone; and never a
  // business the person isn't in now.
  const pushing = fetched
    ? member.businesses.filter((own) =>
        fetched.businessIds.includes(own.business.id),
      )
    : [];
  if (!fetched || pushing.length === 0) return plain();

  // A browser that wouldn't say which device it is gets the newest line only.
  const max = endpoint ? PUSHED_LINES_READ : 1;
  const reads: Read[] = await Promise.all(
    pushing.map(async (own) => {
      const { lines, again, lookups } = await getPushedLines(
        own.business.id,
        member.userId,
        fetched.since,
        max,
      );
      return { own, entries: buildInbox(lines, lookups, member.userId), again };
    }),
  );
  // What is new, from every business; when nothing is (two pushes raced,
  // and the first fetch showed both), the newest line shown again, once.
  const fresh = reads.filter((read) => !read.again && read.entries.length > 0);
  const shown: { own: OwnBusiness; entry: NotificationEntry }[] =
    fresh.length > 0
      ? fresh.flatMap((read) =>
          read.entries.map((entry) => ({ own: read.own, entry })),
        )
      : reads
          .flatMap((read) =>
            read.entries.map((entry) => ({ own: read.own, entry })),
          )
          .sort((a, b) => b.entry.at.localeCompare(a.entry.at))
          .slice(0, 1);
  shown.sort((a, b) => b.entry.at.localeCompare(a.entry.at));
  const again = fresh.length === 0;

  const wording = wordingFrom(membership.business.wording);
  const batch = pushBatch(shown);
  const notifications: PushNotice[] =
    batch.kind === "summary"
      ? [
          // The inbox lists the business the person is in now only: lines
          // from another of theirs open Home, which counts each business's.
          summaryNotice(
            batch.count,
            wording,
            summaryPlace(
              shown.map(({ own }) => own.business.id),
              membership.business.id,
            ),
          ),
        ]
      : batch.lines.map(({ own, entry }) =>
          pushNotice(
            entry,
            wordingFrom(own.business.wording),
            own.business.place.timeZone,
            again,
          ),
        );
  // The home-screen icon counts what is unread in all of them.
  const unread = member.businesses.reduce(
    (sum, own) => sum + own.unread.all,
    0,
  );
  return answer({
    notifications:
      notifications.length > 0 ? notifications : [plainNotice(wording)],
    unread,
  });
}
