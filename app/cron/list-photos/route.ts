import { cleanListPhotos } from "@db/list-photos";
import { hasCronSecret } from "@db/push/env";
import { after } from "next/server";

/** Long enough for a day's photos, a batch at a time, well inside Vercel's limit. */
export const maxDuration = 60;

/**
 * The lists' photos past the days their business keeps them go (L6): called
 * once a day by the database while one is due (`private.list_photos_tick`,
 * the job `list-photos`, through pg_net), and by hand with GET. Only with
 * `Authorization: Bearer <CRON_SECRET>`, compared in constant time, as
 * /cron/notifications. It answers at once (202) and removes after, so the
 * caller's five-second timeout never decides whether the clean-up runs. The
 * files go through Storage with the secret key (`cleanListPhotos`), and their
 * items say the photo is no longer kept. Outside the sign-in guard.
 */
async function run(request: Request): Promise<Response> {
  if (!hasCronSecret(request.headers.get("authorization"))) {
    return new Response(null, {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }
  after(async () => {
    try {
      await cleanListPhotos();
    } catch (error) {
      console.error(
        "the list photos' clean-up failed",
        error instanceof Error ? error.message : "unknown",
      );
    }
  });
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
