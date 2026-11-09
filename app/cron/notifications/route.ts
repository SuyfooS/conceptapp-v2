import { deliverDuePushes } from "@db/push/deliver";
import { hasCronSecret, pushConfig } from "@db/push/env";
import { after } from "next/server";

/** Long enough for a few claims of pushes, well inside Vercel's limit. */
export const maxDuration = 30;

/**
 * Send what is due: called once a minute by the database while something
 * waits (`private.notifications_tick`, through pg_net), and by hand with GET.
 * Only with `Authorization: Bearer <CRON_SECRET>`, compared in constant time.
 * It answers at once (202) and sends after, so the caller's five-second
 * timeout never decides whether the sending runs. Outside the sign-in guard.
 */
async function run(request: Request): Promise<Response> {
  if (!hasCronSecret(request.headers.get("authorization"))) {
    return new Response(null, {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (pushConfig()) {
    after(async () => {
      await deliverDuePushes();
    });
  }
  return new Response(null, {
    status: 202,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request): Promise<Response> {
  return run(request);
}

export async function GET(request: Request): Promise<Response> {
  return run(request);
}
