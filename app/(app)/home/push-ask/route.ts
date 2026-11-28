import { seePushAsk } from "@db/notification-preferences";
import { canWrite } from "@domain/view-as";
import { sameOriginRequest } from "@/app/origin";
import { currentMember } from "../../member";

/** Nothing to read in it, and never kept by a cache on the way. */
function answer(status: number): Response {
  return new Response(null, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * "לא עכשיו" on Today's card that offers notifications on the phone (closing
 * the pilot, PR 6), once its "ביטול" went (`PushAskToday`): kept as
 * `seePushAskAction` keeps it (`push_asked_at`), so neither card comes again
 * on any of the person's devices; 204 once kept, 500 when it wasn't. Today,
 * if still on screen, is drawn again by the card. It takes nothing from the
 * page: the person is the session's. Refused for anyone signed out (401),
 * viewing as someone, who is never offered it, and for a request another
 * site sends (403). A route rather than a server action, for the reason
 * `sendHide` (../hide-request.ts) gives: the write is held for its undo and
 * can go as the page is hidden or closed, which only a request with
 * `keepalive` survives.
 */
export async function POST(request: Request): Promise<Response> {
  if (!(await sameOriginRequest(request))) return answer(403);
  const member = await currentMember();
  if (!member?.membership) return answer(401);
  if (!canWrite(member.viewing)) return answer(403);
  return answer((await seePushAsk()) ? 204 : 500);
}
