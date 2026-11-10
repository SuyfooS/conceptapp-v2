import { sendTestPush } from "@db/push/devices";
import { pushConfig } from "@db/push/env";
import { canWrite } from "@domain/view-as";
import { currentMember } from "@/app/(app)/member";
import { sameOriginRequest } from "@/app/origin";
import { pushSoon } from "../server";

type TestAnswer =
  | { ok: true }
  | {
      ok: false;
      failure: "noAccess" | "viewOnly" | "off" | "tooSoon" | "demo" | "failed";
    };

function answer(body: TestAnswer, status: number): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * "Send a test notification": a line for the signed-in person alone, which
 * goes to their devices like any other, at most one every 30 seconds. Real
 * businesses only: from a demo business, the line goes to the first of the
 * person's businesses whose lines reach a phone.
 */
export async function POST(request: Request): Promise<Response> {
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
  // In the business they are in now, when its lines reach their phone.
  switch (await sendTestPush(member.userId, member.membership.business.id)) {
    case "sent":
      pushSoon();
      return answer({ ok: true }, 200);
    case "tooSoon":
      return answer({ ok: false, failure: "tooSoon" }, 429);
    case "demo":
      return answer({ ok: false, failure: "demo" }, 409);
    default:
      return answer({ ok: false, failure: "failed" }, 500);
  }
}
