import { randomBytes, randomInt } from "node:crypto";
import type { StationCodeResponse } from "@domain/clock-station";
import { padShortCode } from "@domain/punch-code";
import { PUNCH_CODE_TTL_SECONDS } from "@domain/time-clock";

/** The refusals the twin shows while running, by `?state=`. */
const REFUSED = ["clockOff", "managerOnly"] as const;

// The demo's stand-in for /station/code: a fresh code and digits that nothing
// stores, so they open nothing anywhere, in the same shape; `?state=clockOff`
// or `?state=managerOnly` refuses, as the station's route does.
export async function POST(request: Request): Promise<Response> {
  const state = new URL(request.url).searchParams.get("state");
  const refused = REFUSED.find((failure) => failure === state);
  const now = Date.now();
  const body: StationCodeResponse = refused
    ? { ok: false, failure: refused }
    : {
        ok: true,
        code: randomBytes(16).toString("base64url"),
        short: padShortCode(randomInt(0, 1_000_000)),
        expiresAt: new Date(now + PUNCH_CODE_TTL_SECONDS * 1000).toISOString(),
        now: new Date(now).toISOString(),
      };
  return Response.json(body, {
    status: refused ? 409 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
