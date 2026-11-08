import { issuePunchCode } from "@db/time-clock";
import type { IssueResponse } from "@domain/punch-code";
import { canSeeTeam } from "@domain/team";
import { sameOriginRequest } from "@/app/origin";
import { clockAccess } from "../../clock";

/** Never kept by a cache on the way: each answer holds a live code. */
function answer(body: IssueResponse, status: number): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * A fresh code for the code screen of an owner's or manager's phone: its QR
 * code and digits, and when it expires in the database's time. A route rather
 * than a server action, because a phone left showing the code stays open across
 * deploys, and an action's id changes with each one. Asked only by the app's
 * own page; the database checks who is asking again.
 */
export async function POST(request: Request): Promise<Response> {
  if (!(await sameOriginRequest(request))) {
    return answer({ ok: false, failure: "noAccess" }, 403);
  }
  const access = await clockAccess();
  if (!access || !canSeeTeam(access.role)) {
    return answer({ ok: false, failure: "noAccess" }, 403);
  }
  if (access.viewOnly) return answer({ ok: false, failure: "viewOnly" }, 403);

  const issued = await issuePunchCode(access.userId, access.businessId);
  if (issued.ok) return answer({ ok: true, ...issued.value }, 200);
  switch (issued.failure) {
    case "stationsOnly":
      return answer({ ok: false, failure: "stationsOnly" }, 409);
    // The clock being off reads the same as no access.
    case "noAccess":
      return answer({ ok: false, failure: "noAccess" }, 403);
    default:
      return answer({ ok: false, failure: "failed" }, 500);
  }
}
