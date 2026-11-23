import { connection } from "next/server";

const HEADERS = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

/**
 * For an uptime monitor (docs/production.md, B11): 200 from the running
 * server, every time, and nothing more: no version, no setting, no data, no
 * cookie. `connection()` makes it answer at request time, never from a copy
 * made at build, which a CDN would serve even with the functions down. It
 * doesn't ask the database. Outside the proxy's matcher, so no session is
 * read or renewed.
 */
export async function GET(): Promise<Response> {
  await connection();
  return Response.json({ status: "ok" }, { headers: HEADERS });
}

/** The same answer with no body, for monitors that ask with HEAD. */
export async function HEAD(): Promise<Response> {
  await connection();
  return new Response(null, { status: 200, headers: HEADERS });
}
