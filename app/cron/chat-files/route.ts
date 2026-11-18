import { cleanChatFiles } from "@db/chat-files";
import { hasCronSecret } from "@db/push/env";
import { after } from "next/server";

/** Long enough for a run's files, a batch at a time, well inside Vercel's limit. */
export const maxDuration = 60;

/**
 * Chat's files that are due go (C4): past their business's days, the oldest
 * past its space, a removed message's once its undo is over, a reservation
 * never sent, and what nothing points at. Called by the database's chat job
 * every 10 minutes while one is due (`private.chat_tick`, through pg_net), and
 * by hand with GET. Only with `Authorization: Bearer <CRON_SECRET>`, compared
 * in constant time, as /cron/list-photos. It answers at once (202) and removes
 * after, so the caller's five-second timeout never decides whether the
 * clean-up runs. The files go through Storage with the secret key
 * (`cleanChatFiles`), and their messages say the file is no longer kept.
 * Outside the sign-in guard. No agent calls it on the hosted project
 * (docs/AGENT.md): it deletes people's files.
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
      await cleanChatFiles();
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code: unknown }).code)
          : "without a code";
      console.error("the chat files' clean-up failed", code);
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
