import { issueStationCode } from "@db/clock-stations";
import { hasSessionCookie } from "@db/supabase/server";
import type { StationCodeResponse } from "@domain/clock-station";
import { deviceStation } from "@/app/(app)/clock/station/station";
import { sameOriginRequest } from "@/app/origin";

/** Never kept by a cache on the way: each answer holds a live code. */
function answer(body: StationCodeResponse, status: number): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * A fresh code for the station this device is (its cookie's secret): its QR
 * code and digits, and when it expires in the database's time. A route
 * rather than a server action for the same reason as /clock/code/issue: a
 * station stays open across deploys, and an action's id changes with each
 * one. Asked only by the station's own page. Never while someone is signed in
 * on this device, valid session or not (`hasSessionCookie`): a station shows
 * codes beside nobody's account.
 */
export async function POST(request: Request): Promise<Response> {
  if (!(await sameOriginRequest(request))) {
    return answer({ ok: false, failure: "notStation" }, 403);
  }
  if (await hasSessionCookie()) {
    return answer({ ok: false, failure: "signedIn" }, 409);
  }
  let held: Awaited<ReturnType<typeof deviceStation>>;
  try {
    held = await deviceStation();
  } catch (error) {
    console.error("reading a station failed", (error as Error).message);
    return answer({ ok: false, failure: "failed" }, 500);
  }
  if (!held) return answer({ ok: false, failure: "notStation" }, 403);
  if (held.station.stopped) {
    return answer({ ok: false, failure: "stopped" }, 409);
  }

  const issued = await issueStationCode(held.token, held.station.businessId);
  if (issued.ok) return answer({ ok: true, ...issued.value }, 200);
  switch (issued.failure) {
    case "notStation":
      return answer({ ok: false, failure: "notStation" }, 403);
    case "failed":
      return answer({ ok: false, failure: "failed" }, 500);
    default:
      return answer({ ok: false, failure: issued.failure }, 409);
  }
}
