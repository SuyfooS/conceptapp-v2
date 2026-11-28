import { databaseAnswers } from "@db/health";
import { connection } from "next/server";

const HEADERS = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

/**
 * For the uptime check (.github/workflows/uptime.yml; docs/production.md,
 * "בדיקה שהאתר באוויר"; closing the pilot, PR 11): 200 when the database
 * answers too, 503 when it doesn't, and nothing more, the same as /health:
 * no word of the database, a key, an error or a host, no cookie.
 *
 * The database is asked one cheap question (`public.ping()`) with the
 * publishable key and no session (`@db/health`), and an answer is kept a
 * minute in this server's memory, so a flood of requests asks it once a
 * minute at most; when it gave none, the next request asks again. Not
 * Next.js's `use cache`: on Vercel's functions its memory may not last
 * from one request to the next, and its stale answer, served while a new
 * one is fetched, could say the database answers after it stopped. The
 * response itself is `no-store`, as /health's, so no CDN keeps a copy that
 * answers with the functions down. `connection()` makes it answer at
 * request time, never from a copy made at build (cacheComponents is on).
 * Outside the proxy's matcher, so no session is read or renewed.
 */
export async function GET(): Promise<Response> {
  await connection();
  const answered = await databaseAnswers();
  return Response.json(
    { status: answered ? "ok" : "unavailable" },
    { status: answered ? 200 : 503, headers: HEADERS },
  );
}

/** The same answer with no body, for monitors that ask with HEAD. */
export async function HEAD(): Promise<Response> {
  await connection();
  const answered = await databaseAnswers();
  return new Response(null, {
    status: answered ? 200 : 503,
    headers: HEADERS,
  });
}
