import { firstStepsHideRefusal } from "@domain/first-steps";
import { sameOriginRequest } from "@/app/origin";
import { rememberFirstStepsHidden } from "../../business-cookie";
import { currentMember } from "../../member";

/** Nothing to read in it, and never kept by a cache on the way. */
function answer(status: number): Response {
  return new Response(null, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * The owner hid the first steps on Today (`FirstStepsHides`): kept on this
 * device for the business open now (`rememberFirstStepsHidden`); Today, if
 * still on screen, is drawn again without them. It takes nothing from the
 * page: the business is the session's. Refused for anyone signed out,
 * viewing as someone or not its owner (`firstStepsHideRefusal`), who never
 * have "הסתרה", and for a request another site sends. A route rather than a
 * server action, for the reason `sendHide` (../hide-request.ts) gives: a
 * hide sent on leaving Today reaches another page's worker, and Next drops
 * the Set-Cookie of an action forwarded from there.
 */
export async function POST(request: Request): Promise<Response> {
  if (!(await sameOriginRequest(request))) return answer(403);
  const member = await currentMember();
  const refusal = firstStepsHideRefusal(member);
  const business = member?.membership?.business;
  if (refusal !== null || !business) {
    return answer(refusal === "signedOut" ? 401 : 403);
  }
  await rememberFirstStepsHidden(business.id);
  return answer(204);
}
