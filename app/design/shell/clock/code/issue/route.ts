import { randomBytes, randomInt } from "node:crypto";
import { type IssueResponse, padShortCode } from "@domain/punch-code";
import { PUNCH_CODE_TTL_SECONDS } from "@domain/time-clock";

// The demo's stand-in for /clock/code/issue: a fresh code and digits that
// nothing stores, so they open nothing anywhere, in the same shape.
export async function POST(): Promise<Response> {
  const now = Date.now();
  const body: IssueResponse = {
    ok: true,
    code: randomBytes(16).toString("base64url"),
    short: padShortCode(randomInt(0, 1_000_000)),
    expiresAt: new Date(now + PUNCH_CODE_TTL_SECONDS * 1000).toISOString(),
    now: new Date(now).toISOString(),
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
